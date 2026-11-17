/* Lab step checks: executable predicates over the sandbox machine state.
   Lesson prose and metadata live in assets/data/lessons. */

(function (root) {
  'use strict';

  var RHEL = root.RHEL = root.RHEL || {};
  RHEL.labChecks = RHEL.labChecks || {};

  RHEL.labChecks['users'] = RHEL.labChecks['users'] || {};
  RHEL.labChecks['users'][0] = function (sys) { var u = sys.users.analyst; return !!(sys.groups.ops && u && u.home === '/home/analyst' && u.shell === '/bin/bash'); };

  RHEL.labChecks['users'] = RHEL.labChecks['users'] || {};
  RHEL.labChecks['users'][1] = function (sys) { var u = sys.users.analyst; return !!(u && ((u.groups || []).indexOf('ops') !== -1 || (sys.groups.ops.members || []).indexOf('analyst') !== -1)); };

  RHEL.labChecks['users'] = RHEL.labChecks['users'] || {};
  RHEL.labChecks['users'][2] = function (sys) { var f = sys.fs['/etc/passwd']; return !!(f && /^analyst:x:\d+:\d+:/m.test(f.content || '')); };

  RHEL.labChecks['users'] = RHEL.labChecks['users'] || {};
  RHEL.labChecks['users'][3] = function (sys) { var f = sys.fs['/etc/sudoers.d/ops-httpd']; return !!(f && (f.mode & 511) === parseInt('440', 8) && /%ops\s+ALL=\(ALL\)\s+\/usr\/bin\/systemctl restart httpd/.test(f.content || '')); };

  RHEL.labChecks['users'] = RHEL.labChecks['users'] || {};
  RHEL.labChecks['users'][4] = function (sys) { return !!(sys.users.analyst && sys.users.analyst.locked === true); };

  RHEL.labChecks['permissions'] = RHEL.labChecks['permissions'] || {};
  RHEL.labChecks['permissions'][0] = function (sys) { return !!(sys.groups.builders && sys.groups.auditors && sys.users.builder && sys.fs['/srv/fieldbook'] && sys.fs['/srv/fieldbook'].type === 'dir'); };

  RHEL.labChecks['permissions'] = RHEL.labChecks['permissions'] || {};
  RHEL.labChecks['permissions'][1] = function (sys) { var d = sys.fs['/srv/fieldbook']; var g = sys.groups.builders; return !!(d && g && d.uid === 0 && d.gid === g.gid && (d.mode & 4095) === parseInt('2770', 8)); };

  RHEL.labChecks['permissions'] = RHEL.labChecks['permissions'] || {};
  RHEL.labChecks['permissions'][2] = function (sys) { var f = sys.fs['/srv/fieldbook/report.txt']; var u = sys.users.builder; var g = sys.groups.builders; return !!(f && f.type === 'file' && u && g && f.uid === u.uid && f.gid === g.gid); };

  RHEL.labChecks['permissions'] = RHEL.labChecks['permissions'] || {};
  RHEL.labChecks['permissions'][3] = function (sys) { var f = sys.fs['/srv/fieldbook/report.txt']; if (!f) return false; var acl = (f.acl || []).some(function (e) { return e.type === 'group' && e.name === 'auditors' && (e.perms || '').indexOf('r') !== -1; }); return acl && (f.mode & 511) === parseInt('644', 8); };

  RHEL.labChecks['permissions'] = RHEL.labChecks['permissions'] || {};
  RHEL.labChecks['permissions'][4] = function (sys) { var f = sys.fs['/srv/fieldbook/report.txt']; return !!(f && (f.acl || []).some(function (e) { return e.type === 'group' && e.name === 'auditors'; })); };

  RHEL.labChecks['services'] = RHEL.labChecks['services'] || {};
  RHEL.labChecks['services'][0] = function (sys) { var ev = sys.evidence || {}; var s = sys.services.sshd; return !!(ev['services:status:sshd'] && ev['services:enabled:sshd'] && s && s.active && s.enabled); };

  RHEL.labChecks['services'] = RHEL.labChecks['services'] || {};
  RHEL.labChecks['services'][1] = function (sys) { var ev = sys.evidence || {}; return !!(ev['services:journal:sshd'] && (sys.journal || []).some(function (entry) { return entry.unit === 'sshd'; })); };

  RHEL.labChecks['services'] = RHEL.labChecks['services'] || {};
  RHEL.labChecks['services'][2] = function (sys) { var ev = sys.evidence || {}; return !!(ev['services:failed'] && !Object.keys(sys.services || {}).some(function (name) { return sys.services[name].state === 'failed'; })); };

  RHEL.labChecks['services'] = RHEL.labChecks['services'] || {};
  RHEL.labChecks['services'][3] = function (sys) { var ev = sys.evidence || {}; var active = Object.keys(sys.services || {}).filter(function (name) { return sys.services[name].active; }); return !!(ev['services:default'] && ev['services:running'] && sys.defaultTarget && active.length > 0); };

  RHEL.labChecks['services'] = RHEL.labChecks['services'] || {};
  RHEL.labChecks['services'][4] = function (sys) { var pkg = sys.packages && sys.packages.installed && sys.packages.installed.httpd; var svc = sys.services.httpd; return !!(pkg && svc && !svc.active && !svc.enabled); };

  RHEL.labChecks['storage'] = RHEL.labChecks['storage'] || {};
  RHEL.labChecks['storage'][0] = function (sys) { var ev = sys.evidence || {}; return !!(ev['storage:inspect'] && ['/', '/boot', '/data'].every(function (target) { return (sys.mounts || []).some(function (m) { return m.target === target; }); })); };

  RHEL.labChecks['storage'] = RHEL.labChecks['storage'] || {};
  RHEL.labChecks['storage'][1] = function (sys) { var ev = sys.evidence || {}; var f = sys.fs['/tmp/lab-disk.img']; return !!((ev['storage:disk-image'] && ev['storage:mkfs']) || (f && f.fsType === 'xfs')); };

  RHEL.labChecks['storage'] = RHEL.labChecks['storage'] || {};
  RHEL.labChecks['storage'][2] = function (sys) { var ev = sys.evidence || {}; return !!(ev['storage:mount:/mnt/labdisk'] || (sys.mounts || []).some(function (m) { return m.target === '/mnt/labdisk' && m.fstype === 'xfs'; })); };

  RHEL.labChecks['storage'] = RHEL.labChecks['storage'] || {};
  RHEL.labChecks['storage'][3] = function (sys) { var ev = sys.evidence || {}; var mount = (sys.mounts || []).filter(function (m) { return m.target === '/mnt/labdisk'; })[0]; return !!(ev['storage:fill'] && (ev['storage:df'] || ev['storage:du'] || (mount && mount.used >= 20 * 1024 * 1024))); };

  RHEL.labChecks['storage'] = RHEL.labChecks['storage'] || {};
  RHEL.labChecks['storage'][4] = function (sys) { var ev = sys.evidence || {}; return !!(ev['storage:disk-image'] && !(sys.mounts || []).some(function (m) { return m.target === '/mnt/labdisk'; }) && !sys.fs['/tmp/lab-disk.img'] && !sys.fs['/mnt/labdisk']); };

})(typeof window !== 'undefined' ? window : globalThis);

