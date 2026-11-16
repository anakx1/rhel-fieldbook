/* ==========================================================================
   RHEL Fieldbook — system state commands
   Services, journal, processes, packages, firewall, SELinux, network, storage.
   ========================================================================== */

(function (root) {
  'use strict';

  var SB = root.RHEL_SANDBOX;
  var C = SB.commands;
  var VFS = SB.vfs;
  var Machine = SB.machine;
  var reg = C.register;

  function nextPid(sys) {
    var max = 0;
    (sys.processes || []).forEach(function (proc) { if (proc.pid > max) max = proc.pid; });
    return max + 1;
  }

  function serviceName(name) {
    return String(name || '').replace(/\.service$/, '');
  }

  function serviceInstalled(sys, service) {
    if (!service.package) return true;
    return !!(sys.packages.installed && sys.packages.installed[service.package]);
  }

  function unitProcess(sys, unit) {
    return (sys.processes || []).filter(function (proc) { return proc.unit === unit; });
  }

  function addServiceProcess(sys, service) {
    if (unitProcess(sys, service.name).length) return;
    var cmd = '/usr/sbin/' + service.name;
    if (service.name === 'sshd') cmd = '/usr/sbin/sshd -D';
    else if (service.name === 'firewalld') cmd = '/usr/sbin/firewalld --nofork --nopid';
    else if (service.name === 'httpd') cmd = '/usr/sbin/httpd -DFOREGROUND';
    else if (service.name === 'chronyd') cmd = '/usr/sbin/chronyd -F 2';
    else if (service.name === 'NetworkManager') cmd = '/usr/sbin/NetworkManager --no-daemon';
    else if (service.name === 'crond') cmd = '/usr/sbin/crond -n';
    else if (service.name === 'auditd') cmd = '/sbin/auditd';
    var pid = nextPid(sys);
    service.pid = pid;
    sys.processes.push({
      pid: pid, ppid: 1, user: 'root', cmd: cmd, unit: service.name,
      state: 'S', cpu: '0.0', mem: '0.2', tty: '?', etime: '00:00'
    });
  }

  function removeServiceProcess(sys, service) {
    sys.processes = (sys.processes || []).filter(function (proc) { return proc.unit !== service.name; });
    service.pid = null;
  }

  function startService(ctx, name) {
    var service = ctx.sys.services[name];
    if (!service) return { ok: false, message: 'Unit ' + name + '.service not found.' };
    if (!serviceInstalled(ctx.sys, service)) return { ok: false, message: 'Unit ' + name + '.service not found.' };
    if (service.active) return { ok: true };
    service.active = true;
    service.state = 'running';
    addServiceProcess(ctx.sys, service);
    Machine.journal(ctx.sys, name, 6, 'Started ' + name + '.service - ' + service.description + '.', service.pid);
    return { ok: true };
  }

  function stopService(ctx, name) {
    var service = ctx.sys.services[name];
    if (!service) return { ok: false, message: 'Unit ' + name + '.service not found.' };
    if (!service.active) return { ok: true };
    service.active = false;
    service.state = 'dead';
    removeServiceProcess(ctx.sys, service);
    Machine.journal(ctx.sys, name, 6, 'Stopped ' + name + '.service - ' + service.description + '.', 0);
    return { ok: true };
  }

  function statusLine(service) {
    var active = service.active ? 'active (running)' : 'inactive (dead)';
    return '     Active: ' + active + ' since Sat 2026-11-14 09:00:00 UTC; 2 days ago';
  }

  function systemctl(ctx, args) {
    var now = false;
    var noPager = false;
    var typeFilter = null;
    var stateFilter = null;
    var values = [];
    var failed = false;
    for (var i = 0; i < args.length; i++) {
      var arg = args[i];
      if (arg === '--now') now = true;
      else if (arg === '--no-pager') noPager = true;
      else if (arg === '--failed') failed = true;
      else if (arg === '--type' && args[i + 1]) { typeFilter = args[++i]; continue; }
      else if (/^--type=/.test(arg)) typeFilter = arg.split('=')[1];
      else if (arg === '--state' && args[i + 1]) { stateFilter = args[++i]; continue; }
      else if (/^--state=/.test(arg)) stateFilter = arg.split('=')[1];
      else if (arg === '--all' || arg === '--no-legend' || arg === '-l' || arg === '--full') { /* accepted */ }
      else values.push(arg);
    }
    var command = values.shift();
    var target = serviceName(values[0]);
    var sys = ctx.sys;
    sys.evidence = sys.evidence || {};

    if (failed) {
      sys.evidence['services:failed'] = true;
      return C.ok('  UNIT LOAD ACTIVE SUB DESCRIPTION\n\n0 loaded units listed.\n');
    }
    if (!command) command = 'list-units';

    if (command === 'status') {
      if (!target) return C.fail('systemctl: too few arguments', 1);
      if (target === 'sshd') sys.evidence['services:status:sshd'] = true;
      var service = sys.services[target];
      if (!service || !serviceInstalled(sys, service)) return C.fail('Unit ' + target + '.service could not be found.', 4);
      var loaded = service.enabled ? 'enabled' : 'disabled';
      var lines = [
        '● ' + target + '.service - ' + service.description,
        '     Loaded: loaded (/usr/lib/systemd/system/' + target + '.service; ' + loaded + '; preset: disabled)',
        statusLine(service),
        '       Docs: man:' + target + '(8)',
        service.pid ? '   Main PID: ' + service.pid + ' (' + target + ')' : '   Main PID: ' + (service.pid || 0) + ' (code=exited, status=0/SUCCESS)',
        '      Tasks: ' + (service.active ? 1 : 0) + ' (limit: 10000)',
        '     Memory: ' + (service.active ? '5.2M' : '0B'),
        '        CPU: ' + (service.active ? '132ms' : '0'),
        '     CGroup: /system.slice/' + target + '.service'
      ];
      if (service.active) lines.push('             └─' + service.pid + ' ' + '/usr/sbin/' + target);
      return C.both(lines.join('\n') + '\n', '', service.active ? 0 : 3);
    }

    if (command === 'start' || command === 'stop' || command === 'restart' || command === 'reload' || command === 'try-restart') {
      if (!C.isRoot(ctx)) return C.fail('Failed to ' + command + ' ' + target + '.service: Access denied', 1);
      if (!target) return C.fail('systemctl: too few arguments', 1);
      if (command === 'restart' || command === 'try-restart') {
        var restart = stopService(ctx, target);
        if (!restart.ok) return C.fail('Failed to restart ' + target + '.service: ' + restart.message, 1);
        var started = startService(ctx, target);
        if (!started.ok) return C.fail('Failed to restart ' + target + '.service: ' + started.message, 1);
        return C.ok('');
      }
      if (command === 'stop') {
        var stopped = stopService(ctx, target);
        if (!stopped.ok) return C.fail('Failed to stop ' + target + '.service: ' + stopped.message, 1);
        return C.ok('');
      }
      if (command === 'reload') {
        if (!sys.services[target] || !sys.services[target].active) return C.fail('Failed to reload ' + target + '.service: Unit not active.', 1);
        Machine.journal(sys, target, 6, 'Reloaded ' + target + '.service.', 0);
        return C.ok('');
      }
      var result = startService(ctx, target);
      if (!result.ok) return C.fail('Failed to start ' + target + '.service: ' + result.message, 1);
      return C.ok('');
    }

    if (command === 'enable' || command === 'disable') {
      if (!C.isRoot(ctx)) return C.fail('Failed to ' + command + ' unit: Access denied', 1);
      if (!target) return C.fail('systemctl: too few arguments', 1);
      var service = sys.services[target];
      if (!service || !serviceInstalled(sys, service)) return C.fail('Failed to ' + command + ' unit: Unit file ' + target + '.service does not exist.', 1);
      service.enabled = command === 'enable';
      if (now) {
        if (command === 'enable') {
          var start = startService(ctx, target);
          if (!start.ok) return C.fail('Failed to start ' + target + '.service: ' + start.message, 1);
        } else {
          var stop = stopService(ctx, target);
          if (!stop.ok) return C.fail('Failed to stop ' + target + '.service: ' + stop.message, 1);
        }
      }
      Machine.journal(sys, target, 6, (command === 'enable' ? 'Enabled' : 'Disabled') + ' ' + target + '.service.', 0);
      return C.ok('');
    }

    if (command === 'is-active') {
      var activeService = sys.services[target];
      var active = activeService && activeService.active;
      return C.ok((active ? 'active' : 'inactive') + '\n', active ? 0 : 3);
    }
    if (command === 'is-enabled') {
      var enabledService = sys.services[target];
      var enabled = enabledService && enabledService.enabled;
      if (target === 'sshd') sys.evidence['services:enabled:sshd'] = true;
      return C.ok((enabled ? 'enabled' : 'disabled') + '\n', enabled ? 0 : 1);
    }
    if (command === 'is-failed') {
      var failedService = sys.services[target];
      return C.ok((failedService && failedService.state === 'failed' ? 'failed' : 'active') + '\n', failedService && failedService.state === 'failed' ? 1 : 0);
    }
    if (command === 'get-default') {
      sys.evidence['services:default'] = true;
      return C.ok(sys.defaultTarget + '\n');
    }
    if (command === 'set-default') {
      if (!C.isRoot(ctx)) return C.fail('Failed to set default target: Access denied', 1);
      sys.defaultTarget = target || sys.defaultTarget;
      return C.ok('');
    }
    if (command === 'daemon-reload') return C.ok('');
    if (command === 'list-unit-files') {
      var unitFiles = ['UNIT FILE STATE'];
      Object.keys(sys.services).forEach(function (name) {
        var item = sys.services[name];
        if (!serviceInstalled(sys, item)) return;
        unitFiles.push(name + '.service ' + (item.enabled ? 'enabled' : 'disabled'));
      });
      return C.ok(unitFiles.join('\n') + '\n');
    }
    if (command === 'list-units') {
      sys.evidence = sys.evidence || {};
      sys.evidence['services:running'] = true;
      var rows = ['  UNIT LOAD ACTIVE SUB DESCRIPTION'];
      Object.keys(sys.services).forEach(function (name) {
        var item = sys.services[name];
        if (!serviceInstalled(sys, item)) return;
        if (typeFilter && typeFilter !== 'service') return;
        if (stateFilter && ((stateFilter === 'running' && !item.active) || (stateFilter === 'active' && !item.active))) return;
        rows.push('  ' + (name + '.service').padEnd(22, ' ') + 'loaded ' + (item.active ? 'active  ' : 'inactive') + ' ' + (item.active ? 'running' : 'dead   ') + ' ' + item.description);
      });
      rows.push('');
      rows.push(rows.length + ' loaded units listed.');
      return C.ok(rows.join('\n') + '\n');
    }
    if (command === 'show') {
      var show = sys.services[target];
      if (!show) return C.fail('Unit ' + target + '.service could not be found.', 4);
      return C.ok('Id=' + target + '.service\nActiveState=' + (show.active ? 'active' : 'inactive') + '\nUnitFileState=' + (show.enabled ? 'enabled' : 'disabled') + '\n');
    }
    return C.fail('Unknown command verb ' + command + '.', 1);
  }

  reg('systemctl', systemctl);

  reg('journalctl', function (ctx, args) {
    var unit = null;
    var count = null;
    var priority = null;
    var noPager = false;
    var since = null;
    for (var i = 0; i < args.length; i++) {
      var arg = args[i];
      if (arg === '-u' || arg === '--unit') { unit = serviceName(args[++i]); continue; }
      if (/^--unit=/.test(arg)) { unit = serviceName(arg.split('=')[1]); continue; }
      if (arg === '-n' || arg === '--lines') { count = parseInt(args[++i], 10); continue; }
      if (arg === '-p' || arg === '--priority') {
        var level = args[++i];
        priority = level === 'err' || level === 'error' ? 3 : level === 'warning' ? 4 : level === 'notice' ? 5 : level === 'info' ? 6 : level === 'debug' ? 7 : parseInt(level, 10);
        continue;
      }
      if (arg === '--since') { since = args[++i]; continue; }
      if (arg === '--no-pager') noPager = true;
      if (arg === '-b' || arg === '--boot' || arg === '-f' || arg === '--follow' || arg === '--no-hostname') continue;
    }
    var entries = ctx.sys.journal.slice();
    ctx.sys.evidence = ctx.sys.evidence || {};
    if (unit === 'sshd') ctx.sys.evidence['services:journal:sshd'] = true;
    if (unit) entries = entries.filter(function (entry) { return serviceName(entry.unit) === unit; });
    if (priority !== null) entries = entries.filter(function (entry) { return entry.priority <= priority; });
    if (count !== null && count >= 0) entries = entries.slice(-count);
    if (!entries.length) return C.ok('-- No entries --\n');
    var out = [];
    if (!noPager) out.push('-- Logs begin at Sat 2026-11-14 09:00:00 UTC, end at ' + new Date().toUTCString() + ' --');
    entries.forEach(function (entry) {
      out.push(entry.ts + ' ' + ctx.sys.hostname + ' ' + entry.unit + '[' + (entry.pid || 0) + ']: ' + entry.message);
    });
    return C.ok(out.join('\n') + '\n');
  });

  function processRows(ctx, options) {
    var rows = (ctx.sys.processes || []).slice();
    if (options.pid) rows = rows.filter(function (proc) { return proc.pid === options.pid; });
    if (options.user) rows = rows.filter(function (proc) { return proc.user === options.user; });
    rows.sort(function (a, b) { return a.pid - b.pid; });
    return rows;
  }

  function psFormat(ctx, options) {
    var rows = processRows(ctx, options);
    var columns = options.columns || ['PID', 'TTY', 'TIME', 'CMD'];
    var out = [columns.map(function (col) { return col.toUpperCase(); }).join(' ')];
    rows.forEach(function (proc) {
      var values = columns.map(function (col) {
        var key = col.toLowerCase();
        if (key === 'pid') return proc.pid;
        if (key === 'ppid') return proc.ppid;
        if (key === 'user' || key === 'uid') return proc.user;
        if (key === 'stat' || key === 'state') return proc.state || 'S';
        if (key === 'etime') return proc.etime || '00:00';
        if (key === 'time') return '00:00:00';
        if (key === 'tty') return proc.tty || '?';
        if (key === 'cmd' || key === 'command') return proc.cmd;
        if (key === 'comm') return proc.cmd.split(' ')[0].split('/').pop();
        if (key === '%cpu') return proc.cpu || '0.0';
        if (key === '%mem') return proc.mem || '0.0';
        if (key === 'vsz') return '120000';
        if (key === 'rss') return '8400';
        if (key === 'start') return '09:00';
        if (key === 'c') return '0';
        if (key === 'z') return 'system_u:system_r:' + (proc.unit === 'session' ? 'unconfined_t' : 'init_t') + ':s0';
        return '';
      });
      out.push(values.join(' '));
    });
    return out.join('\n') + '\n';
  }

  reg('ps', function (ctx, args) {
    var options = { columns: null, pid: null, user: null };
    var aux = args.indexOf('aux') !== -1 || args.indexOf('-aux') !== -1;
    var e = false;
    var f = false;
    var z = false;
    for (var i = 0; i < args.length; i++) {
      var arg = args[i];
      if (arg === 'aux' || arg === '-aux') { aux = true; continue; }
      if (/^-[a-zA-Z]+$/.test(arg)) {
        for (var j = 1; j < arg.length; j++) {
          if (arg.charAt(j) === 'e') e = true;
          if (arg.charAt(j) === 'f') f = true;
          if (arg.charAt(j) === 'Z') z = true;
        }
        continue;
      }
      if (arg === '-o' && args[i + 1]) { options.columns = args[++i].split(','); continue; }
      if (arg === '-p' && args[i + 1]) { options.pid = parseInt(args[++i], 10); continue; }
      if (arg === '-u' && args[i + 1]) { options.user = args[++i]; continue; }
    }
    if (options.columns) {
      if (z && options.columns.indexOf('label') === -1) options.columns.push('label');
      return C.ok(psFormat(ctx, options));
    }
    if (aux) {
      var rows = processRows(ctx, options);
      var out = ['USER         PID %CPU %MEM    VSZ   RSS TTY      STAT START   TIME COMMAND'];
      rows.forEach(function (proc) {
        out.push((proc.user + '').padEnd(10, ' ') + String(proc.pid).padStart(7, ' ') + ' ' + (proc.cpu || '0.0').padStart(4, ' ') + ' ' + (proc.mem || '0.0').padStart(4, ' ') + ' 120000  8400 ' + (proc.tty || '?').padEnd(8, ' ') + (proc.state || 'S') + '    ' + (proc.start || '09:00') + ' 00:00:00 ' + proc.cmd);
      });
      return C.ok(out.join('\n') + '\n');
    }
    if (e || f) {
      var ef = ['UID          PID    PPID  C STIME TTY          TIME CMD'];
      processRows(ctx, options).forEach(function (proc) {
        ef.push((proc.user + '').padEnd(10, ' ') + String(proc.pid).padStart(7, ' ') + String(proc.ppid || 0).padStart(7, ' ') + '  0 09:00 ' + (proc.tty || '?').padEnd(8, ' ') + ' 00:00:00 ' + proc.cmd);
      });
      return C.ok(ef.join('\n') + '\n');
    }
    if (!options.pid) {
      var session = processRows(ctx, {}).filter(function (proc) { return proc.unit === 'session'; });
      if (session.length) options.pid = session[0].pid;
    }
    if (options.pid) {
      var one = processRows(ctx, options);
      if (!one.length) return C.ok('    PID TTY          TIME CMD\n', 1);
      return C.ok('    PID TTY          TIME CMD\n' + String(one[0].pid).padStart(7, ' ') + ' ' + (one[0].tty || '?').padEnd(8, ' ') + ' 00:00:00 ' + one[0].cmd + '\n');
    }
    return C.ok('    PID TTY          TIME CMD\n');
  });

  reg('top', function (ctx) {
    var rows = processRows(ctx, {});
    var out = [
      'top - 09:30:00 up 2 days,  3:14,  3 users,  load average: 0.08, 0.03, 0.01',
      'Tasks: ' + (rows.length + 90) + ' total,   1 running, ' + (rows.length + 89) + ' sleeping,   0 stopped,   0 zombie',
      '%Cpu(s):  0.3 us,  0.2 sy,  0.0 ni, 99.4 id,  0.1 wa,  0.0 hi,  0.0 si,  0.0 st',
      'MiB Mem :   3906.0 total,   1100.0 free,   1200.0 used,   1606.0 buff/cache',
      'MiB Swap:   2048.0 total,   2048.0 free,      0.0 used.   2400.0 avail Mem',
      '',
      '    PID USER      PR  NI    VIRT    RES    SHR S  %CPU  %MEM     TIME+ COMMAND'
    ];
    rows.slice(0, 12).forEach(function (proc) {
      out.push(String(proc.pid).padStart(7, ' ') + ' ' + (proc.user + '').padEnd(8, ' ') + ' 20   0  120000   8400   6200 ' + (proc.state || 'S') + '   ' + (proc.cpu || '0.0').padStart(4, ' ') + '   ' + (proc.mem || '0.1').padStart(4, ' ') + '   0:00.12 ' + proc.cmd.split(' ')[0].split('/').pop());
    });
    return C.ok(out.join('\n') + '\n');
  });

  reg('systemd-cgtop', function (ctx) {
    return C.ok('Control Group                                Tasks   %CPU   Memory  Input/s Output/s\n/system.slice                                  120    0.3    820.1M        -        -\n/system.slice/sshd.service                       1    0.0      5.2M        -        -\n');
  });

  reg('pgrep', function (ctx, args) {
    var all = false;
    var newest = false;
    var user = null;
    var pattern = null;
    for (var i = 0; i < args.length; i++) {
      if (args[i] === '-a') all = true;
      else if (args[i] === '-n') newest = true;
      else if (args[i] === '-u' && args[i + 1]) user = args[++i];
      else if (args[i].charAt(0) !== '-') pattern = args[i];
    }
    if (!pattern) return C.fail('pgrep: missing pattern', 2);
    var re;
    try { re = new RegExp(pattern, 'i'); } catch (e) { return C.fail('pgrep: invalid pattern', 2); }
    var matches = (ctx.sys.processes || []).filter(function (proc) {
      if (user && proc.user !== user) return false;
      return re.test(proc.cmd);
    }).sort(function (a, b) { return a.pid - b.pid; });
    if (newest) matches = matches.slice(-1);
    if (!matches.length) return C.ok('', 1);
    if (all) return C.ok(matches.map(function (proc) { return proc.pid + ' ' + proc.cmd; }).join('\n') + '\n');
    return C.ok(matches.map(function (proc) { return proc.pid; }).join('\n') + '\n');
  });

  reg('pkill', function (ctx, args) {
    var signal = 'TERM';
    var pattern = null;
    for (var i = 0; i < args.length; i++) {
      if (args[i] === '-TERM' || args[i] === '-15' || args[i] === '-9' || args[i] === '-KILL') signal = args[i];
      else if (args[i].charAt(0) !== '-') pattern = args[i];
    }
    if (!pattern) return C.fail('pkill: missing pattern', 2);
    var before = ctx.sys.processes.length;
    ctx.sys.processes = ctx.sys.processes.filter(function (proc) { return proc.cmd.indexOf(pattern) === -1; });
    if (ctx.sys.processes.length === before) return C.ok('', 1);
    Machine.journal(ctx.sys, 'systemd', 5, 'Process matching ' + pattern + ' terminated with SIG' + signal.replace(/^-/, ''), 0);
    return C.ok('');
  });

  reg('kill', function (ctx, args) {
    var signal = 'TERM';
    var pid = null;
    for (var i = 0; i < args.length; i++) {
      if (args[i].charAt(0) === '-') signal = args[i].slice(1);
      else pid = parseInt(args[i], 10);
    }
    if (!pid) return C.fail('kill: usage: kill [-s sigspec | -n signum | -sigspec] pid', 2);
    var proc = (ctx.sys.processes || []).filter(function (item) { return item.pid === pid; })[0];
    if (!proc) return C.fail('bash: kill: (' + pid + ') - No such process', 1);
    if (signal === '9' || signal === 'KILL') {
      ctx.sys.processes = ctx.sys.processes.filter(function (item) { return item.pid !== pid; });
    } else if (signal === 'STOP' || signal === '19') {
      proc.state = 'T';
    } else {
      ctx.sys.processes = ctx.sys.processes.filter(function (item) { return item.pid !== pid; });
    }
    Machine.journal(ctx.sys, 'systemd', 5, 'Process ' + pid + ' received SIG' + signal + '.', pid);
    return C.ok('');
  });

  reg('jobs', function () {
    return C.ok('');
  });

  function packageString(pkg) {
    return pkg.name + '-' + pkg.version + '-' + pkg.release + '.' + pkg.arch;
  }

  function ensurePackageFiles(ctx, pkg) {
    (pkg.files || []).forEach(function (path) {
      if (ctx.sys.fs[path]) return;
      var parent = VFS.dirname(path);
      if (!ctx.sys.fs[parent]) return;
      var node = C.newFileNode(ctx.sys, { user: ctx.sys.users.root, userName: 'root' }, path, 'installed by ' + pkg.name + '\n', /^\/usr\/sbin\//.test(path) || /^\/usr\/bin\//.test(path) ? 493 : 420);
      node.uid = 0;
      node.gid = 0;
      ctx.sys.fs[path] = node;
    });
  }

  function dnfHistory(ctx, command, packages) {
    ctx.sys.dnfHistory = ctx.sys.dnfHistory || [];
    var id = ctx.sys.dnfHistory.length + 1;
    ctx.sys.dnfHistory.push({ id: id, command: command, date: new Date().toISOString(), user: ctx.userName, packages: packages });
    return id;
  }

  function dnf(ctx, args) {
    var assume = false;
    var command = null;
    var values = [];
    for (var i = 0; i < args.length; i++) {
      if (args[i] === '-y' || args[i] === '--assumeyes' || args[i] === '-q' || args[i] === '--quiet') { if (args[i] === '-y' || args[i] === '--assumeyes') assume = true; continue; }
      if (args[i] === '--enablerepo' && args[i + 1]) { i += 1; continue; }
      if (args[i].charAt(0) === '-') continue;
      if (!command) command = args[i];
      else values.push(args[i]);
    }
    command = command || 'list';
    var sys = ctx.sys;
    var installed = sys.packages.installed;
    var available = sys.packages.available || {};

    if (command === 'repolist') {
      return C.ok('repo id                     repo name                                status\nbaseos                      RHEL 9 BaseOS                            enabled\nappstream                   RHEL 9 AppStream                         enabled\n');
    }
    if (command === 'info') {
      var name = values[0];
      var pkg = installed[name] || available[name];
      if (!pkg) return C.fail('Error: No matching Packages to list', 1);
      return C.ok([
        'Name         : ' + pkg.name,
        'Epoch        : 0',
        'Version      : ' + pkg.version,
        'Release      : ' + pkg.release,
        'Architecture : ' + pkg.arch,
        'Size         : 1.2 M',
        'Source       : ' + pkg.name + '-' + pkg.version + '-' + pkg.release + '.src.rpm',
        'Repository   : ' + (installed[name] ? '@System' : 'appstream'),
        'Summary      : ' + pkg.summary,
        'License      : Open Source',
        'Description  : ' + pkg.summary + '.'
      ].join('\n') + '\n');
    }
    if (command === 'list') {
      var mode = values[0] || 'installed';
      var out = ['Available Packages'];
      var source = mode === 'available' ? available : installed;
      Object.keys(source).sort().forEach(function (name) { out.push(packageString(source[name])); });
      return C.ok(out.join('\n') + '\n');
    }
    if (command === 'check-update') {
      return C.ok('Last metadata expiration check: 0:12:34 ago on Sat 14 Nov 2026 09:17:00 AM UTC.\n');
    }
    if (command === 'makecache') {
      Machine.journal(sys, 'systemd', 6, 'Finished dnf makecache.', 0);
      return C.ok('Metadata cache created.\n');
    }
    if (command === 'clean') {
      return C.ok('0 files removed\n');
    }
    if (command === 'search') {
      var needle = (values[0] || '').toLowerCase();
      var found = [];
      Object.keys(installed).concat(Object.keys(available)).forEach(function (name) {
        var pkg = installed[name] || available[name];
        if (name.toLowerCase().indexOf(needle) !== -1 || pkg.summary.toLowerCase().indexOf(needle) !== -1) found.push(packageString(pkg) + ' : ' + pkg.summary);
      });
      return C.ok(found.length ? found.join('\n') + '\n' : 'No matches found.\n', found.length ? 0 : 1);
    }
    if (command === 'provides') {
      var file = values[0];
      var owner = null;
      Object.keys(installed).forEach(function (name) {
        if ((installed[name].files || []).indexOf(file) !== -1) owner = installed[name];
      });
      if (owner) return C.ok(packageString(owner) + '\n');
      return C.ok('No matches found.\n', 1);
    }
    if (command === 'history') {
      if (!sys.dnfHistory || !sys.dnfHistory.length) {
        return C.ok('ID     | Command line             | Date and time    | Action(s)      | Altered\n-------------------------------------------------------------------------------\n');
      }
      var hist = ['ID     | Command line             | Date and time    | Action(s)      | Altered', '-------------------------------------------------------------------------------'];
      sys.dnfHistory.forEach(function (entry) {
        hist.push(String(entry.id).padEnd(7, ' ') + '| ' + entry.command.padEnd(25, ' ').slice(0, 25) + '| ' + entry.date.slice(0, 16).replace('T', ' ') + ' | Install        | ' + entry.packages.length);
      });
      return C.ok(hist.join('\n') + '\n');
    }
    if (command === 'install' || command === 'reinstall') {
      if (!C.isRoot(ctx)) return C.fail('Error: This command has to be run with superuser privileges (under the root user on most systems).', 1);
      if (!values.length) return C.fail('Error: Need to specify package names.', 1);
      var toInstall = [];
      var missing = [];
      values.forEach(function (name) {
        if (installed[name]) return;
        if (available[name]) toInstall.push(available[name]);
        else missing.push(name);
      });
      if (missing.length) return C.fail('Error: Unable to find a match: ' + missing.join(' '), 1);
      if (!toInstall.length) {
        return C.ok('Last metadata expiration check: 0:12:34 ago on Sat 14 Nov 2026 09:17:00 AM UTC.\nPackage ' + values[0] + ' is already installed.\nDependencies resolved.\nNothing to do.\nComplete!\n');
      }
      var out = ['Last metadata expiration check: 0:12:34 ago on Sat 14 Nov 2026 09:17:00 AM UTC.', 'Dependencies resolved.', '================================================================================', ' Package          Architecture     Version                 Repository       Size', '================================================================================', 'Installing:'];
      toInstall.forEach(function (pkg) { out.push(' ' + pkg.name.padEnd(16, ' ') + ' ' + pkg.arch.padEnd(16, ' ') + ' ' + (pkg.version + '-' + pkg.release).padEnd(23, ' ') + ' appstream      1.2 M'); });
      out.push('', 'Transaction Summary', '================================================================================', 'Install  ' + toInstall.length + ' Package(s)', '', 'Total download size: 1.2 M', 'Installed size: 3.4 M', 'Is this ok [y/N]: y', 'Downloading Packages:', 'Running transaction check', 'Transaction check succeeded.', 'Running transaction test', 'Transaction test succeeded.', 'Running transaction');
      toInstall.forEach(function (pkg) {
        installed[pkg.name] = pkg;
        delete available[pkg.name];
        ensurePackageFiles(ctx, pkg);
        if (pkg.name === 'httpd') {
          ctx.sys.commandPaths.httpd = '/usr/sbin/httpd';
          if (!ctx.sys.fs['/var/www/html']) ctx.sys.fs['/var/www/html'] = C.newDirNode(ctx.sys, { user: ctx.sys.users.root, userName: 'root' }, '/var/www/html', 493);
        }
        out.push('  Installing : ' + packageString(pkg));
        Machine.journal(ctx.sys, 'dnf', 6, 'Installed: ' + packageString(pkg), 0);
      });
      out.push('', 'Installed:', '  ' + toInstall.map(packageString).join('\n  '), 'Complete!');
      dnfHistory(ctx, 'install ' + values.join(' '), toInstall.map(function (pkg) { return pkg.name; }));
      return C.ok(out.join('\n') + '\n');
    }
    if (command === 'remove' || command === 'erase') {
      if (!C.isRoot(ctx)) return C.fail('Error: This command has to be run with superuser privileges (under the root user on most systems).', 1);
      var remove = [];
      var notInstalled = [];
      values.forEach(function (name) {
        if (installed[name]) remove.push(installed[name]);
        else notInstalled.push(name);
      });
      if (notInstalled.length) return C.fail('No match for argument: ' + notInstalled.join(' '), 1);
      if (!remove.length) return C.fail('Error: No packages marked for removal.', 1);
      remove.forEach(function (pkg) {
        var service = ctx.sys.services[pkg.name];
        if (service && service.active) stopService(ctx, pkg.name);
        delete installed[pkg.name];
        (pkg.files || []).forEach(function (path) {
          if (ctx.sys.fs[path] && path.indexOf('/etc/') !== 0 && path.indexOf('/var/') !== 0) delete ctx.sys.fs[path];
        });
        if (pkg.name === 'httpd') delete ctx.sys.commandPaths.httpd;
        Machine.journal(ctx.sys, 'dnf', 6, 'Removed: ' + packageString(pkg), 0);
      });
      dnfHistory(ctx, 'remove ' + values.join(' '), remove.map(function (pkg) { return pkg.name; }));
      return C.ok(['Dependencies resolved.', '================================================================================', ' Package          Architecture     Version                 Repository       Size', '================================================================================', 'Removing:'].concat(remove.map(function (pkg) { return ' ' + pkg.name; })).concat(['', 'Transaction Summary', 'Remove  ' + remove.length + ' Package(s)', '', 'Freed space: 3.4 M', 'Is this ok [y/N]: y', 'Running transaction check', 'Transaction check succeeded.', 'Running transaction test', 'Transaction test succeeded.', 'Running transaction'].concat(remove.map(function (pkg) { return '  Erasing    : ' + packageString(pkg); })).concat(['', 'Removed:', '  ' + remove.map(packageString).join('\n  '), 'Complete!'])).join('\n') + '\n');
    }
    return C.fail('No such command: ' + command + '. Please use /usr/bin/dnf --help', 1);
  }

  reg('dnf', dnf);

  reg('rpm', function (ctx, args) {
    var installed = ctx.sys.packages.installed;
    if (args.indexOf('-qa') !== -1 || args.indexOf('-q') !== -1 && !args.filter(function (arg) { return arg.charAt(0) !== '-'; }).length) {
      return C.ok(Object.keys(installed).sort().map(function (name) { return packageString(installed[name]); }).join('\n') + '\n');
    }
    var queryFile = false;
    var queryList = false;
    var queryInfo = false;
    var values = [];
    args.forEach(function (arg) {
      if (arg === '-qf') queryFile = true;
      else if (arg === '-ql') queryList = true;
      else if (arg === '-qi') queryInfo = true;
      else if (arg === '-q') { /* query */ }
      else if (arg === '-V' || arg === '--verify') { /* verify */ }
      else if (arg.charAt(0) !== '-') values.push(arg);
    });
    if (queryFile) {
      var path = values[0];
      var owner = null;
      Object.keys(installed).forEach(function (name) {
        if ((installed[name].files || []).indexOf(path) !== -1) owner = installed[name];
      });
      if (!owner) return C.fail('file ' + path + ' is not owned by any package', 1);
      return C.ok(packageString(owner) + '\n');
    }
    var name = values[0];
    if (!name) return C.fail('rpm: no arguments given for query', 1);
    var pkg = installed[name];
    if (!pkg && /^httpd/.test(name)) pkg = installed[name.replace(/\.x86_64$/, '')];
    if (!pkg) return C.fail('package ' + name + ' is not installed', 1);
    if (queryList) return C.ok((pkg.files || []).join('\n') + '\n');
    if (queryInfo) {
      return C.ok('Name        : ' + pkg.name + '\nVersion     : ' + pkg.version + '\nRelease     : ' + pkg.release + '\nArchitecture: ' + pkg.arch + '\nInstall Date: Sat 14 Nov 2026 09:20:00 AM UTC\nSize        : 1234567\nLicense     : Open Source\nSummary     : ' + pkg.summary + '\n');
    }
    return C.ok(packageString(pkg) + '\n');
  });

  reg('firewall-cmd', function (ctx, args) {
    var permanent = false;
    var zone = ctx.sys.firewall.zone;
    var action = null;
    var value = null;
    args.forEach(function (arg) {
      if (arg === '--permanent') permanent = true;
      else if (arg === '--reload') action = 'reload';
      else if (arg === '--state') action = 'state';
      else if (arg === '--list-all') action = 'list-all';
      else if (arg === '--list-services') action = 'list-services';
      else if (arg === '--list-ports') action = 'list-ports';
      else if (arg === '--get-default-zone') action = 'get-default-zone';
      else if (arg === '--get-active-zones') action = 'get-active-zones';
      else if (arg.indexOf('--add-service=') === 0) { action = 'add-service'; value = arg.split('=')[1]; }
      else if (arg.indexOf('--remove-service=') === 0) { action = 'remove-service'; value = arg.split('=')[1]; }
      else if (arg.indexOf('--add-port=') === 0) { action = 'add-port'; value = arg.split('=')[1]; }
      else if (arg.indexOf('--remove-port=') === 0) { action = 'remove-port'; value = arg.split('=')[1]; }
      else if (arg.indexOf('--set-default-zone=') === 0) { action = 'set-default-zone'; value = arg.split('=')[1]; }
      else if (arg.indexOf('--zone=') === 0) zone = arg.split('=')[1];
    });
    var fw = ctx.sys.firewall;
    if (action === 'state') return C.ok('running\n');
    if (action === 'get-default-zone') return C.ok(fw.zone + '\n');
    if (action === 'get-active-zones') return C.ok(fw.zone + '\n  interfaces: ' + fw.interfaces.join(' ') + '\n');
    if (action === 'reload') {
      if (!C.isRoot(ctx)) return C.fail('Authorization failed.', 252);
      fw.runtime = VFS.clone(fw.permanent);
      return C.ok('success\n');
    }
    var bucket = permanent ? fw.permanent : fw.runtime;
    if (action === 'list-services') return C.ok(bucket.services.join(' ') + '\n');
    if (action === 'list-ports') return C.ok(bucket.ports.join(' ') + '\n');
    if (action === 'list-all') {
      return C.ok(fw.zone + ' (active)\n  target: default\n  icmp-block-inversion: no\n  interfaces: ' + fw.interfaces.join(' ') + '\n  sources:\n  services: ' + bucket.services.join(' ') + '\n  ports: ' + bucket.ports.join(' ') + '\n  protocols:\n  forward: yes\n  masquerade: no\n  forward-ports:\n  source-ports:\n  icmp-blocks:\n  rich rules:\n');
    }
    if (action === 'set-default-zone') {
      if (!C.isRoot(ctx)) return C.fail('Authorization failed.', 252);
      fw.zone = value;
      return C.ok('success\n');
    }
    if (action) {
      if (!C.isRoot(ctx)) return C.fail('Authorization failed.', 252);
      if (action === 'add-service' && bucket.services.indexOf(value) === -1) bucket.services.push(value);
      if (action === 'remove-service') bucket.services = bucket.services.filter(function (item) { return item !== value; });
      if (action === 'add-port' && bucket.ports.indexOf(value) === -1) bucket.ports.push(value);
      if (action === 'remove-port') bucket.ports = bucket.ports.filter(function (item) { return item !== value; });
      Machine.journal(ctx.sys, 'firewalld', 6, 'rule changed: ' + action + ' ' + value + (permanent ? ' (permanent)' : ''), 0);
      return C.ok('success\n');
    }
    return C.fail('usage: firewall-cmd [OPTIONS]', 2);
  });

  reg('getenforce', function (ctx) {
    return C.ok(ctx.sys.selinux.mode.charAt(0).toUpperCase() + ctx.sys.selinux.mode.slice(1) + '\n');
  });

  reg('sestatus', function (ctx) {
    return C.ok([
      'SELinux status:                 enabled',
      'SELinuxfs mount:                /sys/fs/selinux',
      'SELinux root directory:         /etc/selinux',
      'Loaded policy name:             ' + ctx.sys.selinux.policy,
      'Current mode:                   ' + ctx.sys.selinux.mode,
      'Mode from config file:          ' + ctx.sys.selinux.mode,
      'Policy MLS status:              enabled',
      'Policy deny_unknown status:     allowed',
      'Memory protection checking:     actual (secure)',
      'Max kernel policy version:      33'
    ].join('\n') + '\n');
  });

  reg('setenforce', function (ctx, args) {
    if (!C.isRoot(ctx)) return C.fail('setenforce: Permission denied', 1);
    var value = args[0];
    if (value === '0' || value === 'Permissive' || value === 'permissive') ctx.sys.selinux.mode = 'permissive';
    else if (value === '1' || value === 'Enforcing' || value === 'enforcing') ctx.sys.selinux.mode = 'enforcing';
    else return C.fail('setenforce: invalid argument', 1);
    return C.ok('');
  });

  reg('getsebool', function (ctx, args) {
    var booleans = ctx.sys.selinux.booleans;
    if (args.indexOf('-a') !== -1 || !args.length) {
      return C.ok(Object.keys(booleans).sort().map(function (name) { return name + ' --> ' + (booleans[name] ? 'on' : 'off'); }).join('\n') + '\n');
    }
    var name = args[0];
    if (booleans[name] === undefined) return C.fail('getsebool: boolean ' + name + ' not found', 1);
    return C.ok(name + ' --> ' + (booleans[name] ? 'on' : 'off') + '\n');
  });

  reg('setsebool', function (ctx, args) {
    if (!C.isRoot(ctx)) return C.fail('setsebool: Permission denied', 1);
    var values = args.filter(function (arg) { return arg.charAt(0) !== '-'; });
    var name = values[0];
    var value = values[1];
    if (!name || value === undefined) return C.fail('setsebool: usage: setsebool [-P] boolean value', 1);
    if (ctx.sys.selinux.booleans[name] === undefined) return C.fail('setsebool: boolean ' + name + ' not found', 1);
    ctx.sys.selinux.booleans[name] = value === 'on' || value === '1' || value === 'true';
    return C.ok('');
  });

  reg('semanage', function (ctx, args) {
    if (!C.isRoot(ctx)) return C.fail('semanage: Permission denied', 1);
    var type = args[0];
    if (type !== 'fcontext') {
      if (type === 'port') return C.ok('');
      return C.fail('semanage: unsupported record type ' + type, 1);
    }
    var action = null;
    var selType = null;
    var pattern = null;
    for (var i = 1; i < args.length; i++) {
      if (args[i] === '-a' || args[i] === '--add') action = 'add';
      else if (args[i] === '-m' || args[i] === '--modify') action = 'modify';
      else if (args[i] === '-d' || args[i] === '--delete') action = 'delete';
      else if (args[i] === '-l' || args[i] === '--list') action = 'list';
      else if (args[i] === '-t' && args[i + 1]) selType = args[++i];
      else if (args[i].charAt(0) !== '-') pattern = args[i];
    }
    if (action === 'list' || !action) {
      var defaults = [
        '/var/www(/.*)?      all files     system_u:object_r:httpd_sys_content_t:s0',
        '/etc/httpd(/.*)?    all files     system_u:object_r:httpd_config_t:s0',
        '/var/log(/.*)?      all files     system_u:object_r:var_log_t:s0',
        '/home(/.*)?         all files     system_u:object_r:user_home_t:s0'
      ];
      ctx.sys.selinux.fcontexts.forEach(function (item) {
        defaults.push(item.pattern + '    all files    system_u:object_r:' + item.type + ':s0');
      });
      return C.ok('SELinux fcontext                                   type               Context\n\n' + defaults.join('\n') + '\n');
    }
    if (!pattern || !selType) return C.fail('semanage: fcontext: missing required option', 1);
    if (action === 'delete') {
      ctx.sys.selinux.fcontexts = ctx.sys.selinux.fcontexts.filter(function (item) { return item.pattern !== pattern; });
      return C.ok('');
    }
    var existing = ctx.sys.selinux.fcontexts.filter(function (item) { return item.pattern === pattern; })[0];
    if (existing) existing.type = selType;
    else ctx.sys.selinux.fcontexts.push({ pattern: pattern, type: selType });
    Machine.journal(ctx.sys, 'semanage', 6, 'fcontext ' + action + ': ' + pattern + ' -> ' + selType, 0);
    return C.ok('');
  });

  reg('restorecon', function (ctx, args) {
    if (!C.isRoot(ctx)) return C.fail('restorecon: Permission denied', 1);
    var verbose = args.indexOf('-v') !== -1 || args.indexOf('-R') !== -1 || args.indexOf('-r') !== -1;
    var values = args.filter(function (arg) { return arg.charAt(0) !== '-'; });
    if (!values.length) return C.fail('restorecon: no path specified', 1);
    var out = [];
    function relabel(path) {
      var node = ctx.sys.fs[path];
      if (!node) return;
      var desired = VFS.contextType(ctx.sys, path);
      if (node.context !== desired) {
        if (verbose) out.push('Relabeled ' + path + ' from ' + VFS.contextString(node) + ' to system_u:object_r:' + desired + ':s0');
        node.context = desired;
      }
      if (node.type === 'dir') C.listChildren(ctx, path).forEach(function (child) { relabel(child.path); });
    }
    values.forEach(function (raw) {
      var resolved = VFS.resolve(ctx.sys, raw, ctx.sys.cwd, ctx.user, false);
      if (resolved.error) { out.push('restorecon: ' + raw + ': ' + resolved.error); return; }
      relabel(resolved.path);
    });
    return C.ok(out.length ? out.join('\n') + '\n' : '');
  });

  reg('chcon', function (ctx, args) {
    var selType = null;
    var values = [];
    for (var i = 0; i < args.length; i++) {
      if (args[i] === '-t' && args[i + 1]) selType = args[++i];
      else if (args[i] === '-R') continue;
      else if (args[i].charAt(0) !== '-') values.push(args[i]);
    }
    if (!selType || !values.length) return C.fail('chcon: missing argument', 1);
    if (!C.isRoot(ctx)) return C.fail('chcon: Permission denied', 1);
    values.forEach(function (raw) {
      var resolved = VFS.resolve(ctx.sys, raw, ctx.sys.cwd, ctx.user, false);
      if (!resolved.error) resolved.node.context = selType;
    });
    return C.ok('');
  });

  reg('ausearch', function () {
    return C.ok('<no matches>\n');
  });

  reg('hostname', function (ctx) { return C.ok(ctx.sys.hostname + '\n'); });

  reg('hostnamectl', function (ctx) {
    return C.ok(' Static hostname: ' + ctx.sys.hostname + '\n       Icon name: computer-vm\n         Chassis: vm\n      Machine ID: 9d3f5b1a2c4e6f8091a2b3c4d5e6f708\n         Boot ID: 1a2b3c4d5e6f70819a2b3c4d5e6f7081\n  Virtualization: kvm\nOperating System: ' + ctx.sys.os + '\n          Kernel: Linux ' + ctx.sys.kernel + '\n    Architecture: x86-64\n');
  });

  reg('uname', function (ctx, args) {
    var all = args.indexOf('-a') !== -1;
    if (all) return C.ok('Linux ' + ctx.sys.hostname + ' ' + ctx.sys.kernel + ' #1 SMP PREEMPT_DYNAMIC x86_64 x86_64 x86_64 GNU/Linux\n');
    if (args.indexOf('-r') !== -1) return C.ok(ctx.sys.kernel + '\n');
    if (args.indexOf('-m') !== -1) return C.ok('x86_64\n');
    if (args.indexOf('-n') !== -1) return C.ok(ctx.sys.hostname + '\n');
    return C.ok('Linux\n');
  });

  reg('date', function (ctx, args) {
    var now = new Date();
    if (args[0] === '+%Y-%m-%d') return C.ok(now.toISOString().slice(0, 10) + '\n');
    if (args[0] === '+%s') return C.ok(Math.floor(now.getTime() / 1000) + '\n');
    return C.ok(now.toUTCString() + '\n');
  });

  reg('uptime', function () {
    return C.ok(' 09:30:00 up 2 days,  3:14,  3 users,  load average: 0.08, 0.03, 0.01\n');
  });

  reg('free', function (ctx, args) {
    var human = args.indexOf('-h') !== -1;
    if (human) return C.ok('               total        used        free      shared  buff/cache   available\nMem:           3.8Gi       1.2Gi       1.1Gi        16Mi       1.6Gi       2.3Gi\nSwap:          2.0Gi          0B       2.0Gi\n');
    return C.ok('               total        used        free      shared  buff/cache   available\nMem:         3999744     1228800     1126400       16384     1644544     2400000\nSwap:        2097148           0     2097148\n');
  });

  reg('vmstat', function () {
    return C.ok('procs -----------memory---------- ---swap-- -----io---- -system-- ------cpu-----\n r  b   swpd   free   buff  cache   si   so    bi    bo   in   cs us sy id wa st\n 1  0      0 1126400  28300 1616244    0    0    12    28  110  220  0  0 99  0  0\n');
  });

  reg('ip', function (ctx) {
    return C.ok('1: lo: <LOOPBACK,UP,LOWER_UP> mtu 65536 qdisc noqueue state UNKNOWN group default qlen 1000\n    link/loopback 00:00:00:00:00:00 brd 00:00:00:00:00:00\n    inet 127.0.0.1/8 scope host lo\n2: ens3: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 qdisc fq_codel state UP group default qlen 1000\n    link/ether 52:54:00:8a:2b:1c brd ff:ff:ff:ff:ff:ff\n    inet 192.0.2.50/24 brd 192.0.2.255 scope global dynamic noprefixroute ens3\n');
  });

  reg('ss', function (ctx, args) {
    var lines = ['State  Recv-Q Send-Q Local Address:Port  Peer Address:Port Process'];
    if (ctx.sys.services.sshd.active) lines.push('LISTEN 0      128          0.0.0.0:22         0.0.0.0:*     users:(("sshd",pid=' + ctx.sys.services.sshd.pid + ',fd=3))');
    if (ctx.sys.services.httpd.active) lines.push('LISTEN 0      511                *:80               *:*     users:(("httpd",pid=' + ctx.sys.services.httpd.pid + ',fd=4))');
    if (args.indexOf('-t') !== -1 || args.indexOf('-l') !== -1) lines.push('LISTEN 0      128             [::]:22            [::]:*     users:(("sshd",pid=' + ctx.sys.services.sshd.pid + ',fd=4))');
    return C.ok(lines.join('\n') + '\n');
  });

  reg('nmcli', function (ctx) {
    return C.ok(' ens3  ethernet  connected  Wired connection 1\n');
  });

  reg('ping', function (ctx, args) {
    var count = 4;
    var host = null;
    for (var i = 0; i < args.length; i++) {
      if (args[i] === '-c' && args[i + 1]) { count = parseInt(args[++i], 10); continue; }
      if (/^-c\d+$/.test(args[i])) { count = parseInt(args[i].slice(2), 10); continue; }
      if (args[i].charAt(0) !== '-') host = args[i];
    }
    if (!host) return C.fail('ping: usage error: Destination address required', 2);
    var lines = ['PING ' + host + ' (' + (host === 'localhost' ? '127.0.0.1' : '192.0.2.53') + ') 56(84) bytes of data.'];
    for (var n = 1; n <= count; n++) lines.push('64 bytes from ' + (host === 'localhost' ? '127.0.0.1' : '192.0.2.53') + ': icmp_seq=' + n + ' ttl=64 time=0.0' + (n + 2) + ' ms');
    lines.push('', '--- ' + host + ' ping statistics ---', count + ' packets transmitted, ' + count + ' received, 0% packet loss, time ' + (count * 1000) + 'ms', 'rtt min/avg/max/mdev = 0.031/0.045/0.060/0.010 ms');
    return C.ok(lines.join('\n') + '\n');
  });

  reg('curl', function (ctx, args) {
    var url = args.filter(function (arg) { return arg.charAt(0) !== '-'; })[0];
    if (!url) return C.fail('curl: try \'curl --help\' for more information', 2);
    if (/localhost|127\.0\.0\.1/.test(url)) {
      if (!ctx.sys.services.httpd.active) return C.fail('curl: (7) Failed to connect to localhost port 80 after 0 ms: Couldn\'t connect to server', 7);
      var read = C.readFile(ctx, '/var/www/html/index.html');
      return C.ok(read.ok ? read.content : '');
    }
    return C.ok('<!doctype html><html><body><h1>' + ctx.sys.hostname + '</h1></body></html>\n');
  });

  reg('ssh', function (ctx, args) {
    var host = args.filter(function (arg) { return arg.charAt(0) !== '-'; })[0];
    if (!host) return C.fail('usage: ssh destination', 255);
    return C.fail('ssh: connect to host ' + host + ' port 22: Connection timed out', 255);
  });

  reg('ssh-keygen', function (ctx, args) {
    return C.ok('Generating public/private rsa key pair.\nYour identification has been saved in /home/student/.ssh/id_rsa\nYour public key has been saved in /home/student/.ssh/id_rsa.pub\nThe key fingerprint is SHA256:fieldbookSandboxExampleKeyFingerprint.\n');
  });

  reg('lvs', function (ctx) {
    var rows = ['  LV   VG   Attr       LSize   Pool Origin Data%  Meta%  Move Log Cpy%Sync Convert'];
    ctx.sys.lvm.lvs.forEach(function (lv) { rows.push('  ' + lv.name.padEnd(4, ' ') + ' ' + lv.vg.padEnd(4, ' ') + ' ' + lv.attr + ' ' + lv.size.padEnd(5, ' ')); });
    return C.ok(rows.join('\n') + '\n');
  });

  reg('vgs', function (ctx) {
    var rows = ['  VG   #PV #LV #SN Attr   VSize  VFree'];
    ctx.sys.lvm.vgs.forEach(function (vg) { rows.push('  ' + vg.name.padEnd(4, ' ') + '   1   2   0 wz--n- ' + vg.size.padEnd(5, ' ') + ' ' + vg.free); });
    return C.ok(rows.join('\n') + '\n');
  });

  reg('pvs', function (ctx) {
    var rows = ['  PV         VG   Fmt  Attr PSize  PFree'];
    ctx.sys.lvm.pvs.forEach(function (pv) { rows.push('  ' + pv.name.padEnd(10, ' ') + ' ' + pv.vg.padEnd(4, ' ') + ' lvm2 a--  ' + pv.size.padEnd(5, ' ') + ' ' + pv.free); });
    return C.ok(rows.join('\n') + '\n');
  });

  reg('lvextend', function (ctx, args) {
    if (!C.isRoot(ctx)) return C.fail('  Permission denied.', 1);
    var size = null;
    var target = null;
    for (var i = 0; i < args.length; i++) {
      if (args[i] === '-L' && args[i + 1]) { size = args[++i]; continue; }
      if (args[i].charAt(0) !== '-') target = args[i];
    }
    if (!size || !target) return C.fail('  Invalid argument.', 1);
    var add = /^\+/.test(size);
    var bytes = C.parseSize(size.replace(/^\+/, ''));
    if (!bytes) return C.fail('  Invalid argument.', 1);
    var lvName = target.split('/').pop().replace('rhel-', '');
    var lv = ctx.sys.lvm.lvs.filter(function (item) { return item.name === lvName; })[0];
    var mount = ctx.sys.mounts.filter(function (item) { return item.target === (lv && lv.mount); })[0];
    if (lv) {
      var current = C.parseSize(lv.size) || 0;
      lv.size = C.humanSize(add ? current + bytes : bytes).replace('B', '');
    }
    if (mount) {
      mount.size = add ? mount.size + bytes : bytes;
      if (mount.used > mount.size) mount.used = mount.size;
    }
    Machine.journal(ctx.sys, 'lvm', 6, 'Logical volume ' + target + ' extended by ' + size, 0);
    return C.ok('  Size of logical volume ' + target + ' changed from 20.00 GiB to ' + (mount ? C.humanSize(mount.size) : 'new size') + '.\n  Logical volume ' + target + ' successfully resized.\n');
  });

  reg('tar', function (ctx, args) {
    var create = false;
    var list = false;
    var extract = false;
    var archive = null;
    var directory = null;
    var files = [];
    for (var i = 0; i < args.length; i++) {
      var arg = args[i];
      if (arg === '-C' && args[i + 1]) { directory = args[++i]; continue; }
      if (arg === '--file' && args[i + 1]) { archive = args[++i]; continue; }
      if (/^--file=/.test(arg)) { archive = arg.split('=')[1]; continue; }
      if (arg.charAt(0) === '-' && arg.length > 1) {
        var letters = arg.slice(1);
        if (letters.indexOf('c') !== -1) create = true;
        if (letters.indexOf('t') !== -1) list = true;
        if (letters.indexOf('x') !== -1) extract = true;
        var fIndex = letters.indexOf('f');
        if (fIndex !== -1) {
          var inline = letters.slice(fIndex + 1);
          archive = inline || args[++i];
        }
        continue;
      }
      files.push(arg);
    }
    if (!archive) return C.fail('tar: Refusing to read archive contents from terminal', 1);
    var sys = ctx.sys;
    if (create) {
      if (!files.length) return C.fail('tar: Cowardly refusing to create an empty archive', 1);
      var base = directory ? VFS.normalize(directory, sys.cwd, ctx.user, sys) : sys.cwd;
      var entries = [];
      function collect(path, name) {
        var resolved = VFS.resolve(sys, path, sys.cwd, ctx.user, false);
        if (resolved.error) return;
        var node = resolved.node;
        entries.push({ name: name, type: node.type, mode: node.mode, uid: node.uid, gid: node.gid, context: node.context, content: node.content || '', target: node.target || null });
        if (node.type === 'dir') C.listChildren(ctx, path).forEach(function (child) { collect(child.path, name + '/' + child.name); });
      }
      files.forEach(function (file) {
        collect(base === '/' ? '/' + file : base + '/' + file, file.replace(/^\/+/, ''));
      });
      var archivePath = archive;
      var write = C.writeFile(ctx, archivePath, '', false);
      if (!write.ok) return C.fail('tar: ' + archivePath + ': ' + write.message);
      write.node.content = 'TAR archive (' + entries.length + ' entries)';
      write.node.tarEntries = entries;
      return C.ok('');
    }
    var archiveRead = C.readFile(ctx, archive);
    if (!archiveRead.ok) return C.fail('tar: ' + archive + ': ' + archiveRead.message);
    var archiveEntries = archiveRead.node.tarEntries || [];
    if (list) {
      return C.ok(archiveEntries.map(function (entry) { return entry.type === 'dir' ? entry.name + '/' : entry.name; }).join('\n') + (archiveEntries.length ? '\n' : ''));
    }
    if (extract) {
      var dest = directory ? VFS.normalize(directory, sys.cwd, ctx.user, sys) : sys.cwd;
      archiveEntries.forEach(function (entry) {
        var target = dest === '/' ? '/' + entry.name : dest + '/' + entry.name;
        if (entry.type === 'dir') {
          if (!sys.fs[target]) {
            var info = VFS.parentInfo(sys, ctx.user, target, sys.cwd, true);
            if (info.ok) {
              var node = C.newDirNode(sys, ctx, target, entry.mode);
              node.uid = ctx.user.uid;
              node.gid = ctx.user.gid;
              sys.fs[target] = node;
            }
          }
        } else {
          var w = C.writeFile(ctx, target, entry.content || '', false, entry.mode);
          if (w.ok && w.node) {
            w.node.mode = entry.mode;
            w.node.context = entry.context || VFS.contextType(sys, target);
          }
        }
      });
      return C.ok('');
    }
    return C.fail('tar: You must specify one of the -c, -t, or -x options', 1);
  });
})(typeof window !== 'undefined' ? window : globalThis);
