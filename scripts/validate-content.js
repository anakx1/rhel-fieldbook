#!/usr/bin/env node
/* ==========================================================================
   RHEL Fieldbook — content validator
   Node only. No dependencies. Run with: node scripts/validate-content.js
   ========================================================================== */

'use strict';

var fs = require('fs');
var path = require('path');
var vm = require('vm');

var ROOT = path.join(__dirname, '..');
var failures = [];
var checks = 0;

global.window = global;

function load(relativePath) {
  var filename = path.join(ROOT, relativePath);
  vm.runInThisContext(fs.readFileSync(filename, 'utf8'), { filename: filename });
}

function rawCmd(value) {
  return String(value || '')
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim()
    .replace(/\s+/g, ' ');
}

function fail(message) {
  failures.push(message);
}

function check(label, fn) {
  checks++;
  var before = failures.length;
  var detail = fn();
  if (failures.length === before) {
    console.log('PASS  ' + label + (detail ? ' — ' + detail : ''));
  } else {
    console.log('FAIL  ' + label);
    failures.slice(before).forEach(function (message) {
      console.log('      - ' + message);
    });
  }
}

load('assets/js/data.js');
load('assets/js/lessons-orientation.js');
load('assets/js/lessons-operations.js');
load('assets/js/lessons-systems.js');
load('assets/js/lessons-practice.js');
load('assets/js/quiz-order.js');

var RHEL = global.RHEL;
if (!RHEL || !Array.isArray(RHEL.lessonOrder) || !RHEL.lessons) {
  console.error('Unable to load the RHEL curriculum data.');
  process.exit(1);
}

console.log('RHEL Fieldbook content validation');
console.log('---------------------------------');

check('lesson ids exist and module mappings are complete', function () {
  var ids = {};
  RHEL.lessonOrder.forEach(function (id) {
    if (typeof id !== 'string' || !id) fail('lessonOrder contains an empty or non-string id.');
    if (ids[id]) fail('lessonOrder contains a duplicate lesson id: ' + id + '.');
    ids[id] = true;
    if (!RHEL.lessons[id]) fail('lessonOrder references a missing lesson: ' + id + '.');
  });

  var moduleLessonIds = {};
  (RHEL.modules || []).forEach(function (module) {
    if (!module.id) fail('A module is missing its id.');
    if (!Array.isArray(module.lessons) || !module.lessons.length) {
      fail('Module ' + module.id + ' has no lessons.');
      return;
    }
    module.lessons.forEach(function (id) {
      if (!RHEL.lessons[id]) fail('Module ' + module.id + ' references a missing lesson: ' + id + '.');
      if (!ids[id]) fail('Module ' + module.id + ' lesson is not in lessonOrder: ' + id + '.');
      if (moduleLessonIds[id]) fail('Lesson appears in more than one module: ' + id + '.');
      moduleLessonIds[id] = true;
    });
  });

  RHEL.lessonOrder.forEach(function (id) {
    if (!moduleLessonIds[id]) fail('Lesson is not assigned to a module: ' + id + '.');
  });

  Object.keys(RHEL.lessons).forEach(function (id) {
    var lesson = RHEL.lessons[id];
    if (!ids[id]) fail('RHEL.lessons contains an id missing from lessonOrder: ' + id + '.');
    if (lesson.id !== id) fail('Lesson key ' + id + ' does not match lesson.id ' + lesson.id + '.');
    if (!Array.isArray(lesson.objectives) || !lesson.objectives.length) fail('Lesson ' + id + ' has no objectives.');
    if (!Array.isArray(lesson.commands) || !lesson.commands.length) fail('Lesson ' + id + ' has no command cards.');
    if (!lesson.lab || !Array.isArray(lesson.lab.steps) || !lesson.lab.steps.length) fail('Lesson ' + id + ' has no lab steps.');
    if (!Array.isArray(lesson.quiz) || !lesson.quiz.length) fail('Lesson ' + id + ' has no quiz questions.');
  });

  return RHEL.lessonOrder.length + ' lessons in ' + (RHEL.modules || []).length + ' modules';
});