/* Level 02 — Operator */
RHEL.labChecks['storage-partitions'] = {
  0: function (sys) { var ev = sys.evidence || {}; return !!(ev['storage:inspect'] && ['/', '/boot', '/data'].every(function (t) { return (sys.mounts || []).some(function (m) { return m.target === t; }); })); },
  1: function (sys) { var f = sys.fs['/tmp/lab-disk.img']; return !!(f && f.fsType === 'xfs'); },
  2: function (sys) { return (sys.mounts || []).some(function (m) { return m.target === '/mnt/labdisk' && m.fstype === 'xfs'; }); },
  3: function (sys) { var ev = sys.evidence || {}; var m = (sys.mounts || []).filter(function (x) { return x.target === '/mnt/labdisk'; })[0]; return !!(ev['storage:fill'] && (ev['storage:df'] || ev['storage:du'] || (m && m.used >= 20 * 1024 * 1024))); },
  4: function (sys) { var ev = sys.evidence || {}; return !!(ev['storage:disk-image'] && !(sys.mounts || []).some(function (m) { return m.target === '/mnt/labdisk'; }) && !sys.fs['/tmp/lab-disk.img']); }
};

RHEL.labChecks['storage-lvm'] = {
  0: function (sys) { var ev = sys.evidence || {}; return !!(ev['storage:inspect'] && sys.lvm && !sys.lvm.vgs.some(function (v) { return v.name === 'vgdata'; })); },
  1: function (sys) { return !!(sys.lvm && sys.lvm.pvs.some(function (p) { return p.name === '/dev/sdb' && p.vg === 'vgdata'; }) && sys.lvm.vgs.some(function (v) { return v.name === 'vgdata'; })); },
  2: function (sys) { return !!(sys.lvm && sys.lvm.lvs.some(function (l) { return l.name === 'lvapp' && l.vg === 'vgdata' && l.sizeValue >= 5 * 1024 * 1024 * 1024; })); },
  3: function (sys) { var f = sys.fs['/dev/vgdata/lvapp']; return !!(f && f.fsType === 'xfs' && (sys.mounts || []).some(function (m) { return m.target === '/app' && m.source === '/dev/vgdata/lvapp'; })); },
  4: function (sys) { var lv = sys.lvm && sys.lvm.lvs.filter(function (l) { return l.name === 'lvapp'; })[0]; var m = (sys.mounts || []).filter(function (x) { return x.target === '/app'; })[0]; return !!(lv && lv.sizeValue >= 7 * 1024 * 1024 * 1024 && m && m.size >= 7 * 1024 * 1024 * 1024); },
  5: function (sys) { return !!(sys.swaps || []).some(function (s) { return s.device === '/dev/sdc'; }); }
};

