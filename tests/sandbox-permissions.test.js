/* Plain Node tests for filesystem permissions, identity, and ACLs.
   Run with: node tests/sandbox-permissions.test.js */

'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

global.window = global;

const root = path.resolve(__dirname, '..');
function load(relative) {
  vm.runInThisContext(fs.readFileSync(path.join(root, relative), 'utf8'), { filename: relative });
}

[
  'assets/js/sandbox/vfs.js',
  'assets/js/sandbox/machine.js',
  'assets/js/sandbox/parser.js',
  'assets/js/sandbox/commands.js',
  'assets/js/sandbox/commands-text.js',
  'assets/js/sandbox/commands-fs.js',
  'assets/js/sandbox/commands-identity.js',
  'assets/js/sandbox/commands-system.js',
  'assets/js/sandbox/commands-ops.js',
  'assets/js/sandbox/shell.js'
].forEach(load);

const SB = global.RHEL_SANDBOX;
const sys = SB.machine.create();
const sh = SB.shell.create(sys);

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log('ok ' + name);
  } catch (error) {
    console.error('not ok ' + name);
    throw error;
  }
}

test('student cannot read the root-only secure log', () => {
  const result = sh.run('cat /var/log/secure');
  assert.equal(result.code, 1);
  assert.match(result.stderr, /Permission denied/);
  assert.equal(result.stdout, '');
});

test('sudo can read the same file', () => {
  const result = sh.run('sudo cat /var/log/secure');
  assert.equal(result.code, 0);
  assert.match(result.stdout, /sshd/);
});

test('regular users cannot write into /root', () => {
  const result = sh.run('echo secret > /root/secret.txt');
  assert.equal(result.code, 1);
  assert.match(result.stderr, /Permission denied/);
  assert.equal(sys.fs['/root/secret.txt'], undefined);
});

test('mode bits deny another user, then group ACL grants read', () => {
  assert.equal(sh.run('sudo groupadd auditors').code, 0);
  assert.equal(sh.run('sudo useradd -m analyst').code, 0);
  assert.equal(sh.run('sudo usermod -aG auditors analyst').code, 0);
  assert.equal(sh.run('echo classified > /tmp/acl.txt').code, 0);
  assert.equal(sh.run('chmod 0600 /tmp/acl.txt').code, 0);

  let result = sh.run('sudo -u analyst cat /tmp/acl.txt');
  assert.equal(result.code, 1);
  assert.match(result.stderr, /Permission denied/);

  result = sh.run('sudo setfacl -m g:auditors:r /tmp/acl.txt');
  assert.equal(result.code, 0);
  result = sh.run('sudo -u analyst cat /tmp/acl.txt');
  assert.equal(result.code, 0);
  assert.equal(result.stdout, 'classified\n');

  const node = sys.fs['/tmp/acl.txt'];
  assert.equal(node.mode & 511, parseInt('600', 8));
  assert.ok((node.acl || []).some((entry) => entry.type === 'group' && entry.name === 'auditors'));
});

test('usermod -aG appends without dropping earlier supplementary groups', () => {
  assert.equal(sh.run('sudo groupadd extra').code, 0);
  assert.equal(sh.run('sudo usermod -aG extra analyst').code, 0);
  const groups = sys.users.analyst.groups || [];
  assert.ok(groups.indexOf('auditors') !== -1, 'auditors should be preserved');
  assert.ok(groups.indexOf('extra') !== -1, 'extra should be appended');
});

test('non-wheel users are denied by sudo', () => {
  const result = sh.run('sudo -u analyst sudo whoami');
  assert.equal(result.code, 1);
  assert.match(result.stderr, /not in the sudoers file/);
});

test('su -c runs a command as the target user', () => {
  const result = sh.run('sudo su -c "id" analyst');
  assert.equal(result.code, 0);
  assert.match(result.stdout, /uid=\d+\(analyst\)/);
});

test('directory execute permission blocks traversal even for a readable child', () => {
  assert.equal(sh.run('mkdir /tmp/locked').code, 0);
  assert.equal(sh.run('echo visible > /tmp/locked/file.txt').code, 0);
  assert.equal(sh.run('chmod 0700 /tmp/locked').code, 0);
  const result = sh.run('sudo -u analyst cat /tmp/locked/file.txt');
  assert.equal(result.code, 1);
  assert.match(result.stderr, /Permission denied/);
});

test('setgid directory makes new files inherit the directory group', () => {
  assert.equal(sh.run('sudo groupadd builders').code, 0);
  assert.equal(sh.run('sudo useradd -m builder').code, 0);
  assert.equal(sh.run('sudo usermod -aG builders builder').code, 0);
  assert.equal(sh.run('sudo mkdir -p /srv/shared').code, 0);
  assert.equal(sh.run('sudo chown root:builders /srv/shared').code, 0);
  assert.equal(sh.run('sudo chmod 2770 /srv/shared').code, 0);
  assert.equal(sh.run('sudo -u builder touch /srv/shared/report.txt').code, 0);

  const node = sys.fs['/srv/shared/report.txt'];
  assert.equal(node.uid, sys.users.builder.uid);
  assert.equal(node.gid, sys.groups.builders.gid);
});

test('sticky bit is retained on a shared directory mode', () => {
  assert.equal(sh.run('mkdir /tmp/shared-drop').code, 0);
  assert.equal(sh.run('chmod 1777 /tmp/shared-drop').code, 0);
  const node = sys.fs['/tmp/shared-drop'];
  assert.equal(node.mode & 4095, parseInt('1777', 8));
});

test('sudo -u runs the command with the target identity', () => {
  const result = sh.run('sudo -u analyst id');
  assert.equal(result.code, 0);
  assert.match(result.stdout, /uid=\d+\(analyst\)/);
});

console.log('\n' + passed + ' permission tests passed.');
