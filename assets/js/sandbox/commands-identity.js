/* ==========================================================================
   RHEL Fieldbook — users, groups, passwords, sudo, and su
   ========================================================================== */

(function (root) {
  'use strict';

  var SB = root.RHEL_SANDBOX;
  var C = SB.commands;
  var VFS = SB.vfs;
  var Machine = SB.machine;
  var reg = C.register;

  function isWheel(ctx) {
    if (C.isRoot(ctx)) return true;
    if ((ctx.user.groups || []).indexOf('wheel') !== -1) return true;
    return VFS.userGids(ctx.sys, ctx.user).indexOf(10) !== -1;
  }

  function sync(ctx) {
    Machine.syncSystemFiles(ctx.sys);
  }

  function parseOptions(args, map) {
    var values = [];
    var options = {};
    for (var i = 0; i < args.length; i++) {
      var arg = args[i];
      if (arg === '--') { values = values.concat(args.slice(i + 1)); break; }
      if (arg.charAt(0) === '-' && arg.length > 1) {
        var key = arg.charAt(1);
        if (map[key] && map[key].arg) {
          var inline = arg.slice(2);
          options[key] = inline || args[++i];
        } else {
          for (var j = 1; j < arg.length; j++) {
            var ch = arg.charAt(j);
            if (map[ch] && map[ch].arg) {
              var rest = arg.slice(j + 1);
              options[ch] = rest || args[++i];
              break;
            }
            options[ch] = true;
          }
        }
      } else {
        values.push(arg);
      }
    }
    return { options: options, values: values };
  }

  function addMember(sys, groupName, userName) {
    var group = sys.groups[groupName];
    if (!group) return false;
    group.members = group.members || [];
    if (group.members.indexOf(userName) === -1) group.members.push(userName);
    var user = sys.users[userName];
    if (user) {
      user.groups = user.groups || [];
      if (user.groups.indexOf(groupName) === -1) user.groups.push(groupName);
    }
    return true;
  }

  function removeMember(sys, groupName, userName) {
    var group = sys.groups[groupName];
    if (group && group.members) group.members = group.members.filter(function (name) { return name !== userName; });
    var user = sys.users[userName];
    if (user && user.groups) user.groups = user.groups.filter(function (name) { return name !== groupName; });
  }

  reg('useradd', function (ctx, args) {
    var denied = C.requireRoot(ctx);
    if (denied) return denied;
    var parsed = parseOptions(args, { m: {}, M: {}, s: { arg: true }, G: { arg: true }, g: { arg: true }, u: { arg: true }, c: { arg: true }, d: { arg: true }, r: {}, N: {} });
    var name = parsed.values[0];
    if (!name) return C.fail('useradd: missing username', 2);
    var sys = ctx.sys;
    if (sys.users[name]) return C.fail('useradd: user \'' + name + '\' already exists', 9);
    if (!/^[a-z_][a-z0-9_-]*[$]?$/i.test(name)) return C.fail('useradd: invalid user name \'' + name + '\'', 3);

    var gid;
    if (parsed.options.g) {
      var primary = sys.groups[parsed.options.g];
      if (!primary) return C.fail('useradd: group \'' + parsed.options.g + '\' does not exist', 6);
      gid = primary.gid;
    } else {
      if (!sys.groups[name]) {
        var privateGid = Machine.nextGid(sys);
        sys.groups[name] = { name: name, gid: privateGid, members: [] };
      }
      gid = sys.groups[name].gid;
    }

    var uid = parsed.options.u ? parseInt(parsed.options.u, 10) : Machine.nextUid(sys);
    if (Object.keys(sys.users).some(function (key) { return sys.users[key].uid === uid; })) {
      return C.fail('useradd: UID ' + uid + ' is not unique', 4);
    }
    var home = parsed.options.d || ('/home/' + name);
    var shell = parsed.options.s || '/bin/bash';
    if (!/^[\/]/.test(home)) return C.fail('useradd: invalid home directory', 3);

    var user = {
      name: name,
      uid: uid,
      gid: gid,
      groups: [],
      gecos: parsed.options.c || name,
      home: home,
      shell: shell,
      password: '!',
      locked: true,
      system: !!parsed.options.r,
      lastChange: Math.floor(Date.now() / 86400000),
      minDays: 0,
      maxDays: 99999,
      warnDays: 7,
      inactiveDays: -1,
      expireDays: -1
    };
    sys.users[name] = user;

    if (parsed.options.G) {
      parsed.options.G.split(',').forEach(function (groupName) {
        if (!sys.groups[groupName]) return;
        addMember(sys, groupName, name);
      });
    }

    if (parsed.options.m && !parsed.options.M) {
      var parts = home.split('/').filter(Boolean);
      var current = '';
      parts.forEach(function (part) {
        current += '/' + part;
        if (!sys.fs[current]) {
          var mode = current === home ? 448 : 493;
          sys.fs[current] = C.newDirNode(sys, ctx, current, mode);
          if (current === home) {
            sys.fs[current].uid = uid;
            sys.fs[current].gid = gid;
            sys.fs[current].context = 'user_home_t';
          }
        }
      });
      var bashrc = home + '/.bashrc';
      if (!sys.fs[bashrc]) {
        var node = C.newFileNode(sys, ctx, bashrc, '# .bashrc\nexport PS1="[\\u@\\h \\W]\\$ "\nalias ll="ls -lah"\nexport EDITOR=vim\n', 420);
        node.uid = uid;
        node.gid = gid;
        node.context = 'user_home_t';
        sys.fs[bashrc] = node;
      }
    }

    sync(ctx);
    Machine.journal(sys, 'useradd', 6, 'new user: name=' + name + ', UID=' + uid + ', GID=' + gid + ', home=' + home + ', shell=' + shell, 0);
    return C.ok('');
  });

  reg('groupadd', function (ctx, args) {
    var denied = C.requireRoot(ctx);
    if (denied) return denied;
    var parsed = parseOptions(args, { g: { arg: true }, r: {}, f: {} });
    var name = parsed.values[0];
    if (!name) return C.fail('groupadd: missing group name', 2);
    var sys = ctx.sys;
    if (sys.groups[name]) {
      if (parsed.options.f) return C.ok('');
      return C.fail('groupadd: group \'' + name + '\' already exists', 9);
    }
    var gid = parsed.options.g ? parseInt(parsed.options.g, 10) : Machine.nextGid(sys);
    if (Object.keys(sys.groups).some(function (key) { return sys.groups[key].gid === gid; })) {
      return C.fail('groupadd: GID ' + gid + ' is not unique', 4);
    }
    sys.groups[name] = { name: name, gid: gid, members: [] };
    sync(ctx);
    return C.ok('');
  });

  reg('usermod', function (ctx, args) {
    var denied = C.requireRoot(ctx);
    if (denied) return denied;
    var parsed = parseOptions(args, { a: {}, G: { arg: true }, g: { arg: true }, s: { arg: true }, d: { arg: true }, L: {}, U: {}, c: { arg: true }, l: { arg: true } });
    var name = parsed.values[0];
    if (!name) return C.fail('usermod: missing username', 2);
    var sys = ctx.sys;
    var user = sys.users[name];
    if (!user) return C.fail('usermod: user \'' + name + '\' does not exist', 6);

    if (parsed.options.l) {
      var newName = parsed.options.l;
      if (sys.users[newName]) return C.fail('usermod: user \'' + newName + '\' already exists', 9);
      delete sys.users[name];
      user.name = newName;
      sys.users[newName] = user;
      Object.keys(sys.groups).forEach(function (groupName) {
        var group = sys.groups[groupName];
        group.members = (group.members || []).map(function (member) { return member === name ? newName : member; });
      });
      user.groups = (user.groups || []).map(function (groupName) {
        return groupName;
      });
      name = newName;
    }

    if (parsed.options.G !== undefined) {
      var wanted = parsed.options.G ? parsed.options.G.split(',') : [];
      if (!parsed.options.a) {
        (user.groups || []).slice().forEach(function (groupName) {
          if (wanted.indexOf(groupName) === -1) removeMember(sys, groupName, name);
        });
      }
      wanted.forEach(function (groupName) {
        if (sys.groups[groupName]) addMember(sys, groupName, name);
      });
    }
    if (parsed.options.a && parsed.options.G) {
      // -aG appends; the loop above already adds every requested group.
    }
    if (parsed.options.g) {
      var primary = sys.groups[parsed.options.g];
      if (!primary) return C.fail('usermod: group \'' + parsed.options.g + '\' does not exist', 6);
      user.gid = primary.gid;
    }
    if (parsed.options.s) user.shell = parsed.options.s;
    if (parsed.options.d) user.home = parsed.options.d;
    if (parsed.options.c) user.gecos = parsed.options.c;
    if (parsed.options.L) { user.locked = true; user.password = '!!'; }
    if (parsed.options.U) user.locked = false;

    sync(ctx);
    return C.ok('');
  });

  reg('userdel', function (ctx, args) {
    var denied = C.requireRoot(ctx);
    if (denied) return denied;
    var removeHome = args.indexOf('-r') !== -1;
    var name = args.filter(function (arg) { return arg.charAt(0) !== '-'; })[0];
    if (!name) return C.fail('userdel: missing username', 2);
    var sys = ctx.sys;
    var user = sys.users[name];
    if (!user) return C.fail('userdel: user \'' + name + '\' does not exist', 6);
    Object.keys(sys.groups).forEach(function (groupName) { removeMember(sys, groupName, name); });
    delete sys.users[name];
    if (removeHome && user.home && user.home !== '/') {
      var removed = C.removeNode(ctx, user.home, true, true);
      if (!removed.ok) return C.fail('userdel: ' + user.home + ': ' + removed.message);
    }
    sync(ctx);
    return C.ok('');
  });

  reg('groupdel', function (ctx, args) {
    var denied = C.requireRoot(ctx);
    if (denied) return denied;
    var name = args.filter(function (arg) { return arg.charAt(0) !== '-'; })[0];
    if (!name) return C.fail('groupdel: missing group name', 2);
    var sys = ctx.sys;
    var group = sys.groups[name];
    if (!group) return C.fail('groupdel: group \'' + name + '\' does not exist', 6);
    var primaryUser = Object.keys(sys.users).filter(function (key) { return sys.users[key].gid === group.gid; })[0];
    if (primaryUser) return C.fail('groupdel: cannot remove the primary group of user \'' + primaryUser + '\'', 8);
    Object.keys(sys.users).forEach(function (key) {
      if (sys.users[key].groups) sys.users[key].groups = sys.users[key].groups.filter(function (groupName) { return groupName !== name; });
    });
    delete sys.groups[name];
    sync(ctx);
    return C.ok('');
  });

  reg('passwd', function (ctx, args) {
    var lock = false;
    var unlock = false;
    var deletePassword = false;
    var status = false;
    var values = [];
    args.forEach(function (arg) {
      if (arg === '-l' || arg === '--lock') lock = true;
      else if (arg === '-u' || arg === '--unlock') unlock = true;
      else if (arg === '-d' || arg === '--delete') deletePassword = true;
      else if (arg === '-S' || arg === '--status') status = true;
      else if (arg.charAt(0) !== '-') values.push(arg);
    });
    var name = values[0] || ctx.userName;
    var sys = ctx.sys;
    var user = sys.users[name];
    if (!user) return C.fail('passwd: user \'' + name + '\' does not exist', 6);
    if (name !== ctx.userName && !C.isRoot(ctx)) return C.fail('passwd: You may not view or modify password information for ' + name + '.', 1);

    if (status) {
      return C.ok(name + ' ' + (user.locked ? 'L' : 'PS') + ' ' + new Date().toISOString().slice(0, 10) + ' ' + (user.minDays || 0) + ' ' + (user.maxDays === undefined ? 99999 : user.maxDays) + ' ' + (user.warnDays || 7) + ' ' + (user.inactiveDays === undefined ? -1 : user.inactiveDays) + '\n');
    }
    if (lock) {
      user.locked = true;
      user.password = '!!';
      sync(ctx);
      return C.ok('passwd: password for ' + name + ' locked.\n');
    }
    if (unlock) {
      user.locked = false;
      if (!user.password || user.password === '!!' || user.password === '!') user.password = '$6$rhel$' + Math.random().toString(36).slice(2, 10);
      sync(ctx);
      return C.ok('passwd: password for ' + name + ' unlocked.\n');
    }
    if (deletePassword) {
      user.password = '';
      user.locked = false;
      sync(ctx);
      return C.ok('passwd: password for ' + name + ' deleted.\n');
    }

    user.password = '$6$rhel$' + Math.random().toString(36).slice(2, 12);
    user.locked = false;
    user.lastChange = Math.floor(Date.now() / 86400000);
    sync(ctx);
    return C.ok('Changing password for user ' + name + '.\npasswd: all authentication tokens updated successfully.\n');
  });

  reg('chage', function (ctx, args) {
    var values = [];
    var options = {};
    for (var i = 0; i < args.length; i++) {
      if (args[i] === '-l') options.l = true;
      else if (['-m', '-M', '-W', '-I', '-E', '-d'].indexOf(args[i]) !== -1) options[args[i].slice(1)] = args[++i];
      else if (args[i].charAt(0) !== '-') values.push(args[i]);
    }
    var name = values[0] || ctx.userName;
    var user = ctx.sys.users[name];
    if (!user) return C.fail('chage: user \'' + name + '\' does not exist', 1);
    if (name !== ctx.userName && !C.isRoot(ctx)) return C.fail('chage: Permission denied.', 1);

    if (options.m !== undefined) user.minDays = parseInt(options.m, 10);
    if (options.M !== undefined) user.maxDays = parseInt(options.M, 10);
    if (options.W !== undefined) user.warnDays = parseInt(options.W, 10);
    if (options.I !== undefined) user.inactiveDays = parseInt(options.I, 10);
    if (options.E !== undefined) user.expireDays = options.E;
    if (options.d !== undefined) user.lastChange = parseInt(options.d, 10);

    if (options.l) {
      var last = new Date(Date.now() - ((Math.floor(Date.now() / 86400000) - (user.lastChange || 0)) * 86400000));
      function dateText(value) { return value === -1 || value === undefined ? 'never' : String(value); }
      return C.ok([
        'Last password change                                    : ' + last.toISOString().slice(0, 10),
        'Password expires                                        : never',
        'Password inactive                                       : ' + dateText(user.inactiveDays),
        'Account expires                                         : ' + dateText(user.expireDays),
        'Minimum number of days between password change          : ' + (user.minDays || 0),
        'Maximum number of days between password change          : ' + (user.maxDays === undefined ? 99999 : user.maxDays),
        'Number of days of warning before password expires       : ' + (user.warnDays || 7)
      ].join('\n') + '\n');
    }
    sync(ctx);
    return C.ok('');
  });

  reg('visudo', function (ctx, args) {
    if (args.indexOf('-c') === -1) {
      return C.fail('visudo: this sandbox does not open an editor; use visudo -c to validate.\n', 1);
    }
    var bad = [];
    var files = ['/etc/sudoers'].concat(Object.keys(ctx.sys.fs).filter(function (path) { return path.indexOf('/etc/sudoers.d/') === 0; }));
    files.forEach(function (path) {
      var node = ctx.sys.fs[path];
      if (!node || node.type !== 'file') return;
      C.splitLines(node.content).forEach(function (line, index) {
        if (!line.trim() || line.trim().charAt(0) === '#') return;
        if (!/^(%?[A-Za-z0-9_.-]+|Defaults|User_Alias|Runas_Alias|Host_Alias|Cmnd_Alias)\b/.test(line.trim())) {
          bad.push(path + ':' + (index + 1) + ': syntax error near \'' + line.trim() + '\'');
        }
      });
    });
    if (bad.length) return C.both(bad.join('\n') + '\n', '', 1);
    return C.ok('/etc/sudoers: parsed OK\n' + Object.keys(ctx.sys.fs).filter(function (path) { return path.indexOf('/etc/sudoers.d/') === 0; }).map(function (path) { return path + ': parsed OK'; }).join('\n') + '\n');
  });

  reg('id', function (ctx, args) {
    var userName = ctx.userName;
    var showUid = false;
    var showGid = false;
    var showGroups = false;
    var names = false;
    var values = [];
    args.forEach(function (arg) {
      if (arg === '-u') showUid = true;
      else if (arg === '-g') showGid = true;
      else if (arg === '-G') showGroups = true;
      else if (arg === '-n') names = true;
      else if (arg === '-Z') { /* context below */ }
      else if (arg.charAt(0) !== '-') values.push(arg);
    });
    if (values[0]) userName = values[0];
    var user = ctx.sys.users[userName];
    if (!user) return C.fail('id: \'' + userName + '\': no such user', 1);
    var gids = VFS.userGids(ctx.sys, user);
    var groupNames = gids.map(function (gid) { return VFS.groupName(ctx.sys, gid); });
    if (showUid) return C.ok((names ? userName : String(user.uid)) + '\n');
    if (showGid) return C.ok((names ? VFS.groupName(ctx.sys, user.gid) : String(user.gid)) + '\n');
    if (showGroups) return C.ok((names ? groupNames.join(' ') : gids.join(' ')) + '\n');
    var text = 'uid=' + user.uid + '(' + userName + ') gid=' + user.gid + '(' + VFS.groupName(ctx.sys, user.gid) + ')';
    if (groupNames.length) text += ' groups=' + groupNames.map(function (name) { return name; }).join(',');
    if (args.indexOf('-Z') !== -1) text += ' context=unconfined_u:unconfined_r:unconfined_t:s0-s0:c0.c1023';
    return C.ok(text + '\n');
  });

  reg('groups', function (ctx, args) {
    var userName = args[0] || ctx.userName;
    var user = ctx.sys.users[userName];
    if (!user) return C.fail('groups: \'' + userName + '\': no such user', 1);
    var names = VFS.userGids(ctx.sys, user).map(function (gid) { return VFS.groupName(ctx.sys, gid); });
    return C.ok(userName + ' : ' + names.join(' ') + '\n');
  });

  reg('whoami', function (ctx) { return C.ok(ctx.userName + '\n'); });

  reg('getent', function (ctx, args) {
    var database = args[0];
    var key = args[1];
    var sys = ctx.sys;
    if (!database) return C.fail('Usage: getent database [key ...]', 2);
    if (database === 'passwd') {
      var passwd = C.splitLines(sys.fs['/etc/passwd'].content);
      var found = passwd.filter(function (line) { return !key || line.split(':')[0] === key || line.split(':')[2] === key; });
      return C.ok(found.join('\n') + (found.length ? '\n' : ''), found.length ? 0 : 2);
    }
    if (database === 'group') {
      var group = C.splitLines(sys.fs['/etc/group'].content);
      var groups = group.filter(function (line) { return !key || line.split(':')[0] === key || line.split(':')[2] === key; });
      return C.ok(groups.join('\n') + (groups.length ? '\n' : ''), groups.length ? 0 : 2);
    }
    if (database === 'shadow') {
      if (!C.isRoot(ctx)) return C.fail('getent: Permission denied', 2);
      var shadow = C.splitLines(sys.fs['/etc/shadow'].content);
      var shadows = shadow.filter(function (line) { return !key || line.split(':')[0] === key; });
      return C.ok(shadows.join('\n') + (shadows.length ? '\n' : ''), shadows.length ? 0 : 2);
    }
    if (database === 'hosts') {
      var hosts = C.splitLines(sys.fs['/etc/hosts'].content);
      var matches = hosts.filter(function (line) { return !key || line.indexOf(key) !== -1; });
      return C.ok(matches.join('\n') + (matches.length ? '\n' : ''), matches.length ? 0 : 2);
    }
    return C.fail('getent: Unknown database: ' + database, 2);
  });

  reg('sudo', function (ctx, args, stdin) {
    var target = 'root';
    var runLogin = false;
    var list = false;
    var command = [];
    var i = 0;
    while (i < args.length) {
      var arg = args[i];
      if (arg === '--') { i += 1; break; }
      if (arg === '-u' && args[i + 1]) { target = args[i + 1]; i += 2; continue; }
      if (/^-u./.test(arg)) { target = arg.slice(2); i += 1; continue; }
      if (arg === '-i' || arg === '--login') { runLogin = true; i += 1; continue; }
      if (arg === '-l' || arg === '--list') { list = true; i += 1; continue; }
      if (arg === '-s' || arg === '-E' || arg === '-H' || arg === '-n') { i += 1; continue; }
      if (arg.charAt(0) === '-') { i += 1; continue; }
      break;
    }
    command = args.slice(i);

    if (!isWheel(ctx)) {
      Machine.journal(ctx.sys, 'sudo', 3, ctx.userName + ' : user NOT in sudoers ; TTY=pts/0 ; COMMAND=' + command.join(' '), 0);
      return C.fail(ctx.userName + ' is not in the sudoers file. This incident will be reported.', 1);
    }
    if (list) {
      return C.ok('Matching Defaults entries for ' + ctx.userName + ' on ' + ctx.sys.hostname + ':\n    !visiblepw, always_set_home, match_group_by_gid, always_query_group_plugin\n\nUser ' + ctx.userName + ' may run the following commands on ' + ctx.sys.hostname + ':\n    (ALL) ALL\n');
    }
    if (runLogin) {
      if (!ctx.shell || !ctx.shell.switchUser) return C.fail('sudo: shell integration unavailable', 1);
      ctx.shell.switchUser('root', true);
      Machine.journal(ctx.sys, 'sudo', 6, ctx.userName + ' : TTY=pts/0 ; PWD=' + ctx.sys.cwd + ' ; USER=root ; COMMAND=/bin/bash -l', 0);
      return C.ok('');
    }
    if (!command.length) return C.fail('usage: sudo [-u user] command [args]', 1);
    var targetUser = ctx.sys.users[target];
    if (!targetUser) return C.fail('sudo: unknown user ' + target, 1);
    if (!ctx.shell || !ctx.shell.runAs) return C.fail('sudo: shell integration unavailable', 1);
    Machine.journal(ctx.sys, 'sudo', 6, ctx.userName + ' : TTY=pts/0 ; PWD=' + ctx.sys.cwd + ' ; USER=' + target + ' ; COMMAND=' + command.join(' '), 0);
    ctx.sys.sudoLog.push({ user: ctx.userName, target: target, command: command.join(' '), time: new Date().toISOString() });
    return ctx.shell.runAs(target, command, stdin, ctx);
  });

  reg('su', function (ctx, args, stdin) {
    var login = false;
    var command = null;
    var target = 'root';
    var i = 0;
    while (i < args.length) {
      if (args[i] === '-') { login = true; i += 1; continue; }
      if (args[i] === '-c' && args[i + 1]) { command = args[i + 1]; i += 2; continue; }
      if (args[i] === '-s' && args[i + 1]) { i += 2; continue; }
      if (args[i].charAt(0) === '-') { i += 1; continue; }
      target = args[i];
      i += 1;
    }
    var user = ctx.sys.users[target];
    if (!user) return C.fail('su: user ' + target + ' does not exist or the user entry does not contain all the required fields', 1);
    if (!C.isRoot(ctx) && user.locked) return C.fail('su: Authentication failure', 1);
    if (command !== null) {
      if (!ctx.shell || !ctx.shell.runAsLine) return C.fail('su: shell integration unavailable', 1);
      return ctx.shell.runAsLine(target, command, stdin, ctx);
    }
    if (!ctx.shell || !ctx.shell.switchUser) return C.fail('su: shell integration unavailable', 1);
    ctx.shell.switchUser(target, login);
    Machine.journal(ctx.sys, 'su', 5, ctx.userName + ' to ' + target + ' on pts/0', 0);
    return C.ok('');
  });
})(typeof window !== 'undefined' ? window : globalThis);
