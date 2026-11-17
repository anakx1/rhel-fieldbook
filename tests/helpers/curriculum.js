/* Load the JSON/HTML curriculum into the shared RHEL object for Node tests. */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..', '..');

function run(relative) {
  const filename = path.join(root, relative);
  vm.runInThisContext(fs.readFileSync(filename, 'utf8'), { filename: relative });
}

function installLessons() {
  const base = path.join(root, 'assets/data/lessons');
  const manifest = JSON.parse(fs.readFileSync(path.join(base, 'index.json'), 'utf8'));
  const records = manifest.lessons.map((id) => {
    const dir = path.join(base, id);
    const lesson = JSON.parse(fs.readFileSync(path.join(dir, 'lesson.json'), 'utf8'));
    lesson.sections.forEach((section) => {
      section.body = fs.readFileSync(path.join(dir, section.file), 'utf8');
    });
    return lesson;
  });
  global.RHEL.installCurriculum(records);
}

function loadCurriculum() {
  run('assets/js/data.js');
  run('assets/js/lab-checks.js');
  run('assets/js/quiz-order.js');
  run('assets/js/lessons-loader.js');
  installLessons();
}

const SANDBOX_SCRIPTS = [
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
];

module.exports = { root, run, loadCurriculum, installLessons, SANDBOX_SCRIPTS };
