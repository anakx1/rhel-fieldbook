/* Plain Node tests for the sandbox parser and shell expansion.
   Run with: node tests/sandbox-parser.test.js */

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
const P = SB.parser;

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

test('lexer preserves quoted and escaped words', () => {
  const words = P.splitRawWords("echo 'a b' \"c d\" e\\ f");
  assert.deepEqual(words, ['echo', 'a b', 'c d', 'e f']);
});

test('parser splits connectors and pipelines', () => {
  const ast = P.parseLine('echo one; echo two && echo three || echo four');
  assert.equal(ast.length, 4);
  assert.equal(ast[0].connector, ';');
  assert.equal(ast[1].connector, '&&');
  assert.equal(ast[2].connector, '||');
  assert.equal(ast[3].pipeline.length, 1);

  const piped = P.parseLine('printf x | cat | wc -c');
  assert.equal(piped[0].pipeline.length, 3);
});

test('parser records output, append, and descriptor redirects', () => {
  const ast = P.parseLine('cat > out 2>> err 2>&1');
  const redirects = ast[0].pipeline[0].redirects;
  assert.deepEqual(redirects.map((r) => [r.fd, r.op]), [
    [1, '>'],
    [2, '>>'],
    [2, 'dup']
  ]);
  assert.equal(redirects[2].dup, 1);
  assert.equal(ast[0].pipeline[0].words.length, 1);
});

test('brace expansion produces ordered values', () => {
  assert.deepEqual(P.braceExpand('day{1..3}.txt'), ['day1.txt', 'day2.txt', 'day3.txt']);
  assert.deepEqual(P.braceExpand('{notes,logs}'), ['notes', 'logs']);
});

test('shell expands variables, $?, command substitution, and globs', () => {
  const sys = SB.machine.create();
  const sh = SB.shell.create(sys);
  let result = sh.run('echo "$USER:$HOME"');
  assert.equal(result.stdout, 'student:/home/student\n');
  result = sh.run('false; echo status=$?');
  assert.equal(result.stdout, 'status=1\n');
  result = sh.run('echo /etc/*.conf');
  assert.match(result.stdout, /\/etc\/resolv\.conf/);
});

test('shell honors pipes, redirects, and quoted redirection targets', () => {
  const sys = SB.machine.create();
  const sh = SB.shell.create(sys);
  let result = sh.run('echo hello > /tmp/parser-test.txt && cat /tmp/parser-test.txt');
  assert.equal(result.stdout, 'hello\n');
  result = sh.run('printf "a\\nb\\n" | grep b');
  assert.equal(result.stdout, 'b\n');
  result = sh.run('ls /does-not-exist 2>/dev/null; echo code=$?');
  assert.equal(result.stdout, 'code=2\n');
  result = sh.run('echo both 2>&1 | cat');
  assert.equal(result.stdout, 'both\n');
});

test('tab completion completes command names and paths', () => {
  const sys = SB.machine.create();
  const sh = SB.shell.create(sys);
  const commands = sh.completion('whoa', 4);
  assert.ok(commands.candidates.indexOf('whoami') !== -1);
  const paths = sh.completion('ls /etc/pass', 11);
  assert.ok(paths.candidates.indexOf('/etc/passwd') !== -1);
});

console.log('\n' + passed + ' parser tests passed.');