RHEL.labChecks['ssh-sudo'] = {
  0: function (sys) { var k = sys.fs['/home/student/.ssh/id_ed25519']; var p = sys.fs['/home/student/.ssh/id_ed25519.pub']; return !!(k && p && (k.mode & 511) === 384 && (p.mode & 511) === 420); },
  1: function (sys) { var d = sys.fs['/home/student/.ssh']; var a = sys.fs['/home/student/.ssh/authorized_keys']; return !!(d && a && (d.mode & 511) === 448 && (a.mode & 511) === 384 && /^ssh-ed25519\s+/m.test(a.content || '')); },
  2: function (sys) { return !!(sys.groups.webops && ((sys.users.student.groups || []).indexOf('webops') !== -1 || (sys.groups.webops.members || []).indexOf('student') !== -1)); },
  3: function (sys) { var f = sys.fs['/etc/sudoers.d/webops']; return !!(f && (f.mode & 511) === 288 && /%webops\s+ALL=\(ALL\)\s+\/usr\/bin\/systemctl restart httpd/.test(f.content || '')); },
  4: function (sys) { var f = sys.fs['/etc/sudoers.d/webops']; var ev = sys.evidence || {}; return !!(f && (ev['sudo:validated'] || ev['sudo:list'])); }
};

RHEL.labChecks['systemd-units'] = {
  0: function (sys) { var ev = sys.evidence || {}; return !!(ev['services:running'] && ev['services:default']); },
  1: function (sys) { var f = sys.fs['/usr/local/bin/fieldbook-report']; return !!(f && (f.mode & 511) === 493); },
  2: function (sys) { var f = sys.fs['/etc/systemd/system/fieldbook.service']; return !!(f && /\[Unit\]/.test(f.content) && /\[Service\]/.test(f.content) && /\[Install\]/.test(f.content) && /ExecStart=\/usr\/local\/bin\/fieldbook-report/.test(f.content)); },
  3: function (sys) { var s = sys.services.fieldbook; return !!(s && s.active && s.enabled); },
  4: function (sys) { var ev = sys.evidence || {}; return !!(ev['services:status:fieldbook'] && ev['services:journal:fieldbook']); }
};

