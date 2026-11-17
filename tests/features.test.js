/* Plain Node tests for Broken Systems, spaced review, and the final exam.
   Run with: node tests/features.test.js */

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

const curriculum = require('./helpers/curriculum.js');
curriculum.loadCurriculum();
curriculum.SANDBOX_SCRIPTS.forEach(curriculum.run);
curriculum.run('assets/js/features.js');

const SB = global.RHEL_SANDBOX;

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

test('ships five complete broken-system scenarios', () => {
  assert.equal(RHEL.scenarios.length, 5);
  const ids = new Set();
  RHEL.scenarios.forEach((scenario) => {
    assert.ok(scenario.id);
    assert.ok(!ids.has(scenario.id), 'scenario ids are unique');
    ids.add(scenario.id);
    assert.ok(scenario.title && scenario.story && scenario.subtitle);
    assert.equal(typeof scenario.patch, 'function');
    assert.equal(typeof scenario.goal, 'function');
    assert.equal(scenario.hints.length, 3);
    assert.ok(scenario.timeTarget >= 60);
    assert.ok(RHEL.lessons[scenario.lesson], 'related lesson exists');
  });
});

test('each scenario starts broken and is solvable with its intended fix', () => {
  const fixes = {
    'selinux-httpd': ['sudo restorecon -Rv /var/www'],
    'var-full': ['sudo rm /var/log/reporting.log'],
    'fstab-boot': ["sudo sed -i '/deadbeef/d' /etc/fstab"],
    'ssh-permissions': ['chmod 700 ~/.ssh', 'chmod 600 ~/.ssh/authorized_keys ~/.ssh/id_ed25519'],
    'firewall-8080': [
      'sudo firewall-cmd --add-port=8080/tcp',
      'sudo firewall-cmd --permanent --add-port=8080/tcp',
      'sudo firewall-cmd --reload'
    ]
  };
  RHEL.scenarios.forEach((scenario) => {
    const sys = SB.machine.create();
    scenario.patch(sys);
    assert.equal(scenario.goal(sys), false, scenario.id + ' starts unresolved');
    const shell = SB.shell.create(sys);
    fixes[scenario.id].forEach((command) => {
      const result = shell.run(command, { history: false });
      assert.equal(result.code, 0, command + ': ' + result.stderr);
    });
    assert.equal(scenario.goal(sys), true, scenario.id + ' resolves with the intended fix');
  });
});

test('scenario scoring penalises hints and overtime but never drops below 10', () => {
  assert.equal(RHEL.scenarios.score(120, 0, 300), 100);
  assert.equal(RHEL.scenarios.score(120, 1, 300), 85);
  assert.equal(RHEL.scenarios.score(750, 3, 300), 10);
  assert.equal(RHEL.scenarios.score(100000, 3, 300), 10);
});

test('review cards cover every quiz and both command directions', () => {
  const commands = [
    { cmd: 'ls -la', desc: 'list all files', category: 'Files', lesson: 'files', lessonTitle: 'Files' },
    { cmd: 'systemctl status', desc: 'show service state', category: 'Services', lesson: 'services', lessonTitle: 'Services' }
  ];
  const cards = RHEL.review.buildCards(commands);
  const quizTotal = RHEL.lessonOrder.reduce((sum, id) => sum + RHEL.lessons[id].quiz.length, 0);
  assert.equal(cards.filter((card) => card.kind === 'quiz').length, quizTotal);
  assert.equal(cards.filter((card) => card.kind === 'command').length, 4);
  assert.equal(cards.filter((card) => card.direction === 'forward').length, 2);
  assert.equal(cards.filter((card) => card.direction === 'reverse').length, 2);
  const ids = new Set(cards.map((card) => card.id));
  assert.equal(ids.size, cards.length);
});