check('quiz answer indices are in range', function () {
  var questions = 0;
  RHEL.lessonOrder.forEach(function (id) {
    var lesson = RHEL.lessons[id];
    if (!lesson || !Array.isArray(lesson.quiz)) return;
    lesson.quiz.forEach(function (question, index) {
      questions++;
      if (!question || !Array.isArray(question.options) || question.options.length < 2) {
        fail('Lesson ' + id + ' question ' + (index + 1) + ' has fewer than two options.');
        return;
      }
      if (typeof question.answer !== 'number' || !isFinite(question.answer) || question.answer % 1 !== 0) {
        fail('Lesson ' + id + ' question ' + (index + 1) + ' has a non-integer answer index.');
        return;
      }
      if (question.answer < 0 || question.answer >= question.options.length) {
        fail('Lesson ' + id + ' question ' + (index + 1) + ' answer index ' + question.answer + ' is outside 0..' + (question.options.length - 1) + '.');
      }
      if (!question.q) fail('Lesson ' + id + ' question ' + (index + 1) + ' is missing its prompt.');
      if (!question.why) fail('Lesson ' + id + ' question ' + (index + 1) + ' is missing its explanation.');
    });
  });
  return questions + ' quiz questions';
});

check('command cards are unique', function () {
  var seen = {};
  var commands = 0;
  RHEL.lessonOrder.forEach(function (id) {
    var lesson = RHEL.lessons[id];
    if (!lesson || !Array.isArray(lesson.commands)) return;
    lesson.commands.forEach(function (card, index) {
      commands++;
      var command = rawCmd(card && card.cmd);
      if (!command) {
        fail('Lesson ' + id + ' command card ' + (index + 1) + ' is empty.');
        return;
      }
      if (seen[command]) {
        fail('Duplicate command "' + command + '" in ' + id + ' and ' + seen[command] + '.');
      } else {
        seen[command] = id;
      }
    });
  });
  return commands + ' unique command cards';
});

check('every lab step has a verification prompt', function () {
  var steps = 0;
  RHEL.lessonOrder.forEach(function (id) {
    var lesson = RHEL.lessons[id];
    if (!lesson || !lesson.lab || !Array.isArray(lesson.lab.steps)) return;
    lesson.lab.steps.forEach(function (step, index) {
      steps++;
      if (!step || typeof step.verify !== 'string' || !step.verify.trim()) {
        fail('Lesson ' + id + ' lab step ' + (index + 1) + ' has no verification prompt.');
      }
    });
  });
  return steps + ' lab steps';
});

check('quiz answer positions are balanced after deterministic shuffling', function () {
  if (typeof RHEL.quizOrder !== 'function') {
    fail('RHEL.quizOrder is missing. Load assets/js/quiz-order.js before app.js.');
    return;
  }
  var counts = [0, 0, 0, 0];
  var questions = 0;
  var rawCounts = [0, 0, 0, 0];

  RHEL.lessonOrder.forEach(function (id) {
    var lesson = RHEL.lessons[id];
    if (!lesson || !Array.isArray(lesson.quiz)) return;
    lesson.quiz.forEach(function (question, index) {
      var order = RHEL.quizOrder(id, index, question);
      var expected = question.options.length;
      var seen = {};
      if (order.length !== expected) fail('Lesson ' + id + ' question ' + (index + 1) + ' shuffle has the wrong length.');
      order.forEach(function (optionIndex) {
        if (optionIndex < 0 || optionIndex >= expected) fail('Lesson ' + id + ' question ' + (index + 1) + ' shuffle contains an invalid option index.');
        if (seen[optionIndex]) fail('Lesson ' + id + ' question ' + (index + 1) + ' shuffle contains a duplicate option index.');
        seen[optionIndex] = true;
      });
      var position = order.indexOf(question.answer);
      if (position === -1) {
        fail('Lesson ' + id + ' question ' + (index + 1) + ' answer is missing from its shuffled order.');
        return;
      }
      if (position >= counts.length) {
        fail('Lesson ' + id + ' question ' + (index + 1) + ' has an unexpected option count.');
        return;
      }
      counts[position]++;
      rawCounts[question.answer]++;
      questions++;
    });
  });

  var spread = Math.max.apply(Math, counts) - Math.min.apply(Math, counts);
  var distribution = counts.map(function (count, index) { return index + ':' + count; }).join('  ');
  if (spread > 4) {
    fail('Displayed answer positions are unbalanced: ' + distribution + ' (spread ' + spread + ', tolerance 4). Re-seed quiz-order.js.');
  }
  return questions + ' questions · displayed ' + distribution + ' · raw ' + rawCounts.map(function (count, index) { return index + ':' + count; }).join('  ');
});

console.log('---------------------------------');
if (failures.length) {
  console.log('Validation failed with ' + failures.length + ' issue' + (failures.length === 1 ? '' : 's') + ' across ' + checks + ' checks.');
  process.exit(1);
}
console.log('All ' + checks + ' checks passed.');