RHEL.labChecks['timers-journal'] = {
  0: function (sys) { return !!(sys.evidence || {})['services:journal:sshd']; },
  1: function (sys) { var f = sys.fs['/usr/local/bin/fieldbook-backup']; return !!(f && (f.mode & 511) === 493); },
  2: function (sys) { var f = sys.fs['/etc/systemd/system/fieldbook-backup.service']; return !!(f && /Type=oneshot/.test(f.content) && /ExecStart=\/usr\/local\/bin\/fieldbook-backup/.test(f.content)); },
  3: function (sys) { var f = sys.fs['/etc/systemd/system/fieldbook-backup.timer']; return !!(f && /OnCalendar=\*-\*-\*\s+02:00:00/.test(f.content) && /Persistent=true/.test(f.content) && /WantedBy=timers.target/.test(f.content)); },
  4: function (sys) { var ev = sys.evidence || {}; return !!(ev['timers:list'] && sys.timers && sys.timers['fieldbook-backup'] && sys.timers['fieldbook-backup'].enabled); },
  5: function (sys) { var ev = sys.evidence || {}; return !!(ev['services:status:fieldbook-backup'] && ev['services:journal:fieldbook-backup']); }
};

RHEL.labChecks['dnf-repos'] = {
  0: function (sys) { var ev = sys.evidence || {}; return !!(ev['dnf:repolist'] && ev['dnf:info:nginx']); },
  1: function (sys) { var f = sys.fs['/etc/yum.repos.d/fieldbook.repo']; return !!(f && /\[fieldbook\]/.test(f.content) && /baseurl=https:\/\//.test(f.content) && /enabled=1/.test(f.content) && /gpgcheck=1/.test(f.content)); },
  2: function (sys) { return !!(sys.evidence || {})['dnf:makecache']; },
  3: function (sys) { return !!(sys.dnfModules && sys.dnfModules.php === '8.2'); },
  4: function (sys) { return !!(sys.packages.installed.nginx && (sys.dnfHistory || []).length); }
};

RHEL.labChecks['network-firewall'] = {
  0: function (sys) { var ev = sys.evidence || {}; return !!(ev['nmcli:device'] && ev['nmcli:connections']); },
  1: function (sys) { var c = sys.network && sys.network.connections && sys.network.connections['Wired connection 1']; return !!(c && c.method === 'manual' && c.addresses === '192.0.2.50/24' && c.gateway === '192.0.2.1' && c.dns === '192.0.2.53'); },
  2: function (sys) { var ev = sys.evidence || {}; return !!(ev['network:resolve'] && ev['network:route']); },
  3: function (sys) { var p = sys.firewall.permanent; return !!(p.services.indexOf('http') !== -1 && p.ports.indexOf('8443/tcp') !== -1); },
  4: function (sys) { var r = sys.firewall.runtime; return !!(r.services.indexOf('http') !== -1 && r.ports.indexOf('8443/tcp') !== -1 && (sys.evidence || {})['firewall:list']); }
};

RHEL.labChecks['text-pipeline'] = {
  0: function (sys) { return !!(sys.evidence || {})['text:find']; },
  1: function (sys) { return !!(sys.evidence || {})['text:grep']; },
  2: function (sys) { var f = sys.fs['/tmp/auth-report.txt']; return !!(f && /\[auth\]/.test(f.content || '')); },
  3: function (sys) { var f = sys.fs['/tmp/local-users.txt']; return !!(f && /^student\s+1000/m.test(f.content || '')); },
  4: function (sys) { var f = sys.fs['/tmp/auth-summary.txt']; return !!(f && /auth failures:/.test(f.content || '') && /local users:/.test(f.content || '')); }
};

RHEL.labChecks['archive-cron'] = {
  0: function (sys) { var f = sys.fs['/home/student/lab/archive/fieldbook-notes.tar.gz']; return !!(f && (f.tarEntries || []).length && (f.content || '').length > 0); },
  1: function (sys) { return !!(sys.evidence || {})['tar:list']; },
  2: function (sys) { return !!(sys.fs['/tmp/fieldbook-restore/notes/day1.txt']); },
  3: function (sys) { var f = sys.fs['/usr/local/bin/fieldbook-backup']; return !!(f && (f.mode & 511) === 493 && /fieldbook-notes\.tar\.gz/.test(f.content || '')); },
  4: function (sys) { return !!(sys.crontab && /0 2 \* \* \* \/usr\/local\/bin\/fieldbook-backup/.test(sys.crontab) && (sys.evidence || {})['cron:list']); },
  5: function (sys) { var ev = sys.evidence || {}; return !!(ev['services:status:crond'] && ev['timers:list']); }
};
