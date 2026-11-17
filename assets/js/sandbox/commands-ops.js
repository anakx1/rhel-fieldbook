/* ==========================================================================
   RHEL Fieldbook — Level 02 operator commands
   LVM, swap, scheduled work, repository evidence, network profiles.
   ========================================================================== */

(function (root) {
  'use strict';

  var SB = root.RHEL_SANDBOX;
  var C = SB.commands;
  var VFS = SB.vfs;
  var Machine = SB.machine;
  var reg = C.register;

  function numberSize(value) {
    return C.parseSize(String(value || '').replace(/[Bb]$/, '')) || 0;
  }

  function blockRecord(sys, path) {
    var name = path.split('/').pop();
    return (sys.blockDevices || []).filter(function (item) { return item.name === name; })[0] || null;
  }

  function evidence(sys, key, value) {
    sys.evidence = sys.evidence || {};
    sys.evidence[key] = value === undefined ? true : value;
  }

  function normalizePath(ctx, raw) {
    return VFS.normalize(raw, ctx.sys.cwd, ctx.user, ctx.sys);
  }

  reg('parted', function (ctx, args) {
    var denied = C.requireRoot(ctx);
    if (denied) return denied;
    var values = args.filter(function (arg) { return arg !== '-s' && arg !== '--script'; });
    var device = values.shift();
    var action = values.shift();
    if (!device || !action) return C.fail('parted: usage: parted -s DEVICE mklabel gpt | mkpart ...', 1);
    var sys = ctx.sys;
    var path = normalizePath(ctx, device);
    var node = sys.fs[path];
    if (!node || (node.type !== 'block' && node.type !== 'file')) return C.fail('parted: cannot open ' + device + ': No such device', 1);
    var record = blockRecord(sys, path);
    if (!record) return C.fail('parted: ' + device + ': unrecognised disk label', 1);
    if (action === 'mklabel') {
      var label = values[0] || 'gpt';
      record.label = label;
      record.children = record.children || [];
      evidence(sys, 'storage:parted');
      return C.ok('Information: You may need to update /etc/fstab.\n');
    }
    if (action === 'mkpart') {
      var partType = values[0];
      var fsType = values[1];
      var start = values[2];
      var end = values[3];
      if (!record.children) record.children = [];
      var index = record.children.length + 1;
      var childName = record.name + index;
      var size = record.size;
      var child = { name: childName, size: size, type: 'part', fstype: '', mountpoint: '', uuid: '' };
      record.children.push(child);
      var partitionPath = '/dev/' + childName;
      if (!sys.fs[partitionPath]) {
        var part = { type: 'block', mode: 432, uid: 0, gid: 6, context: 'fixed_disk_device_t', inode: C.nextInode(sys), mtime: new Date().toISOString(), atime: new Date().toISOString(), ctime: new Date().toISOString(), size: 0 };
        sys.fs[partitionPath] = part;
      }
      if (record.fstype === '') record.fstype = '';
      evidence(sys, 'storage:parted');
      return C.ok('Information: You may need to update /etc/fstab.\n');
    }
    return C.fail('parted: unsupported action ' + action + ' in the sandbox', 1);
  });

  reg('pvcreate', function (ctx, args) {
    var denied = C.requireRoot(ctx);
    if (denied) return denied;
    var values = args.filter(function (arg) { return arg.charAt(0) !== '-'; });
    if (!values.length) return C.fail('pvcreate: no device specified', 1);
    var sys = ctx.sys;
    sys.lvm = sys.lvm || { pvs: [], vgs: [], lvs: [] };
    var out = [];
    for (var i = 0; i < values.length; i++) {
      var path = normalizePath(ctx, values[i]);
      var node = sys.fs[path];
      if (!node || (node.type !== 'block' && node.type !== 'file')) return C.fail('  Device ' + values[i] + ' not found.', 5);
      if (sys.lvm.pvs.some(function (pv) { return pv.name === path; })) {
        out.push('  Physical volume "' + path + '" successfully created.');
        continue;
      }
      var record = blockRecord(sys, path);
      var size = record ? record.size : C.humanSize(node.size || 0).replace('B', '');
      node.fsType = 'LVM2_member';
      sys.lvm.pvs.push({ name: path, vg: '', size: size, free: size });
      out.push('  Physical volume "' + path + '" successfully created.');
    }
    evidence(sys, 'lvm:pvcreate');
    return C.ok(out.join('\n') + '\n');
  });

  reg('vgcreate', function (ctx, args) {
    var denied = C.requireRoot(ctx);
    if (denied) return denied;
    var values = args.filter(function (arg) { return arg.charAt(0) !== '-'; });
    var name = values.shift();
    if (!name || !values.length) return C.fail('vgcreate: usage: vgcreate VG PV...', 1);
    var sys = ctx.sys;
    sys.lvm = sys.lvm || { pvs: [], vgs: [], lvs: [] };
    if (sys.lvm.vgs.some(function (vg) { return vg.name === name; })) return C.fail('  Volume group "' + name + '" already exists', 5);
    var pvs = values.map(function (raw) { return normalizePath(ctx, raw); });
    for (var i = 0; i < pvs.length; i++) {
      if (!sys.lvm.pvs.some(function (pv) { return pv.name === pvs[i]; })) return C.fail('  Device ' + pvs[i] + ' not found or not a PV.', 5);
    }
    var size = 0;
    pvs.forEach(function (path) {
      var pv = sys.lvm.pvs.filter(function (item) { return item.name === path; })[0];
      pv.vg = name;
      size += numberSize(pv.size);
    });
    var sizeText = C.humanSize(size).replace('B', '');
    sys.lvm.vgs.push({ name: name, size: sizeText, sizeValue: size, free: sizeText, freeValue: size, pvs: pvs });
    evidence(sys, 'lvm:vgcreate');
    return C.ok('  Volume group "' + name + '" successfully created\n');
  });

  reg('lvcreate', function (ctx, args) {
    var denied = C.requireRoot(ctx);
    if (denied) return denied;
    var name = null;
    var size = null;
    var vgName = null;
    for (var i = 0; i < args.length; i++) {
      if (args[i] === '-n' || args[i] === '--name') { name = args[++i]; continue; }
      if (args[i] === '-L' || args[i] === '--size') { size = args[++i]; continue; }
      if (args[i].charAt(0) !== '-') vgName = args[i];
    }
    if (!name || !size || !vgName) return C.fail('lvcreate: usage: lvcreate -n NAME -L SIZE VG', 1);
    var sys = ctx.sys;
    var vg = (sys.lvm.vgs || []).filter(function (item) { return item.name === vgName; })[0];
    if (!vg) return C.fail('  Volume group "' + vgName + '" not found', 5);
    var bytes = numberSize(size);
    if (!bytes) return C.fail('  Invalid size "' + size + '"', 1);
    if (bytes > vg.freeValue) return C.fail('  Insufficient free space: ' + size + ' requested, ' + C.humanSize(vg.freeValue) + ' free', 5);
    vg.freeValue -= bytes;
    vg.free = C.humanSize(vg.freeValue).replace('B', '');
    vg.sizeValue = vg.sizeValue || numberSize(vg.size);
    (vg.pvs || []).forEach(function (path) {
      var pv = sys.lvm.pvs.filter(function (item) { return item.name === path; })[0];
      if (pv) {
        var pvBytes = numberSize(pv.free);
        pv.free = C.humanSize(Math.max(0, pvBytes - bytes)).replace('B', '');
      }
    });
    var lv = { name: name, vg: vgName, size: C.humanSize(bytes).replace('B', ''), sizeValue: bytes, attr: '-wi-ao----', mount: '' };
    sys.lvm.lvs.push(lv);
    var dir = '/dev/' + vgName;
    if (!sys.fs[dir]) sys.fs[dir] = C.newDirNode(sys, ctx, dir, 493);
    var path = dir + '/' + name;
    sys.fs[path] = { type: 'block', mode: 432, uid: 0, gid: 6, context: 'fixed_disk_device_t', inode: C.nextInode(sys), mtime: new Date().toISOString(), atime: new Date().toISOString(), ctime: new Date().toISOString(), size: bytes };
    var mapper = '/dev/mapper/' + vgName + '-' + name;
    sys.fs[mapper] = sys.fs[path];
    (sys.blockDevices || []).push({ name: vgName + '-' + name, size: lv.size, type: 'lvm', fstype: '', mountpoint: '', uuid: '' });
    evidence(sys, 'lvm:lvcreate');
    return C.ok('  Logical volume "' + name + '" created.\n');
  });

  reg('mkswap', function (ctx, args) {
    var denied = C.requireRoot(ctx);
    if (denied) return denied;
    var values = args.filter(function (arg) { return arg.charAt(0) !== '-'; });
    if (!values.length) return C.fail('mkswap: no device specified', 1);
    var sys = ctx.sys;
    var out = [];
    values.forEach(function (raw) {
      var path = normalizePath(ctx, raw);
      var node = sys.fs[path];
      if (!node) return;
      var record = blockRecord(sys, path);
      if (!node.size && record) node.size = numberSize(record.size);
      node.fsType = 'swap';
      node.swap = true;
      node.uuid = '5f4e3d2c-1b0a-9f8e-7d6c-5b4a3f2e1d0c';
      out.push('Setting up swapspace version 1, size = ' + C.humanSize(node.size || 0) + ', UUID=5f4e3d2c-1b0a-9f8e-7d6c-5b4a3f2e1d0c');
    });
    evidence(sys, 'storage:mkswap');
    return C.ok(out.join('\n') + '\n');
  });

  reg('swapon', function (ctx, args) {
    var sys = ctx.sys;
    if (args.indexOf('--show') !== -1 || args.indexOf('-s') !== -1) {
      var lines = ['NAME      TYPE      SIZE USED PRIO'];
      (sys.swaps || []).forEach(function (swap) {
        lines.push(swap.device.padEnd(10) + 'partition ' + String(swap.size || '2G').padStart(8) + ' ' + String(swap.used || '0B').padStart(4) + '   -2');
      });
      return C.ok(lines.join('\n') + '\n');
    }
    var denied = C.requireRoot(ctx);
    if (denied) return denied;
    var target = args.filter(function (arg) { return arg.charAt(0) !== '-'; })[0];
    if (!target) return C.fail('swapon: usage: swapon DEVICE', 1);
    var path = normalizePath(ctx, target);
    var node = sys.fs[path];
    if (!node || node.fsType !== 'swap') return C.fail('swapon: ' + target + ': read swap header failed', 255);
    sys.swaps = sys.swaps || [];
    if (!sys.swaps.some(function (item) { return item.device === path; })) {
      sys.swaps.push({ device: path, size: C.humanSize(node.size || 0), used: '0B' });
    }
    evidence(sys, 'storage:swapon');
    return C.ok('');
  });

  reg('swapoff', function (ctx, args) {
    var denied = C.requireRoot(ctx);
    if (denied) return denied;
    var target = args.filter(function (arg) { return arg.charAt(0) !== '-'; })[0];
    if (!target) return C.fail('swapoff: usage: swapoff DEVICE', 1);
    var path = normalizePath(ctx, target);
    ctx.sys.swaps = (ctx.sys.swaps || []).filter(function (item) { return item.device !== path; });
    return C.ok('');
  });

  reg('crontab', function (ctx, args) {
    var sys = ctx.sys;
    if (args.indexOf('-l') !== -1) {
      evidence(sys, 'cron:list');
      return sys.crontab ? C.ok(sys.crontab) : C.fail('no crontab for ' + ctx.userName, 1);
    }
    if (args.indexOf('-r') !== -1) {
      sys.crontab = '';
      return C.ok('');
    }
    var file = args.filter(function (arg) { return arg.charAt(0) !== '-'; })[0];
    if (!file) return C.fail('crontab: usage error: file name or -l/-r required', 1);
    var read = C.readFile(ctx, file);
    if (!read.ok) return C.fail('crontab: ' + file + ': ' + read.message, 1);
    sys.crontab = read.content;
    evidence(sys, 'cron:install');
    return C.ok('');
  });

  reg('systemd-analyze', function (ctx, args) {
    if (args[0] !== 'calendar') return C.fail('systemd-analyze: only the calendar verb is simulated', 1);
    var expression = args.slice(1).join(' ');
    if (!expression) return C.fail('systemd-analyze: missing calendar expression', 1);
    return C.ok('  Original form: ' + expression + '\n  Normalized form: ' + expression + '\n       Next elapse: Sat 2026-11-14 02:00:00 UTC\n       (in UTC): Sat 2026-11-14 02:00:00 UTC\n');
  });

  reg('ssh-keygen', function (ctx, args) {
    var type = 'rsa';
    var file = null;
    var comment = ctx.userName + '@' + ctx.sys.hostname;
    for (var i = 0; i < args.length; i++) {
      if (args[i] === '-t' && args[i + 1]) { type = args[++i]; continue; }
      if (args[i] === '-f' && args[i + 1]) { file = args[++i]; continue; }
      if (args[i] === '-C' && args[i + 1]) { comment = args[++i]; continue; }
      if (args[i] === '-N' && args[i + 1] !== undefined) { i += 1; continue; }
    }
    var sys = ctx.sys;
    var home = ctx.user.home || '/home/student';
    var keyPath = file ? normalizePath(ctx, file) : home + '/.ssh/id_' + (type === 'ed25519' ? 'ed25519' : 'rsa');
    var dir = keyPath.split('/').slice(0, -1).join('/');
    if (!sys.fs[dir]) {
      var parent = VFS.parentInfo(sys, ctx.user, dir, sys.cwd, true);
      if (!parent.ok) return C.fail('ssh-keygen: ' + parent.message, 1);
      sys.fs[dir] = C.newDirNode(sys, ctx, dir, 448);
    }
    if (sys.fs[keyPath]) return C.fail(keyPath + ' already exists.\nOverwrite (y/n)? ', 1);
    sys.fs[keyPath] = C.newFileNode(sys, ctx, keyPath, '-----BEGIN OPENSSH PRIVATE KEY-----\nfieldbook-simulated-' + type + '-private-key\n-----END OPENSSH PRIVATE KEY-----\n', 384);
    sys.fs[keyPath].uid = ctx.user.uid;
    sys.fs[keyPath].gid = ctx.user.gid;
    sys.fs[keyPath + '.pub'] = C.newFileNode(sys, ctx, keyPath + '.pub', 'ssh-' + type + ' AAAAC3NzaC1lZDI1NTE5AAAAIFieldbookSandboxExamplePublicKey ' + comment + '\n', 420);
    sys.fs[keyPath + '.pub'].uid = ctx.user.uid;
    sys.fs[keyPath + '.pub'].gid = ctx.user.gid;
    sys.fs[dir].mode = 448;
    evidence(sys, 'ssh:keygen');
    return C.ok('Generating public/private ' + type + ' key pair.\nYour identification has been saved in ' + keyPath + '\nYour public key has been saved in ' + keyPath + '.pub\nThe key fingerprint is SHA256:fieldbookSandboxExampleKeyFingerprint.\nThe key\'s randomart image is:\n+--[ED25519 256]--+\n|   . o+=.        |\n|  . + B..        |\n+----[SHA256]-----+\n');
  });
})(typeof window !== 'undefined' ? window : globalThis);
