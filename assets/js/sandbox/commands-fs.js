/* ==========================================================================
   RHEL Fieldbook — filesystem, permissions, storage, and SELinux-aware views
   ========================================================================== */

(function (root) {
  'use strict';

  var SB = root.RHEL_SANDBOX;
  var C = SB.commands;
  var VFS = SB.vfs;
  var reg = C.register;

  function joins(base, name) {
    return base === '/' ? '/' + name : base + '/' + name;
  }

  function entryName(ctx, path) {
    return path;
  }

  function lsModeLine(ctx, node, name, opts, linkTarget) {
    var out = VFS.modeString(node);
    if (node.acl && node.acl.length) out += '+';
    if (opts.selinux) out += '.';
    out += ' ' + String(node.links || (node.type === 'dir' ? 2 : 1)).padStart(2, ' ');
    out += ' ' + VFS.ownerName(ctx.sys, node.uid);
    out += ' ' + VFS.groupName(ctx.sys, node.gid);
    if (opts.selinux) out += ' ' + VFS.contextString(node);
    var size = node.type === 'dir' ? 4096 : VFS.sizeOf(node);
    out += ' ' + String(opts.human ? C.humanSize(size) : size).padStart(opts.human ? 5 : 10, ' ');
    out += ' ' + C.formatDate(node.mtime);
    var suffix = '';
    if (opts.classify) {
      if (node.type === 'dir') suffix = '/';
      else if (node.type === 'link') suffix = '@';
      else if ((node.mode & 73) !== 0) suffix = '*';
    }
    out += ' ' + name + suffix;
    if (node.type === 'link') out += ' -> ' + (linkTarget || node.target || '');
    return out;
  }

  function lsPath(ctx, rawPath, opts, out, err, header) {
    var sys = ctx.sys;
    var follow = !(opts.long || opts.directory);
    var resolved = VFS.resolve(sys, rawPath, sys.cwd, ctx.user, follow);
    if (resolved.error) {
      err.push('ls: cannot access \'' + rawPath + '\': ' + resolved.error);
      return [];
    }
    var node = resolved.node;
    var path = resolved.path;
    var recurse = [];

    if (node.type === 'dir' && !opts.directory) {
      var acc = VFS.access(sys, ctx.user, path, '/', 'r');
      if (!acc.ok) {
        err.push('ls: cannot open directory \'' + rawPath + '\': ' + acc.message);
        return [];
      }
      var entries = C.listChildren(ctx, path);
      if (opts.all) {
        var parent = VFS.dirname(path);
        entries.unshift({ path: path, name: '.', node: node });
        entries.unshift({ path: parent, name: '..', node: sys.fs[parent] || node });
      } else if (opts.almostAll) {
        entries = entries;
      }
      entries.sort(function (a, b) {
        if (opts.time) return (new Date(b.node.mtime).getTime() || 0) - (new Date(a.node.mtime).getTime() || 0) || a.name.localeCompare(b.name);
        return a.name.localeCompare(b.name);
      });
      if (opts.reverse) entries.reverse();
      if (header) out.push(rawPath + ':');
      if (opts.long) {
        var total = entries.reduce(function (sum, item) { return sum + (item.node.type === 'dir' ? 4 : Math.ceil(VFS.sizeOf(item.node) / 1024)); }, 0);
        out.push('total ' + total);
      }
      entries.forEach(function (entry) {
        if (opts.long) out.push(lsModeLine(ctx, entry.node, entry.name, opts, entry.node.target));
        else {
          var name = entry.name;
          if (opts.classify) {
            if (entry.node.type === 'dir') name += '/';
            else if (entry.node.type === 'link') name += '@';
            else if ((entry.node.mode & 73) !== 0) name += '*';
          }
          out.push(name);
        }
        if (opts.recursive && entry.node.type === 'dir' && entry.name !== '.' && entry.name !== '..') recurse.push(entry.path);
      });
      if (header && opts.recursive) out.push('');
      return recurse;
    }

    if (header) out.push(rawPath + ':');
    if (opts.long) out.push(lsModeLine(ctx, node, VFS.basename(path), opts, node.target));
    else out.push(VFS.basename(path));
    return [];
  }

  reg('ls', function (ctx, args) {
    var opts = { long: false, all: false, almostAll: false, human: false, recursive: false, directory: false, selinux: false, classify: false, time: false, reverse: false, inode: false };
    var paths = [];
    for (var i = 0; i < args.length; i++) {
      var arg = args[i];
      if (arg === '--') { paths = paths.concat(args.slice(i + 1)); break; }
      if (arg === '--all') { opts.all = true; continue; }
      if (arg === '--almost-all') { opts.almostAll = true; continue; }
      if (arg === '--human-readable') { opts.human = true; continue; }
      if (arg === '--recursive') { opts.recursive = true; continue; }
      if (arg === '--directory') { opts.directory = true; continue; }
      if (arg === '--classify') { opts.classify = true; continue; }
      if (arg === '--color' || /^--color=/.test(arg)) continue;
      if (arg.charAt(0) === '-' && arg.length > 1) {
        for (var j = 1; j < arg.length; j++) {
          var flag = arg.charAt(j);
          if (flag === 'l') opts.long = true;
          else if (flag === 'a') opts.all = true;
          else if (flag === 'A') opts.almostAll = true;
          else if (flag === 'h') opts.human = true;
          else if (flag === 'R') opts.recursive = true;
          else if (flag === 'd') opts.directory = true;
          else if (flag === 'Z') { opts.selinux = true; opts.long = true; }
          else if (flag === 'F') opts.classify = true;
          else if (flag === 't') opts.time = true;
          else if (flag === 'r') opts.reverse = true;
          else if (flag === 'i') opts.inode = true;
          else if (flag === '1') opts.long = false;
        }
        continue;
      }
      paths.push(arg);
    }
    if (!paths.length) paths = ['.'];
    var out = [];
    var err = [];
    var multi = paths.length > 1 || opts.recursive;
    var queue = [];
    paths.forEach(function (path) { queue = queue.concat(lsPath(ctx, path, opts, out, err, multi)); });
    while (queue.length) {
      var current = queue.shift();
      out.push('');
      out.push(current + ':');
      var more = lsPath(ctx, current, opts, out, err, false);
      queue = queue.concat(more);
    }
    return C.both(out.join('\n') + (out.length ? '\n' : ''), err.length ? err.join('\n') + '\n' : '', err.length ? 2 : 0);
  });

  reg('stat', function (ctx, args) {
    var format = null;
    var files = [];
    for (var i = 0; i < args.length; i++) {
      if (args[i] === '-c' || args[i] === '--format') { format = args[++i]; continue; }
      if (/^--format=/.test(args[i])) { format = args[i].split('=')[1]; continue; }
      if (args[i] === '-L') continue;
      files.push(args[i]);
    }
    if (!files.length) return C.fail('stat: missing operand', 1);
    var out = [];
    for (var f = 0; f < files.length; f++) {
      var resolved = VFS.resolve(ctx.sys, files[f], ctx.sys.cwd, ctx.user, false);
      if (resolved.error) return C.fail('stat: cannot statx \'' + files[f] + '\': ' + resolved.error);
      var node = resolved.node;
      var typeName = node.type === 'dir' ? 'directory' : node.type === 'link' ? 'symbolic link' : 'regular file';
      var size = VFS.sizeOf(node);
      var owner = VFS.ownerName(ctx.sys, node.uid);
      var group = VFS.groupName(ctx.sys, node.gid);
      if (format) {
        out.push(format.replace(/%n/g, resolved.path)
          .replace(/%s/g, size)
          .replace(/%U/g, owner)
          .replace(/%G/g, group)
          .replace(/%a/g, VFS.octalString(node.mode))
          .replace(/%A/g, VFS.modeString(node))
          .replace(/%F/g, typeName)
          .replace(/%i/g, node.inode || 0)
          .replace(/%Z/g, VFS.contextString(node))
          .replace(/%Y/g, Math.floor(new Date(node.mtime).getTime() / 1000))
          .replace(/%X/g, Math.floor(new Date(node.atime || node.mtime).getTime() / 1000)));
      } else {
        out.push('  File: ' + resolved.path);
        out.push('  Size: ' + String(size).padEnd(12, ' ') + 'Blocks: ' + Math.ceil(size / 512) + '       IO Block: 4096   ' + typeName);
        out.push('Device: fd00h/64768d\tInode: ' + (node.inode || 0) + '\tLinks: ' + (node.links || 1));
        out.push('Access: (' + VFS.octalString(node.mode) + '/' + VFS.modeString(node) + ')  Uid: (' + String(node.uid).padStart(5, ' ') + '/' + owner + ')' + '   Gid: (' + String(node.gid).padStart(5, ' ') + '/' + group + ')');
        out.push('Context: ' + VFS.contextString(node));
        out.push('Access: ' + (node.atime || node.mtime));
        out.push('Modify: ' + node.mtime);
        out.push('Change: ' + (node.ctime || node.mtime));
        if (node.type === 'link') out.push('  Link: ' + node.target);
      }
    }
    return C.ok(out.join('\n') + '\n');
  });

  reg('file', function (ctx, args) {
    if (!args.length) return C.fail('file: missing operand', 1);
    var out = [];
    args.forEach(function (raw) {
      var resolved = VFS.resolve(ctx.sys, raw, ctx.sys.cwd, ctx.user, false);
      if (resolved.error) { out.push(raw + ': cannot open (' + resolved.error + ')'); return; }
      var node = resolved.node;
      if (node.type === 'dir') out.push(raw + ': directory');
      else if (node.type === 'link') out.push(raw + ': symbolic link to ' + node.target);
      else if (node.type === 'char' || node.type === 'block') out.push(raw + ': block special');
      else if (!node.content) out.push(raw + ': empty');
      else if (/^\s*</.test(node.content)) out.push(raw + ': HTML document, ASCII text');
      else out.push(raw + ': ASCII text');
    });
    return C.ok(out.join('\n') + '\n');
  });

  function findMatch(ctx, path, node, predicates, depth) {
    for (var i = 0; i < predicates.length; i++) {
      var pred = predicates[i];
      if (pred.type === 'name' || pred.type === 'iname') {
        var re = VFS.globToRegExp(pred.value, pred.type === 'iname');
        if (!re.test(VFS.basename(path))) return false;
      } else if (pred.type === 'path') {
        if (!VFS.globToRegExp(pred.value).test(path)) return false;
      } else if (pred.type === 'type') {
        var wanted = pred.value;
        if (wanted === 'f' && node.type !== 'file') return false;
        if (wanted === 'd' && node.type !== 'dir') return false;
        if (wanted === 'l' && node.type !== 'link') return false;
        if (wanted === 'b' && node.type !== 'block') return false;
        if (wanted === 'c' && node.type !== 'char') return false;
      } else if (pred.type === 'user') {
        if (VFS.ownerName(ctx.sys, node.uid) !== pred.value) return false;
      } else if (pred.type === 'group') {
        if (VFS.groupName(ctx.sys, node.gid) !== pred.value) return false;
      } else if (pred.type === 'perm') {
        var wantedMode = parseInt(pred.value.replace(/^[+-]/, ''), 8);
        var actual = node.mode & 4095;
        if (pred.value.charAt(0) === '-') {
          if ((actual & wantedMode) !== wantedMode) return false;
        } else if (actual !== wantedMode) return false;
      } else if (pred.type === 'size') {
        var raw = pred.value;
        var sign = raw.charAt(0);
        if (sign === '+' || sign === '-') raw = raw.slice(1);
        var suffix = raw.slice(-1).toLowerCase();
        var factor = suffix === 'k' ? 1024 : suffix === 'm' ? 1048576 : suffix === 'g' ? 1073741824 : suffix === 'c' ? 1 : 512;
        if (/[kmgc]$/i.test(raw)) raw = raw.slice(0, -1);
        var bytes = parseInt(raw, 10) * factor;
        var size = VFS.sizeOf(node);
        if (sign === '+' && size <= bytes) return false;
        if (sign === '-' && size >= bytes) return false;
        if (!sign && Math.floor(size / factor) !== parseInt(raw, 10)) return false;
      } else if (pred.type === 'empty') {
        if (node.type === 'file' && node.content) return false;
        if (node.type === 'dir' && C.listChildren(ctx, path).length) return false;
      }
    }
    return true;
  }

  reg('find', function (ctx, args) {
    var paths = [];
    var predicates = [];
    var maxdepth = Infinity;
    var mindepth = 0;
    var print = false;
    var i = 0;
    for (; i < args.length; i++) {
      if (args[i].charAt(0) === '-' || args[i] === '!' || args[i] === '(') break;
      paths.push(args[i]);
    }
    if (!paths.length) paths = ['.'];
    while (i < args.length) {
      var arg = args[i++];
      if (arg === '-name') predicates.push({ type: 'name', value: args[i++] });
      else if (arg === '-iname') predicates.push({ type: 'iname', value: args[i++] });
      else if (arg === '-path') predicates.push({ type: 'path', value: args[i++] });
      else if (arg === '-type') predicates.push({ type: 'type', value: args[i++] });
      else if (arg === '-user') predicates.push({ type: 'user', value: args[i++] });
      else if (arg === '-group') predicates.push({ type: 'group', value: args[i++] });
      else if (arg === '-perm') predicates.push({ type: 'perm', value: args[i++] });
      else if (arg === '-size') predicates.push({ type: 'size', value: args[i++] });
      else if (arg === '-maxdepth') maxdepth = parseInt(args[i++], 10);
      else if (arg === '-mindepth') mindepth = parseInt(args[i++], 10);
      else if (arg === '-print') print = true;
      else if (arg === '-empty') predicates.push({ type: 'empty' });
      else if (arg === '-delete') predicates.push({ type: 'delete' });
    }

    var out = [];
    var err = [];
    function visit(path, depth, node) {
      if (depth >= mindepth && findMatch(ctx, path, node, predicates, depth)) out.push(path);
      if (node.type !== 'dir' || depth >= maxdepth) return;
      var acc = VFS.access(ctx.sys, ctx.user, path, '/', 'r');
      if (!acc.ok) {
        err.push('find: \'' + path + '\': ' + acc.message);
        return;
      }
      var children = C.listChildren(ctx, path);
      for (var c = 0; c < children.length; c++) {
        visit(children[c].path, depth + 1, children[c].node);
      }
    }
    paths.forEach(function (raw) {
      var resolved = VFS.resolve(ctx.sys, raw, ctx.sys.cwd, ctx.user, false);
      if (resolved.error) { err.push('find: \'' + raw + '\': ' + resolved.error); return; }
      visit(resolved.path, 0, resolved.node);
    });
    return C.both(out.length ? out.join('\n') + '\n' : '', err.length ? err.join('\n') + '\n' : '', err.length ? 1 : 0);
  });

  function mountFor(sys, path) {
    var best = null;
    (sys.mounts || []).forEach(function (mount) {
      if (path === mount.target || path.indexOf(mount.target === '/' ? '/' : mount.target + '/') === 0) {
        if (!best || mount.target.length > best.target.length) best = mount;
      }
    });
    return best;
  }

  function duPath(ctx, rawPath, opts, out, err, depth, startMount) {
    var resolved = VFS.resolve(ctx.sys, rawPath, ctx.sys.cwd, ctx.user, false);
    if (resolved.error) { err.push('du: cannot access \'' + rawPath + '\': ' + resolved.error); return 0; }
    var path = resolved.path;
    var node = resolved.node;
    var total = VFS.sizeOf(node);
    if (node.type === 'dir') {
      var acc = VFS.access(ctx.sys, ctx.user, path, '/', 'r');
      if (!acc.ok) { err.push('du: cannot read directory \'' + path + '\': ' + acc.message); return total; }
      C.listChildren(ctx, path).forEach(function (child) {
        var mount = mountFor(ctx.sys, child.path);
        if (opts.oneFileSystem && mount && startMount && mount.target !== startMount.target && child.path === mount.target) return;
        total += duPath(ctx, child.path, opts, out, err, depth + 1, startMount);
      });
    }
    if (!opts.summary && (opts.all || node.type === 'dir') && depth <= (opts.depth === undefined ? Infinity : opts.depth)) {
      out.push((opts.human ? C.humanSize(total) : String(total)).padStart(opts.human ? 6 : 10, ' ') + '\t' + path);
    }
    return total;
  }

  reg('du', function (ctx, args) {
    var opts = { human: false, summary: false, all: false, depth: undefined, oneFileSystem: false };
    var paths = [];
    for (var i = 0; i < args.length; i++) {
      var arg = args[i];
      if (arg === '-s') opts.summary = true;
      else if (arg === '-a') opts.all = true;
      else if (arg === '-h') opts.human = true;
      else if (arg === '-x') opts.oneFileSystem = true;
      else if (arg === '-d' || arg === '--max-depth') opts.depth = parseInt(args[++i], 10);
      else if (/^--max-depth=/.test(arg)) opts.depth = parseInt(arg.split('=')[1], 10);
      else if (/^-[sahxd]+$/.test(arg)) {
        if (arg.indexOf('s') !== -1) opts.summary = true;
        if (arg.indexOf('a') !== -1) opts.all = true;
        if (arg.indexOf('h') !== -1) opts.human = true;
        if (arg.indexOf('x') !== -1) opts.oneFileSystem = true;
      }
      else if (arg.charAt(0) !== '-') paths.push(arg);
    }
    if (!paths.length) paths = ['.'];
    ctx.sys.evidence = ctx.sys.evidence || {};
    if (paths.some(function (path) { return path.indexOf('/mnt/labdisk') === 0; })) ctx.sys.evidence['storage:du'] = true;
    var out = [];
    var err = [];
    paths.forEach(function (path) {
      var start = mountFor(ctx.sys, VFS.normalize(path, ctx.sys.cwd, ctx.user, ctx.sys));
      var total = duPath(ctx, path, opts, out, err, 0, start);
      if (opts.summary) out.push((opts.human ? C.humanSize(total) : String(total)).padStart(opts.human ? 6 : 10, ' ') + '\t' + path);
    });
    return C.both(out.join('\n') + (out.length ? '\n' : ''), err.length ? err.join('\n') + '\n' : '', err.length ? 1 : 0);
  });

  reg('df', function (ctx, args) {
    var human = false;
    var showType = false;
    var inodes = false;
    var exclude = null;
    var paths = [];
    for (var i = 0; i < args.length; i++) {
      var arg = args[i];
      if (arg === '-h') human = true;
      else if (arg === '-T') showType = true;
      else if (arg === '-i') inodes = true;
      else if (arg === '-x' && args[i + 1]) exclude = args[++i];
      else if (/^-[hTi]+$/.test(arg)) {
        if (arg.indexOf('h') !== -1) human = true;
        if (arg.indexOf('T') !== -1) showType = true;
        if (arg.indexOf('i') !== -1) inodes = true;
      }
      else if (arg.charAt(0) !== '-') paths.push(arg);
    }
    var mounts = ctx.sys.mounts.slice();
    ctx.sys.evidence = ctx.sys.evidence || {};
    ctx.sys.evidence['storage:inspect'] = true;
    if (exclude) mounts = mounts.filter(function (m) { return m.fstype !== exclude; });
    if (paths.length) {
      ctx.sys.evidence = ctx.sys.evidence || {};
      if (paths.some(function (path) { return path.indexOf('/mnt/labdisk') === 0; })) ctx.sys.evidence['storage:df'] = true;
      mounts = paths.map(function (path) {
        var resolved = VFS.resolve(ctx.sys, path, ctx.sys.cwd, ctx.user, true);
        return mountFor(ctx.sys, resolved.path || path);
      }).filter(Boolean);
    }
    var out = [];
    if (inodes) out.push('Filesystem      Inodes  IUsed   IFree IUse% Mounted on');
    else if (showType) out.push('Filesystem     Type      Size  Used Avail Use% Mounted on');
    else out.push('Filesystem      Size  Used Avail Use% Mounted on');
    mounts.forEach(function (mount) {
      var size = mount.size || 0;
      var used = mount.used || 0;
      var avail = Math.max(0, size - used);
      var percent = size ? Math.round(used / size * 100) : 0;
      var line;
      if (inodes) {
        var totalInodes = mount.inodes || 0;
        var usedInodes = totalInodes - (mount.ifree || totalInodes);
        line = mount.source.padEnd(15, ' ') + String(totalInodes).padStart(8, ' ') + String(usedInodes).padStart(7, ' ') + String(mount.ifree || 0).padStart(8, ' ') + String(percent).padStart(4, ' ') + '% ' + mount.target;
      } else {
        var sizeText = human ? C.humanSize(size) : String(size);
        var usedText = human ? C.humanSize(used) : String(used);
        var availText = human ? C.humanSize(avail) : String(avail);
        line = mount.source.padEnd(15, ' ');
        if (showType) line += ' ' + mount.fstype.padEnd(6, ' ');
        line += sizeText.padStart(5, ' ') + usedText.padStart(6, ' ') + availText.padStart(6, ' ') + String(percent).padStart(4, ' ') + '% ' + mount.target;
      }
      out.push(line);
    });
    return C.ok(out.join('\n') + '\n');
  });

  function blockLine(device, prefix, showFs) {
    var name = prefix + device.name;
    var line = name.padEnd(14, ' ') + (device.size || '').padStart(5, ' ') + ' ' + (device.type || '').padEnd(5, ' ');
    if (showFs) line += ' ' + (device.fstype || '').padEnd(12, ' ') + (device.uuid || '').padEnd(38, ' ') + (device.mountpoint || '');
    else line += ' ' + (device.mountpoint || '');
    return line;
  }

  reg('lsblk', function (ctx, args) {
    var showFs = args.indexOf('-f') !== -1;
    ctx.sys.evidence = ctx.sys.evidence || {};
    ctx.sys.evidence['storage:inspect'] = true;
    var out = [];
    if (showFs) out.push('NAME           FSTYPE      FSVER    LABEL  UUID                                 FSAVAIL FSUSE% MOUNTPOINTS');
    else out.push('NAME        MAJ:MIN RM  SIZE RO TYPE MOUNTPOINTS');
    (ctx.sys.blockDevices || []).forEach(function (device) {
      out.push(blockLine(device, '', showFs));
      (device.children || []).forEach(function (child) {
        out.push(blockLine(child, '├─', showFs));
      });
    });
    return C.ok(out.join('\n') + '\n');
  });

  reg('blkid', function (ctx) {
    var out = [];
    (ctx.sys.mounts || []).forEach(function (mount) {
      if (mount.uuid) out.push(mount.source + ': UUID="' + mount.uuid + '" TYPE="' + mount.fstype + '"');
    });
    return C.ok(out.length ? out.join('\n') + '\n' : '');
  });

  reg('findmnt', function (ctx, args) {
    var target = args.filter(function (arg) { return arg.charAt(0) !== '-'; })[0];
    var containing = args.indexOf('-T') !== -1 || args.indexOf('--target') !== -1;
    var mounts = ctx.sys.mounts.slice();
    if (target) {
      var resolved = VFS.resolve(ctx.sys, target, ctx.sys.cwd, ctx.user, true);
      var path = resolved.path || target;
      if (containing) {
        var mount = mountFor(ctx.sys, path);
        mounts = mount ? [mount] : [];
      } else {
        mounts = mounts.filter(function (item) { return item.target === path || item.source === target; });
      }
    }
    var out = mounts.length || !target ? ['TARGET SOURCE FSTYPE OPTIONS'] : [];
    mounts.forEach(function (mount) {
      out.push(mount.target + ' ' + mount.source + ' ' + mount.fstype + ' ' + mount.options);
    });
    return C.ok(out.length ? out.join('\n') + '\n' : '', mounts.length ? 0 : 1);
  });

  reg('mount', function (ctx, args) {
    var sys = ctx.sys;
    if (!args.length) {
      return C.ok(sys.mounts.map(function (mount) {
        return mount.source + ' on ' + mount.target + ' type ' + mount.fstype + ' (' + mount.options + ')';
      }).join('\n') + '\n');
    }
    var loop = false;
    var fsType = null;
    var values = [];
    for (var i = 0; i < args.length; i++) {
      if (args[i] === '-o' && args[i + 1]) { if (args[i + 1].indexOf('loop') !== -1) loop = true; i += 1; continue; }
      if (args[i] === '-t' && args[i + 1]) { fsType = args[++i]; continue; }
      if (args[i] === '-a') continue;
      if (args[i].indexOf('-o') === 0) { if (args[i].indexOf('loop') !== -1) loop = true; continue; }
      values.push(args[i]);
    }
    if (values.length < 2) return C.fail('mount: bad usage', 1);
    if (!C.isRoot(ctx)) return C.fail('mount: only root can do that.', 1);
    var source = values[0];
    var target = values[1];
    var targetInfo = VFS.resolve(sys, target, sys.cwd, ctx.user, true);
    if (targetInfo.error || targetInfo.node.type !== 'dir') return C.fail('mount: ' + target + ': mount point does not exist', 32);
    var mount = {
      source: source,
      target: targetInfo.path,
      fstype: fsType || 'xfs',
      options: 'rw,relatime,seclabel,attr2,inode64,logbufs=8,logbsize=32k,noquota',
      size: 0,
      used: 0,
      inodes: 524288,
      ifree: 524288
    };
    if (loop) {
      var fileInfo = C.readFile(ctx, source);
      if (!fileInfo.ok) return C.fail('mount: ' + source + ': ' + fileInfo.message, 32);
      sys.loopNext = (sys.loopNext || 0) + 1;
      mount.source = '/dev/loop' + sys.loopNext;
      mount.fstype = fileInfo.node.fsType || 'xfs';
      mount.size = fileInfo.node.size || 0;
      mount.uuid = fileInfo.node.uuid || '';
    }
    mount.hidden = [];
    C.listChildren(ctx, mount.target).forEach(function (child) {
      mount.hidden.push({ path: child.path, node: child.node });
      delete sys.fs[child.path];
    });
    sys.mounts = sys.mounts.filter(function (item) { return item.target !== mount.target; });
    sys.mounts.push(mount);
    sys.evidence = sys.evidence || {};
    sys.evidence['storage:mount:' + mount.target] = true;
    return C.ok('');
  });

  reg('umount', function (ctx, args) {
    var target = args.filter(function (arg) { return arg.charAt(0) !== '-'; })[0];
    if (!target) return C.fail('umount: bad usage', 1);
    var sys = ctx.sys;
    if (!C.isRoot(ctx)) return C.fail('umount: only root can use "--types" option', 1);
    var resolved = VFS.resolve(sys, target, sys.cwd, ctx.user, true);
    var path = resolved.path || target;
    var found = null;
    sys.mounts.forEach(function (mount) {
      if (!found && (mount.target === path || mount.source === target)) found = mount;
    });
    if (!found) return C.fail('umount: ' + target + ': not mounted', 32);
    (found.created || []).slice().sort(function (a, b) { return b.length - a.length; }).forEach(function (created) {
      delete sys.fs[created];
    });
    (found.hidden || []).forEach(function (item) {
      sys.fs[item.path] = item.node;
    });
    sys.mounts = sys.mounts.filter(function (mount) { return mount !== found; });
    sys.evidence = sys.evidence || {};
    sys.evidence['storage:umount:' + path] = true;
    return C.ok('');
  });

  reg('mkfs.xfs', function (ctx, args) {
    var force = args.indexOf('-f') !== -1;
    var target = args.filter(function (arg) { return arg.charAt(0) !== '-'; })[0];
    if (!target) return C.fail('mkfs.xfs: no device specified', 1);
    var info = C.readFile(ctx, target);
    if (!info.ok) return C.fail('mkfs.xfs: ' + target + ': ' + info.message, 1);
    if (info.node.fsType && !force) return C.fail('mkfs.xfs: ' + target + ' contains a ' + info.node.fsType + ' filesystem', 1);
    var uuid = '9f1c2a3b-' + Math.floor(Math.random() * 0xffff).toString(16).padStart(4, '0') + '-4d5e-8f90-1a2b3c4d5e6f';
    info.node.fsType = 'xfs';
    info.node.uuid = uuid;
    info.node.size = info.node.size || 0;
    ctx.sys.evidence = ctx.sys.evidence || {};
    ctx.sys.evidence['storage:mkfs'] = true;
    return C.ok([
      'meta-data=/dev/loop0              isize=512    agcount=4, agsize=4116480 blks',
      '         =                       sectsz=512   attr=2, projid32bit=1',
      'data     =                       bsize=4096   blocks=' + Math.max(1, Math.floor((info.node.size || 0) / 4096)),
      '         =                       sunit=0      swidth=0 blks',
      'naming   =version 2              bsize=4096   ascii-ci=0, ftype=1',
      'log      =internal log           bsize=4096   blocks=16384, version=2',
      'realtime =none                   extsz=4096   blocks=0, rtextents=0',
      'Discarding blocks...Done.'
    ].join('\n') + '\n');
  });

  reg('dd', function (ctx, args) {
    var opts = {};
    args.forEach(function (arg) {
      var index = arg.indexOf('=');
      if (index !== -1) opts[arg.slice(0, index)] = arg.slice(index + 1);
    });
    if (!opts.of) return C.fail('dd: missing output file', 1);
    var bs = C.parseSize(opts.bs || '512') || 512;
    var count = opts.count ? parseInt(opts.count, 10) : 0;
    var size = opts.size ? (C.parseSize(opts.size) || 0) : bs * count;
    if (!size && opts.if === '/dev/zero') size = bs;
    var write = C.writeFile(ctx, opts.of, '', false);
    if (!write.ok) return C.fail('dd: failed to open \'' + opts.of + '\': ' + write.message);
    if (write.node && write.node.type === 'file') {
      write.node.size = size;
      if (opts.if && opts.if !== '/dev/zero' && opts.if !== '/dev/urandom') {
        var input = C.readFile(ctx, opts.if);
        if (input.ok) {
          write.node.content = input.content.slice(0, size || input.content.length);
          delete write.node.size;
        }
      } else {
        delete write.node.content;
      }
      write.node.mtime = new Date().toISOString();
      C.adjustMountUsage(ctx.sys, write.path, VFS.sizeOf(write.node));
      ctx.sys.evidence = ctx.sys.evidence || {};
      if (write.path === '/tmp/lab-disk.img') ctx.sys.evidence['storage:disk-image'] = true;
      if (write.path.indexOf('/mnt/labdisk/') === 0) ctx.sys.evidence['storage:fill'] = true;
    }
    return C.both('', (count || 1) + '+0 records in\n' + (count || 1) + '+0 records out\n' + size + ' bytes (' + (size / 1048576).toFixed(1) + ' MB, ' + (size / 1000000).toFixed(1) + ' MB/s) copied\n', 0);
  });

  reg('touch', function (ctx, args) {
    var create = true;
    var files = [];
    for (var i = 0; i < args.length; i++) {
      if (args[i] === '-c' || args[i] === '--no-create') create = false;
      else if (args[i] === '-a' || args[i] === '-m' || args[i] === '-t' || args[i] === '-d') { if (args[i] === '-t' || args[i] === '-d') i += 1; }
      else files.push(args[i]);
    }
    if (!files.length) return C.fail('touch: missing file operand', 1);
    var now = new Date().toISOString();
    for (var f = 0; f < files.length; f++) {
      var resolved = VFS.resolve(ctx.sys, files[f], ctx.sys.cwd, ctx.user, true);
      if (!resolved.error) {
        resolved.node.atime = now;
        resolved.node.mtime = now;
        resolved.node.ctime = now;
        continue;
      }
      if (!create) continue;
      var write = C.writeFile(ctx, files[f], '', false);
      if (!write.ok) return C.fail('touch: cannot touch \'' + files[f] + '\': ' + write.message);
    }
    return C.ok('');
  });

  function makeDir(ctx, rawPath, mode, parents) {
    var sys = ctx.sys;
    var path = VFS.normalize(rawPath, sys.cwd, ctx.user, sys);
    if (sys.fs[path]) {
      if (sys.fs[path].type === 'dir') return { ok: true, path: path, exists: true };
      return { ok: false, message: 'File exists', path: path };
    }
    var parent = VFS.dirname(path);
    if (!sys.fs[parent]) {
      if (!parents) return { ok: false, message: 'No such file or directory', path: path };
      var made = makeDir(ctx, parent, mode, true);
      if (!made.ok) return made;
    }
    var info = VFS.parentInfo(sys, ctx.user, path, sys.cwd, true);
    if (!info.ok) return { ok: false, message: info.message, path: path };
    var node = C.newDirNode(sys, ctx, path, mode);
    if (info.parentNode && (info.parentNode.mode & 1024)) node.gid = info.parentNode.gid;
    sys.fs[path] = node;
    C.trackMountPath(sys, path);
    return { ok: true, path: path };
  }

  reg('mkdir', function (ctx, args) {
    var parents = false;
    var mode = null;
    var dirs = [];
    for (var i = 0; i < args.length; i++) {
      if (args[i] === '-p') parents = true;
      else if (args[i] === '-m') { mode = VFS.parseMode(args[++i], 493); if (mode === null) return C.fail('mkdir: invalid mode', 1); }
      else if (/^-m/.test(args[i])) { mode = VFS.parseMode(args[i].slice(2), 493); if (mode === null) return C.fail('mkdir: invalid mode', 1); }
      else dirs.push(args[i]);
    }
    if (!dirs.length) return C.fail('mkdir: missing operand', 1);
    for (var d = 0; d < dirs.length; d++) {
      var result = makeDir(ctx, dirs[d], mode === null ? 493 : mode, parents);
      if (!result.ok) return C.fail('mkdir: cannot create directory \'' + dirs[d] + '\': ' + result.message);
    }
    return C.ok('');
  });

  reg('rmdir', function (ctx, args) {
    var dirs = args.filter(function (arg) { return arg.charAt(0) !== '-'; });
    if (!dirs.length) return C.fail('rmdir: missing operand', 1);
    for (var i = 0; i < dirs.length; i++) {
      var resolved = VFS.resolve(ctx.sys, dirs[i], ctx.sys.cwd, ctx.user, false);
      if (resolved.error) return C.fail('rmdir: failed to remove \'' + dirs[i] + '\': ' + resolved.error);
      if (resolved.node.type !== 'dir') return C.fail('rmdir: failed to remove \'' + dirs[i] + '\': Not a directory');
      if (C.listChildren(ctx, resolved.path).length) return C.fail('rmdir: failed to remove \'' + dirs[i] + '\': Directory not empty');
      var removed = C.removeNode(ctx, resolved.path, false, false);
      if (!removed.ok) return C.fail('rmdir: failed to remove \'' + dirs[i] + '\': ' + removed.message);
    }
    return C.ok('');
  });

  reg('rm', function (ctx, args) {
    var recursive = false;
    var force = false;
    var files = [];
    for (var i = 0; i < args.length; i++) {
      if (args[i] === '--') { files = files.concat(args.slice(i + 1)); break; }
      if (args[i] === '-r' || args[i] === '-R' || args[i] === '--recursive') recursive = true;
      else if (args[i] === '-f' || args[i] === '--force') force = true;
      else if (args[i] === '-i') continue;
      else if (args[i].charAt(0) === '-' && args[i].length > 1) {
        if (args[i].indexOf('r') !== -1 || args[i].indexOf('R') !== -1) recursive = true;
        if (args[i].indexOf('f') !== -1) force = true;
      } else files.push(args[i]);
    }
    if (!files.length && !force) return C.fail('rm: missing operand', 1);
    for (var f = 0; f < files.length; f++) {
      var result = C.removeNode(ctx, files[f], recursive, force);
      if (!result.ok) return C.fail('rm: cannot remove \'' + files[f] + '\': ' + result.message);
    }
    return C.ok('');
  });

  reg('cp', function (ctx, args) {
    var recursive = false;
    var preserve = false;
    var values = [];
    for (var i = 0; i < args.length; i++) {
      if (args[i] === '-r' || args[i] === '-R' || args[i] === '--recursive') recursive = true;
      else if (args[i] === '-a' || args[i] === '--archive') { recursive = true; preserve = true; }
      else if (args[i] === '-p' || args[i] === '--preserve') preserve = true;
      else if (args[i] === '-i' || args[i] === '-f' || args[i] === '-v') continue;
      else if (args[i].charAt(0) === '-' && args[i].length > 1) {
        if (args[i].indexOf('r') !== -1 || args[i].indexOf('R') !== -1) recursive = true;
        if (args[i].indexOf('a') !== -1) { recursive = true; preserve = true; }
        if (args[i].indexOf('p') !== -1) preserve = true;
      } else values.push(args[i]);
    }
    if (values.length < 2) return C.fail('cp: missing destination file operand', 1);
    var destination = values.pop();
    var destResolved = VFS.resolve(ctx.sys, destination, ctx.sys.cwd, ctx.user, true);
    if (values.length > 1 && (destResolved.error || destResolved.node.type !== 'dir')) {
      return C.fail('cp: target \'' + destination + '\' is not a directory', 1);
    }
    for (var v = 0; v < values.length; v++) {
      var result = C.copyTree(ctx, values[v], destination, { recursive: recursive, preserve: preserve });
      if (!result.ok) return C.fail('cp: cannot stat \'' + values[v] + '\': ' + result.message);
    }
    return C.ok('');
  });

  reg('mv', function (ctx, args) {
    var values = args.filter(function (arg) { return arg.charAt(0) !== '-'; });
    if (values.length < 2) return C.fail('mv: missing destination file operand', 1);
    var destination = values.pop();
    var destResolved = VFS.resolve(ctx.sys, destination, ctx.sys.cwd, ctx.user, true);
    if (values.length > 1 && (destResolved.error || destResolved.node.type !== 'dir')) {
      return C.fail('mv: target \'' + destination + '\' is not a directory', 1);
    }
    for (var v = 0; v < values.length; v++) {
      var result = C.moveTree(ctx, values[v], destination);
      if (!result.ok) return C.fail('mv: cannot move \'' + values[v] + '\': ' + result.message);
    }
    return C.ok('');
  });

  reg('ln', function (ctx, args) {
    var symbolic = false;
    var force = false;
    var values = [];
    for (var i = 0; i < args.length; i++) {
      if (args[i] === '-s' || args[i] === '--symbolic') symbolic = true;
      else if (args[i] === '-f' || args[i] === '--force') force = true;
      else if (args[i].charAt(0) !== '-') values.push(args[i]);
    }
    if (values.length < 2) return C.fail('ln: missing file operand', 1);
    var target = values[0];
    var linkPath = values[1];
    var info = VFS.parentInfo(ctx.sys, ctx.user, linkPath, ctx.sys.cwd, true);
    if (!info.ok) return C.fail('ln: failed to create link \'' + linkPath + '\': ' + info.message);
    if (info.existing) {
      if (!force) return C.fail('ln: failed to create link \'' + linkPath + '\': File exists');
      delete ctx.sys.fs[info.path];
    }
    if (symbolic) {
      ctx.sys.fs[info.path] = {
        type: 'link', mode: 511, uid: ctx.user.uid, gid: ctx.user.gid,
        context: VFS.contextType(ctx.sys, info.path), inode: C.nextInode(ctx.sys),
        target: target, mtime: new Date().toISOString(), atime: new Date().toISOString(), ctime: new Date().toISOString()
      };
    } else {
      var source = VFS.resolve(ctx.sys, target, ctx.sys.cwd, ctx.user, false);
      if (source.error) return C.fail('ln: failed to access \'' + target + '\': ' + source.error);
      var clone = VFS.clone(source.node);
      clone.inode = C.nextInode(ctx.sys);
      clone.links = (clone.links || 1) + 1;
      ctx.sys.fs[info.path] = clone;
    }
    return C.ok('');
  });

  function chmodNode(ctx, path, mode, recursive) {
    var node = ctx.sys.fs[path];
    if (!node) return;
    if (!C.isRoot(ctx) && node.uid !== ctx.user.uid) throw new Error('Operation not permitted');
    node.mode = mode & 4095;
    node.ctime = new Date().toISOString();
    if (recursive && node.type === 'dir') {
      C.listChildren(ctx, path).forEach(function (child) { chmodNode(ctx, child.path, mode, true); });
    }
  }

  reg('chmod', function (ctx, args) {
    var recursive = false;
    var values = [];
    for (var i = 0; i < args.length; i++) {
      if (args[i] === '-R' || args[i] === '--recursive') recursive = true;
      else if (args[i].charAt(0) !== '-') values.push(args[i]);
    }
    if (values.length < 2) return C.fail('chmod: missing operand', 1);
    var spec = values.shift();
    for (var v = 0; v < values.length; v++) {
      var resolved = VFS.resolve(ctx.sys, values[v], ctx.sys.cwd, ctx.user, false);
      if (resolved.error) return C.fail('chmod: cannot access \'' + values[v] + '\': ' + resolved.error);
      var mode = VFS.parseMode(spec, resolved.node.mode);
      if (mode === null) return C.fail('chmod: invalid mode: \'' + spec + '\'');
      try { chmodNode(ctx, resolved.path, mode, recursive); }
      catch (e) { return C.fail('chmod: changing permissions of \'' + values[v] + '\': ' + e.message); }
    }
    return C.ok('');
  });

  function chownNode(ctx, path, uid, gid, recursive) {
    var node = ctx.sys.fs[path];
    if (!node) return;
    if (uid !== null && !C.isRoot(ctx)) throw new Error('Operation not permitted');
    if (gid !== null && !C.isRoot(ctx)) {
      var gids = VFS.userGids(ctx.sys, ctx.user);
      if (gids.indexOf(gid) === -1) throw new Error('Operation not permitted');
    }
    if (uid !== null) node.uid = uid;
    if (gid !== null) node.gid = gid;
    node.ctime = new Date().toISOString();
    if (recursive && node.type === 'dir') {
      C.listChildren(ctx, path).forEach(function (child) { chownNode(ctx, child.path, uid, gid, true); });
    }
  }

  function parseOwnership(ctx, spec) {
    var parts = String(spec).split(':');
    var uid = null;
    var gid = null;
    if (parts[0]) {
      var user = ctx.sys.users[parts[0]];
      if (!user && /^\d+$/.test(parts[0])) user = Object.keys(ctx.sys.users).map(function (name) { return ctx.sys.users[name]; }).filter(function (item) { return item.uid === parseInt(parts[0], 10); })[0];
      if (!user) return { error: 'invalid user: \'' + parts[0] + '\'' };
      uid = user.uid;
    }
    if (parts.length > 1 && parts[1]) {
      var group = ctx.sys.groups[parts[1]];
      if (!group && /^\d+$/.test(parts[1])) group = Object.keys(ctx.sys.groups).map(function (name) { return ctx.sys.groups[name]; }).filter(function (item) { return item.gid === parseInt(parts[1], 10); })[0];
      if (!group) return { error: 'invalid group: \'' + parts[1] + '\'' };
      gid = group.gid;
    }
    return { uid: uid, gid: gid };
  }

  reg('chown', function (ctx, args) {
    var recursive = false;
    var values = [];
    for (var i = 0; i < args.length; i++) {
      if (args[i] === '-R' || args[i] === '--recursive') recursive = true;
      else if (args[i].charAt(0) !== '-') values.push(args[i]);
    }
    if (values.length < 2) return C.fail('chown: missing operand', 1);
    var owner = parseOwnership(ctx, values.shift());
    if (owner.error) return C.fail('chown: ' + owner.error);
    if (owner.uid !== null && !C.isRoot(ctx)) return C.fail('chown: changing ownership: Operation not permitted');
    for (var v = 0; v < values.length; v++) {
      var resolved = VFS.resolve(ctx.sys, values[v], ctx.sys.cwd, ctx.user, false);
      if (resolved.error) return C.fail('chown: cannot access \'' + values[v] + '\': ' + resolved.error);
      try { chownNode(ctx, resolved.path, owner.uid, owner.gid, recursive); }
      catch (e) { return C.fail('chown: changing ownership of \'' + values[v] + '\': ' + e.message); }
    }
    return C.ok('');
  });

  reg('chgrp', function (ctx, args) {
    var recursive = false;
    var values = [];
    for (var i = 0; i < args.length; i++) {
      if (args[i] === '-R') recursive = true;
      else if (args[i].charAt(0) !== '-') values.push(args[i]);
    }
    if (values.length < 2) return C.fail('chgrp: missing operand', 1);
    var groupName = values.shift();
    var group = ctx.sys.groups[groupName];
    if (!group) return C.fail('chgrp: invalid group: \'' + groupName + '\'');
    for (var v = 0; v < values.length; v++) {
      var resolved = VFS.resolve(ctx.sys, values[v], ctx.sys.cwd, ctx.user, false);
      if (resolved.error) return C.fail('chgrp: cannot access \'' + values[v] + '\': ' + resolved.error);
      try { chownNode(ctx, resolved.path, null, group.gid, recursive); }
      catch (e) { return C.fail('chgrp: changing group of \'' + values[v] + '\': ' + e.message); }
    }
    return C.ok('');
  });

  function applyAclEntry(ctx, path, entry) {
    var node = ctx.sys.fs[path];
    if (!node) return { ok: false, message: 'No such file or directory' };
    if (!C.isRoot(ctx) && node.uid !== ctx.user.uid) return { ok: false, message: 'Operation not permitted' };
    node.acl = node.acl || [];
    var match = /^(u|g|o|m):([^:]*):([rwx-]*)$/.exec(entry);
    if (!match) return { ok: false, message: 'Invalid argument' };
    var type = match[1] === 'u' ? 'user' : match[1] === 'g' ? 'group' : match[1] === 'o' ? 'other' : 'mask';
    var name = match[2];
    if (type === 'user' && name) {
      if (!ctx.sys.users[name] && !/^\d+$/.test(name)) return { ok: false, message: 'Invalid argument' };
    }
    if (type === 'group' && name) {
      if (!ctx.sys.groups[name] && !/^\d+$/.test(name)) return { ok: false, message: 'Invalid argument' };
    }
    node.acl = node.acl.filter(function (item) { return !(item.type === type && item.name === name); });
    if (match[3] !== '---' || type === 'other' || type === 'mask') {
      node.acl.push({ type: type, name: name, perms: match[3] === '-' ? '---' : match[3].replace(/-/g, '') });
    }
    return { ok: true };
  }

  reg('setfacl', function (ctx, args) {
    var entries = [];
    var remove = false;
    var recursive = false;
    var values = [];
    for (var i = 0; i < args.length; i++) {
      if (args[i] === '-m') entries.push({ op: 'set', value: args[++i] });
      else if (args[i] === '-x') { remove = true; entries.push({ op: 'remove', value: args[++i] }); }
      else if (args[i] === '-b') entries.push({ op: 'clear' });
      else if (args[i] === '-R') recursive = true;
      else if (args[i].charAt(0) !== '-') values.push(args[i]);
    }
    if (!values.length) return C.fail('setfacl: missing file operand', 1);
    for (var v = 0; v < values.length; v++) {
      var resolved = VFS.resolve(ctx.sys, values[v], ctx.sys.cwd, ctx.user, false);
      if (resolved.error) return C.fail('setfacl: ' + values[v] + ': ' + resolved.error);
      var paths = [resolved.path];
      if (recursive && resolved.node.type === 'dir') {
        (function walk(path) {
          C.listChildren(ctx, path).forEach(function (child) { paths.push(child.path); if (child.node.type === 'dir') walk(child.path); });
        })(resolved.path);
      }
      for (var p = 0; p < paths.length; p++) {
        for (var e = 0; e < entries.length; e++) {
          var entry = entries[e];
          var node = ctx.sys.fs[paths[p]];
          if (entry.op === 'clear') { if (!C.isRoot(ctx) && node.uid !== ctx.user.uid) return C.fail('setfacl: ' + paths[p] + ': Operation not permitted'); node.acl = []; continue; }
          if (entry.op === 'remove') {
            var match = /^(u|g):([^:]+):?.*$/.exec(entry.value);
            if (match) node.acl = (node.acl || []).filter(function (item) { return !(item.type === (match[1] === 'u' ? 'user' : 'group') && item.name === match[2]); });
            continue;
          }
          var applied = applyAclEntry(ctx, paths[p], entry.value);
          if (!applied.ok) return C.fail('setfacl: ' + paths[p] + ': ' + applied.message);
        }
      }
    }
    return C.ok('');
  });

  reg('getfacl', function (ctx, args) {
    var values = args.filter(function (arg) { return arg.charAt(0) !== '-'; });
    if (!values.length) values = ['.'];
    var out = [];
    values.forEach(function (raw) {
      var resolved = VFS.resolve(ctx.sys, raw, ctx.sys.cwd, ctx.user, false);
      if (resolved.error) { out.push('# file: ' + raw); out.push('# ' + resolved.error); return; }
      var node = resolved.node;
      out.push('# file: ' + resolved.path);
      out.push('# owner: ' + VFS.ownerName(ctx.sys, node.uid));
      out.push('# group: ' + VFS.groupName(ctx.sys, node.gid));
      out.push('user::' + ((node.mode & 256) ? 'r' : '-') + ((node.mode & 128) ? 'w' : '-') + ((node.mode & 64) ? 'x' : '-'));
      (node.acl || []).forEach(function (entry) {
        if (entry.type === 'user') out.push('user:' + entry.name + ':' + entry.perms.padEnd(3, '-'));
        else if (entry.type === 'group') out.push('group:' + entry.name + ':' + entry.perms.padEnd(3, '-'));
        else if (entry.type === 'other') out.push('other::' + entry.perms.padEnd(3, '-'));
        else if (entry.type === 'mask') out.push('mask::' + entry.perms.padEnd(3, '-'));
      });
      out.push('group::' + ((node.mode & 32) ? 'r' : '-') + ((node.mode & 16) ? 'w' : '-') + ((node.mode & 8) ? 'x' : '-'));
      if (!(node.acl || []).some(function (entry) { return entry.type === 'mask'; })) out.push('mask::' + ((node.mode & 32) ? 'r' : '-') + ((node.mode & 16) ? 'w' : '-') + ((node.mode & 8) ? 'x' : '-'));
      out.push('other::' + ((node.mode & 4) ? 'r' : '-') + ((node.mode & 2) ? 'w' : '-') + ((node.mode & 1) ? 'x' : '-'));
      out.push('');
    });
    return C.ok(out.join('\n') + (out.length ? '\n' : ''));
  });

  reg('tee', function (ctx, args) {
    var append = false;
    var files = [];
    for (var i = 0; i < args.length; i++) {
      if (args[i] === '-a' || args[i] === '--append') append = true;
      else if (args[i].charAt(0) !== '-') files.push(args[i]);
    }
    var input = C.stdinText(ctx.stdin);
    for (var f = 0; f < files.length; f++) {
      var write = C.writeFile(ctx, files[f], input, append);
      if (!write.ok) return C.fail('tee: ' + files[f] + ': ' + write.message);
    }
    return C.ok(input);
  });
})(typeof window !== 'undefined' ? window : globalThis);