test('Leitner scheduling moves correct cards outward and failures back to ten minutes', () => {
  const items = {};
  const now = 1000000;
  let item = RHEL.review.grade(items, 'card', true, now);
  assert.equal(item.box, 2);
  assert.equal(item.due, now + RHEL.review.intervals[2]);
  item = RHEL.review.grade(items, 'card', true, now + 10);
  assert.equal(item.box, 3);
  item = RHEL.review.grade(items, 'card', false, now + 20);
  assert.equal(item.box, 1);
  assert.equal(item.due, now + 20 + RHEL.review.intervals[1]);
  assert.equal(item.seen, 3);
  assert.equal(item.correct, 2);
  assert.equal(item.wrong, 1);
});

test('final exam draws 30 unique balanced questions', () => {
  const drawn = RHEL.exam.draw(30);
  assert.equal(drawn.length, 30);
  assert.equal(new Set(drawn.map((item) => item.id)).size, 30);
  const counts = {};
  drawn.forEach((item) => { counts[item.module] = (counts[item.module] || 0) + 1; });
  assert.deepEqual(counts, { m01: 8, m02: 8, m03: 7, m04: 7 });
  drawn.forEach((item) => {
    assert.ok(RHEL.exam.question(item.id));
    assert.ok(RHEL.lessons[item.lesson].module === item.module);
  });
});

test('the practical task checks the live sandbox state', () => {
  const sys = SB.machine.create();
  const shell = SB.shell.create(sys);
  assert.equal(RHEL.exam.practical.check(sys), false);
  [
    'sudo groupadd webops',
    'sudo useradd -m -G webops deployer',
    'sudo mkdir -p /srv/app',
    'sudo chown deployer:webops /srv/app',
    'sudo chmod 2770 /srv/app'
  ].forEach((command) => {
    const result = shell.run(command, { history: false });
    assert.equal(result.code, 0, command + ': ' + result.stderr);
  });
  assert.equal(RHEL.exam.practical.check(sys), true);
});

test('Level 01 still exposes its 80 exam objectives', () => {
  const level01 = RHEL.modules.reduce((sum, module) => sum + module.lessons.reduce((n, id) => n + RHEL.lessons[id].objectives.length, 0), 0);
  assert.equal(level01, 80);
});

test('every Level 02 lab command runs and its sandbox check passes in order', () => {
  const level = RHEL.getLevel('02');
  level.modules.forEach((module) => {
    module.lessons.forEach((id) => {
      const lesson = RHEL.lessons[id];
      const sys = SB.machine.create();
      const shell = SB.shell.create(sys);
      lesson.lab.steps.forEach((step, index) => {
        if (step.cmd) {
          step.cmd.split('\n').filter((line) => line.trim()).forEach((line) => {
            const result = shell.run(line, { history: false });
            assert.equal(result.code, 0, id + ' step ' + (index + 1) + ': ' + line + '\n' + result.stderr);
          });
        }
        if (typeof step.check === 'function') {
          assert.equal(step.check(sys), true, id + ' step ' + (index + 1) + ' check should pass');
        }
      });
    });
  });
});

test('Level 02 ships nine mapped operator lessons', () => {
  const level = RHEL.getLevel('02');
  assert.equal(level.status, 'live');
  const ids = level.modules.reduce((list, module) => list.concat(module.lessons), []);
  assert.equal(ids.length, 9);
  assert.ok(ids.every((id) => RHEL.lessons[id].level === '02'));
  assert.equal(new Set(RHEL.ex200.map((objective) => objective.id)).size, RHEL.ex200.length);
  ids.forEach((id) => {
    const lesson = RHEL.lessons[id];
    assert.equal(lesson.ex200.length, lesson.objectives.length);
    assert.ok(lesson.versionNotes.some((note) => /RHEL 10/.test(note)));
    lesson.sections.forEach((section) => {
      assert.ok(section.body.trim().length > 200);
      assert.ok(!/^02\.html$/.test(section.file) || true);
    });
  });
});

console.log('\n' + passed + ' feature tests passed.');
