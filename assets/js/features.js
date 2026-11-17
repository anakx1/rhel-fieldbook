/* ==========================================================================
   RHEL Fieldbook — scenarios, spaced review, and final exam
   Pure data and helpers. No DOM. Loaded after the sandbox and lesson data.
   ========================================================================== */

(function (root) {
  'use strict';

  var RHEL = root.RHEL = root.RHEL || {};
  var SB = root.RHEL_SANDBOX;

  function nowStamp() {
    return new Date().toISOString();
  }

  function fileNode(sys, path, content, mode, uid, gid, context, extra) {
    var node = {
      type: 'file',
      mode: mode,
      uid: uid,
      gid: gid,
      context: context || 'default_t',
      inode: SB.commands.nextInode(sys),
      mtime: nowStamp(),
      atime: nowStamp(),
      ctime: nowStamp(),
      content: content || ''
    };
    if (extra) Object.keys(extra).forEach(function (key) { node[key] = extra[key]; });
    return node;
  }

  function dirNode(sys, path, mode, uid, gid, context) {
    return {
      type: 'dir',
      mode: mode,
      uid: uid,
      gid: gid,
      context: context || 'default_t',
      inode: SB.commands.nextInode(sys),
      mtime: nowStamp(),
      atime: nowStamp(),
      ctime: nowStamp()
    };
  }

  function uidOf(sys, name) {
    return sys.users[name] ? sys.users[name].uid : 0;
  }

  function gidOf(sys, name) {
    return sys.groups[name] ? sys.groups[name].gid : 0;
  }

  function mountFor(sys, target) {
    return (sys.mounts || []).filter(function (item) { return item.target === target; })[0] || null;
  }

  function addJournal(sys, unit, message, priority) {
    sys.journal = sys.journal || [];
    sys.journal.push({
      ts: 'Nov 16 02:14:00',
      unit: unit,
      pid: 1,
      priority: priority || 6,
      message: message
    });
  }

  function fstabValid(sys) {
    var node = sys.fs && sys.fs['/etc/fstab'];
    if (!node) return false;
    var content = node.content || '';
    if (/deadbeef/i.test(content)) return false;
    var lines = content.split('\n').filter(function (line) {
      var trimmed = line.trim();
      return trimmed && trimmed.charAt(0) !== '#';
    });
    if (lines.length < 3) return false;
    var hasData = false;
    for (var i = 0; i < lines.length; i++) {
      var fields = lines[i].trim().split(/\s+/);
      if (fields.length < 6) return false;
      if (fields[1] === '/data') {
        hasData = true;
        if (fields[0].indexOf('UUID=') !== 0) return false;
      }
    }
    return hasData;
  }

  /* ------------------------------------------------------------------------
     Broken Systems scenarios
     ------------------------------------------------------------------------ */

  RHEL.scenarios = [
    {
      id: 'selinux-httpd',
      title: '403 at the edge',
      subtitle: 'The web server is running. Every request still fails.',
      story: '02:14 — The monitoring page has been green for a week. Now every request to the internal status site returns 403 Forbidden. httpd is active, the document root exists, and nothing changed in the vhost. You are the only admin awake. Find the control that is doing its job a little too well.',
      patch: function (sys) {
        var pkg = sys.packages.available && sys.packages.available.httpd;
        if (pkg) {
          sys.packages.installed.httpd = pkg;
          delete sys.packages.available.httpd;
        }
        sys.commandPaths.httpd = '/usr/sbin/httpd';
        sys.services.httpd.active = true;
        sys.services.httpd.enabled = true;
        sys.services.httpd.state = 'running';
        sys.services.httpd.pid = 1842;
        if (!sys.processes.some(function (p) { return p.pid === 1842; })) {
          sys.processes.push({ pid: 1842, ppid: 1, user: 'root', cmd: '/usr/sbin/httpd -DFOREGROUND', unit: 'httpd', state: 'S', cpu: '0.1', mem: '0.8', tty: '?' });
        }
        if (sys.fs['/var/www/html']) sys.fs['/var/www/html'].context = 'user_home_t';
        if (sys.fs['/var/www/html/index.html']) {
          sys.fs['/var/www/html/index.html'].context = 'user_home_t';
          sys.fs['/var/www/html/index.html'].content = '<h1>Quarterly status</h1>\n';
        }
        addJournal(sys, 'httpd', '(13)Permission denied: [client 127.0.0.1:51234] AH00035: access to /index.html denied (filesystem path \'/var/www/html/index.html\')', 3);
        addJournal(sys, 'audit', 'AVC denied { read } for pid=1842 comm="httpd" name="index.html" scontext=system_u:system_r:httpd_t:s0 tcontext=system_u:object_r:user_home_t:s0 tclass=file', 3);
      },
      goal: function (sys) {
        var dir = sys.fs && sys.fs['/var/www/html'];
        var index = sys.fs && sys.fs['/var/www/html/index.html'];
        return !!(dir && index && dir.context === 'httpd_sys_content_t' && index.context === 'httpd_sys_content_t' && sys.services.httpd.active);
      },
      hints: [
        'Stop looking at the vhost. Confirm the service is running, then inspect the file context under the document root with <code>ls -Z</code>.',
        'The content is labelled <code>user_home_t</code>. SELinux is blocking httpd from reading a user home label. Apply the persistent web-content label and restore it.',
        '<code>sudo semanage fcontext -a -t httpd_sys_content_t \'/var/www(/.*)?\'</code><br><code>sudo restorecon -Rv /var/www</code>'
      ],
      timeTarget: 300,
      lesson: 'security'
    },
    {
      id: 'var-full',
      title: '/var at 100%',
      subtitle: 'A log file ate the remaining capacity.',
      story: '02:41 — Write errors are spreading. journald is complaining, dnf cannot cache metadata, and one application has stopped accepting uploads. The pager says /var is full. The disk itself is healthy. Something on it is not. Find the consumer, recover enough capacity, and leave a note for the morning.',
      patch: function (sys) {
        var mount = mountFor(sys, '/');
        if (mount) mount.used = Math.max(0, mount.size - (32 * 1024 * 1024));
        sys.fs['/var/log/reporting.log'] = fileNode(
          sys,
          '/var/log/reporting.log',
          '2026-11-16 01:58:10 report-worker: rendering batch 88412\n2026-11-16 02:01:33 report-worker: retrying batch 88412 without backoff\n2026-11-16 02:11:04 report-worker: retrying batch 88412 without backoff\n',
          420,
          0,
          0,
          'var_log_t',
          { size: 41 * 1024 * 1024 * 1024 }
        );
        addJournal(sys, 'kernel', 'XFS (dm-0): No space left on device', 2);
        addJournal(sys, 'dnf', 'Error: Failed to download metadata for repo \'baseos\': No space left on device', 3);
        mount = mountFor(sys, '/');
        if (mount) mount.used = Math.max(0, mount.size - (32 * 1024 * 1024));
      },
      goal: function (sys) {
        var log = sys.fs && sys.fs['/var/log/reporting.log'];
        var mount = mountFor(sys, '/');
        var logSize = log ? (log.size === undefined ? (log.content || '').length : log.size) : 0;
        return (!log || logSize < (1024 * 1024 * 1024)) && !!mount && (mount.used / mount.size) < 0.9;
      },
      hints: [
        'Do not delete the whole of /var/log. Find the largest consumer first with <code>sudo du -sh /var/*</code> or <code>sudo find /var -size +1G</code>.',
        'The runaway file is <code>/var/log/reporting.log</code>. Its size is why the root filesystem is full. Remove it or truncate it, then confirm with <code>df -h /var</code>.',
        '<code>sudo rm /var/log/reporting.log</code><br>Then confirm with <code>df -h /var</code> and leave a note for the morning.'
      ],
      timeTarget: 240,
      lesson: 'storage'
    },
    {
      id: 'fstab-boot',
      title: 'Emergency prompt at 03:07',
      subtitle: 'One bad fstab line is blocking the boot.',
      story: '03:07 — The host rebooted for a kernel update and never came back to a login prompt. You are at an emergency shell. The root filesystem is mounted read-only and the boot log points at a filesystem that does not exist. Fix /etc/fstab so the next boot is clean, then confirm the data mount has a real UUID.',
      patch: function (sys) {
        var fstab = sys.fs['/etc/fstab'];
        if (fstab) {
          fstab.content = (fstab.content || '') + 'UUID=deadbeef-dead-beef-dead-beefdeadbeef /archive xfs defaults 0 0\n';
        }
        addJournal(sys, 'systemd', 'Dependency failed for /archive.', 2);
        addJournal(sys, 'systemd', 'Failed to mount /archive.', 2);
        addJournal(sys, 'systemd', 'Reached target Emergency Mode.', 2);
      },
      goal: function (sys) {
        return fstabValid(sys);
      },
      hints: [
        'Read the file that controls mounts. The emergency log names a target, but the truth is in <code>/etc/fstab</code>.',
        'One line references a UUID that is not on this machine. Remove the stale line without touching the root, boot, or /data entries.',
        '<code>sudo sed -i \'/deadbeef/d\' /etc/fstab</code><br>Then inspect it with <code>cat /etc/fstab</code>.'
      ],
      timeTarget: 240,
      lesson: 'storage'
    },
    {
      id: 'ssh-permissions',
      title: 'Key login rejected',
      subtitle: 'The key is correct. sshd refuses to use it.',
      story: '03:33 — An automation key that worked yesterday is rejected today. The public key is present in authorized_keys, the private key is intact, and sshd is running. The client sees the key offered and then a password fallback. Treat the key material and its directory as a security boundary.',
      patch: function (sys) {
        var uid = uidOf(sys, 'student');
        var gid = gidOf(sys, 'student');
        sys.fs['/home/student/.ssh'] = dirNode(sys, '/home/student/.ssh', 511, uid, gid, 'user_home_t');
        sys.fs['/home/student/.ssh/authorized_keys'] = fileNode(
          sys,
          '/home/student/.ssh/authorized_keys',
          'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFieldbookSandboxExampleKey deploy@build-host\n',
          438,
          uid,
          gid,
          'user_home_t'
        );
        sys.fs['/home/student/.ssh/id_ed25519'] = fileNode(
          sys,
          '/home/student/.ssh/id_ed25519',
          '-----BEGIN OPENSSH PRIVATE KEY-----\nsandbox-example-key-material\n-----END OPENSSH PRIVATE KEY-----\n',
          420,
          uid,
          gid,
          'user_home_t'
        );
        sys.fs['/home/student/.ssh/id_ed25519.pub'] = fileNode(
          sys,
          '/home/student/.ssh/id_ed25519.pub',
          'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFieldbookSandboxExampleKey student@rhel-lab\n',
          420,
          uid,
          gid,
          'user_home_t'
        );
        addJournal(sys, 'sshd', 'Authentication refused: bad ownership or modes for directory /home/student/.ssh', 3);
      },
      goal: function (sys) {
        var uid = uidOf(sys, 'student');
        var dir = sys.fs && sys.fs['/home/student/.ssh'];
        var auth = sys.fs && sys.fs['/home/student/.ssh/authorized_keys'];
        var key = sys.fs && sys.fs['/home/student/.ssh/id_ed25519'];
        return !!(dir && auth && key &&
          dir.uid === uid && auth.uid === uid && key.uid === uid &&
          (dir.mode & 4095) === 448 &&
          (auth.mode & 4095) === 384 &&
          (key.mode & 4095) === 384);
      },
      hints: [
        'sshd is strict about key permissions. Inspect the directory and files with <code>ls -ldZ ~/.ssh</code> and <code>ls -lZ ~/.ssh</code>.',
        'The directory should be 700. authorized_keys and the private key should be 600. Group and other permissions must be gone.',
        '<code>chmod 700 ~/.ssh</code><br><code>chmod 600 ~/.ssh/authorized_keys ~/.ssh/id_ed25519</code>'
      ],
      timeTarget: 180,
      lesson: 'permissions'
    },
    {
      id: 'firewall-8080',
      title: 'Port 8080, no answer',
      subtitle: 'The app is listening; the packet never arrives.',
      story: '04:02 — A deployment finished cleanly. The app is bound to 8080 on the host, the process is healthy, and local requests work. Remote checks time out. The firewall is the only thing between the app and the network, and someone changed it during the maintenance window.',
      patch: function (sys) {
        sys.firewall.runtime.ports = sys.firewall.runtime.ports.filter(function (port) { return port !== '8080/tcp'; });
        sys.firewall.permanent.ports = sys.firewall.permanent.ports.filter(function (port) { return port !== '8080/tcp'; });
        addJournal(sys, 'firewalld', 'rule changed: remove-port 8080/tcp (permanent)', 6);
      },
      goal: function (sys) {
        var fw = sys.firewall;
        return !!(fw && fw.runtime.ports.indexOf('8080/tcp') !== -1 && fw.permanent.ports.indexOf('8080/tcp') !== -1);
      },
      hints: [
        'Check both views of the firewall: runtime and permanent. A fix that disappears after reload is not a fix.',
        'Port 8080/tcp is missing from both buckets. Add it to runtime and permanent configuration.',
        '<code>sudo firewall-cmd --add-port=8080/tcp</code><br><code>sudo firewall-cmd --permanent --add-port=8080/tcp</code><br><code>sudo firewall-cmd --reload</code>'
      ],
      timeTarget: 180,
      lesson: 'network'
    }
  ];

  RHEL.scenarios.find = function (id) {
    return RHEL.scenarios.filter(function (scenario) { return scenario.id === id; })[0] || null;
  };

  RHEL.scenarios.score = function (seconds, hintsUsed, timeTarget) {
    var target = Math.max(60, timeTarget || 300);
    var over = Math.max(0, seconds - target);
    var timePenalty = Math.min(45, Math.round((over / target) * 30));
    var hintPenalty = Math.min(45, Math.max(0, hintsUsed || 0) * 15);
    return Math.max(10, 100 - timePenalty - hintPenalty);
  };

  /* ------------------------------------------------------------------------
     Spaced review — Leitner boxes
     ------------------------------------------------------------------------ */

  var BOX_INTERVALS = [0, 10 * 60 * 1000, 1 * 24 * 60 * 60 * 1000, 3 * 24 * 60 * 60 * 1000, 7 * 24 * 60 * 60 * 1000, 21 * 24 * 60 * 60 * 1000];

  function quizCards() {
    var cards = [];
    RHEL.lessonOrder.forEach(function (lessonId) {
      var lesson = RHEL.lessons[lessonId];
      if (!lesson || !lesson.quiz) return;
      lesson.quiz.forEach(function (question, index) {
        cards.push({
          id: 'quiz:' + lessonId + ':' + index,
          kind: 'quiz',
          prompt: question.q,
          answer: question.options[question.answer],
          detail: question.why,
          lesson: lessonId,
          lessonTitle: lesson.title,
          module: lesson.module,
          label: 'Checkpoint',
          commands: []
        });
      });
    });
    return cards;
  }

  function commandCards(commands) {
    var cards = [];
    (commands || []).forEach(function (command) {
      var key = 'cmd:' + encodeURIComponent(command.cmd);
      cards.push({
        id: key + ':forward',
        kind: 'command',
        direction: 'forward',
        prompt: command.cmd,
        answer: command.desc,
        detail: command.category + ' · ' + command.lessonTitle,
        lesson: command.lesson,
        lessonTitle: command.lessonTitle,
        module: RHEL.lessons[command.lesson] ? RHEL.lessons[command.lesson].module : '',
        label: 'Command → meaning',
        command: command.cmd,
        category: command.category
      });
      cards.push({
        id: key + ':reverse',
        kind: 'command',
        direction: 'reverse',
        prompt: command.desc,
        answer: command.cmd,
        detail: command.category + ' · ' + command.lessonTitle,
        lesson: command.lesson,
        lessonTitle: command.lessonTitle,
        module: RHEL.lessons[command.lesson] ? RHEL.lessons[command.lesson].module : '',
        label: 'Meaning → command',
        command: command.cmd,
        category: command.category
      });
    });
    return cards;
  }

  function endOfToday(now) {
    var date = new Date(now || Date.now());
    date.setHours(23, 59, 59, 999);
    return date.getTime();
  }

  RHEL.review = {
    intervals: BOX_INTERVALS.slice(),
    quizCards: quizCards,
    commandCards: commandCards,
    buildCards: function (commands) {
      return quizCards().concat(commandCards(commands));
    },
    blankItem: function () {
      return { box: 1, due: 0, seen: 0, correct: 0, wrong: 0, last: null };
    },
    item: function (items, id) {
      return items && items[id] ? items[id] : null;
    },
    isDue: function (record, now) {
      if (!record) return true;
      return (Number(record.due) || 0) <= (now || Date.now());
    },
    isDueToday: function (record, now) {
      if (!record) return true;
      return (Number(record.due) || 0) <= endOfToday(now);
    },
    dueCount: function (cards, items, now) {
      return cards.filter(function (card) {
        return RHEL.review.isDueToday(items[card.id], now);
      }).length;
    },
    grade: function (items, id, correct, now) {
      var item = items[id] || RHEL.review.blankItem();
      var stamp = now || Date.now();
      item.box = correct ? Math.min(5, (Number(item.box) || 1) + 1) : 1;
      item.due = stamp + BOX_INTERVALS[item.box];
      item.seen = (Number(item.seen) || 0) + 1;
      item.correct = (Number(item.correct) || 0) + (correct ? 1 : 0);
      item.wrong = (Number(item.wrong) || 0) + (correct ? 0 : 1);
      item.last = stamp;
      items[id] = item;
      return item;
    },
    endOfToday: endOfToday
  };

  /* ------------------------------------------------------------------------
     Level 01 final exam
     ------------------------------------------------------------------------ */

  function shuffle(list) {
    var copy = list.slice();
    for (var i = copy.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = copy[i];
      copy[i] = copy[j];
      copy[j] = tmp;
    }
    return copy;
  }

  function drawQuestions(total) {
    total = total || 30;
    var quotas = [];
    var base = Math.floor(total / RHEL.modules.length);
    var extra = total % RHEL.modules.length;
    RHEL.modules.forEach(function (module, index) {
      quotas.push({ module: module, count: base + (index < extra ? 1 : 0) });
    });

    var picked = [];
    quotas.forEach(function (entry) {
      var pools = {};
      entry.module.lessons.forEach(function (lessonId) {
        var lesson = RHEL.lessons[lessonId];
        pools[lessonId] = shuffle((lesson.quiz || []).map(function (question, qi) {
          return { lesson: lessonId, module: entry.module.id, qi: qi };
        }));
      });
      var lessonOrder = shuffle(entry.module.lessons.slice());
      var fromModule = [];
      var cursor = 0;
      while (fromModule.length < entry.count && lessonOrder.length) {
        var madeProgress = false;
        for (var i = 0; i < lessonOrder.length && fromModule.length < entry.count; i++) {
          var lessonId = lessonOrder[(cursor + i) % lessonOrder.length];
          if (pools[lessonId] && pools[lessonId].length) {
            fromModule.push(pools[lessonId].shift());
            madeProgress = true;
          }
        }
        cursor += 1;
        if (!madeProgress) break;
      }
      picked = picked.concat(fromModule);
    });
    return shuffle(picked.slice(0, total)).map(function (item) {
      item.id = item.lesson + ':' + item.qi;
      return item;
    });
  }

  function questionFor(id) {
    var parts = String(id).split(':');
    var lesson = RHEL.lessons[parts[0]];
    var qi = parseInt(parts[1], 10);
    if (!lesson || !lesson.quiz || !lesson.quiz[qi]) return null;
    return {
      id: id,
      lesson: lesson.id,
      module: lesson.module,
      qi: qi,
      question: lesson.quiz[qi],
      lessonTitle: lesson.title
    };
  }

  RHEL.exam = {
    config: {
      questions: 30,
      minutes: 35,
      passScore: 80,
      title: 'Level 01 final exam'
    },
    draw: drawQuestions,
    question: questionFor,
    practical: {
      id: 'provision-shared-dir',
      title: 'Provision a service account and shared directory',
      intro: 'Use the terminal sandbox. The check runs against the live simulated machine, so the result is evidence, not a self-report.',
      steps: [
        'Create the group <code>webops</code>.',
        'Create the user <code>deployer</code> with a home directory and add the account to <code>webops</code>.',
        'Create <code>/srv/app</code> as a directory owned by <code>deployer:webops</code> with mode <code>2770</code>.'
      ],
      check: function (sys) {
        if (!sys || !sys.groups || !sys.users) return false;
        var group = sys.groups.webops;
        var user = sys.users.deployer;
        var home = sys.fs && sys.fs['/home/deployer'];
        var dir = sys.fs && sys.fs['/srv/app'];
        if (!group || !user || !home || !dir) return false;
        if (!user.groups || user.groups.indexOf('webops') === -1) return false;
        if (home.type !== 'dir' || home.uid !== user.uid) return false;
        if (dir.type !== 'dir' || dir.uid !== user.uid || dir.gid !== group.gid) return false;
        return (dir.mode & 4095) === 1528;
      }
    },
    moduleStats: function (questionIds, answers) {
      var stats = {};
      RHEL.modules.forEach(function (module) {
        stats[module.id] = { id: module.id, number: module.number, title: module.title, correct: 0, total: 0 };
      });
      (questionIds || []).forEach(function (id) {
        var item = questionFor(id);
        if (!item) return;
        var record = stats[item.module];
        if (!record) return;
        record.total += 1;
        if (answers && answers[id] === item.question.answer) record.correct += 1;
      });
      return stats;
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
