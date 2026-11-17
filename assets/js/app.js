/* ==========================================================================
   RHEL Fieldbook — application
   Vanilla JS SPA. No build step, no tracking, progress in localStorage.
   ========================================================================== */

(function () {
  'use strict';

  var STORAGE_KEY = 'rhel-fieldbook:v1';
  var app = document.getElementById('app');
  var header = document.getElementById('site-header');
  var toastEl = document.getElementById('toast');
  var toastTimer = null;
  var activeNav = 'home';
  var currentRoute = { name: 'home' };
  var commandCache = null;
  var reviewCardCache = null;
  var reviewRevealed = false;

  var DEFAULT_STATE = {
    version: 1,
    theme: 'light',
    completedLessons: [],
    objectives: {},
    labSteps: {},
    quiz: {},
    quizVersion: 3,
    labsDone: [],
    lastLesson: null,
    lastVisit: null,
    scenarioRuns: {},
    scenarioActive: null,
    review: { version: 1, items: {}, active: null, lastSession: null, history: [] },
    exam: { active: null, lastResult: null, history: [], learnerName: '' }
  };

  function freshState() {
    return JSON.parse(JSON.stringify(DEFAULT_STATE));
  }

  var state = loadState();

  /* ------------------------------------------------------------------------
     Utilities
     ------------------------------------------------------------------------ */

  function loadState() {
    var loaded;
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      loaded = raw ? Object.assign(freshState(), JSON.parse(raw)) : freshState();
    } catch (e) {
      loaded = freshState();
    }
    var migrated = migrateState(loaded);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated)); } catch (e) {}
    return migrated;
  }

  /* Older saves stored quiz answers by the original option index. That is
     still the storage format after the render-time shuffle, so valid answers
     are preserved and anything malformed is dropped instead of breaking the
     lesson renderer. */
  function migrateState(input) {
    var s = Object.assign(freshState(), input || {});
    if (!s.quiz || typeof s.quiz !== 'object' || Array.isArray(s.quiz)) s.quiz = {};
    Object.keys(s.quiz).forEach(function (lessonId) {
      var lesson = RHEL.lessons[lessonId];
      var answers = s.quiz[lessonId];
      if (!lesson || !lesson.quiz || !answers || typeof answers !== 'object' || Array.isArray(answers)) {
        delete s.quiz[lessonId];
        return;
      }
      var clean = {};
      Object.keys(answers).forEach(function (key) {
        var qi = parseInt(key, 10);
        var oi = parseInt(answers[key], 10);
        var question = lesson.quiz[qi];
        if (!isFinite(qi) || !isFinite(oi) || !question) return;
        if (oi < 0 || oi >= question.options.length) return;
        clean[qi] = oi;
      });
      if (Object.keys(clean).length) s.quiz[lessonId] = clean;
      else delete s.quiz[lessonId];
    });
    s.quizVersion = 3;
    s.scenarioRuns = isPlainObject(s.scenarioRuns) ? s.scenarioRuns : {};
    Object.keys(s.scenarioRuns).forEach(function (id) {
      var run = RHEL.scenarios.find(id) ? normalizeScenarioRun(s.scenarioRuns[id]) : null;
      if (run) s.scenarioRuns[id] = run;
      else delete s.scenarioRuns[id];
    });
    if (s.scenarioActive) {
      var activeScenario = RHEL.scenarios.find(s.scenarioActive.id);
      if (!activeScenario || !isFinite(Number(s.scenarioActive.startedAt))) s.scenarioActive = null;
      else {
        s.scenarioActive.startedAt = Number(s.scenarioActive.startedAt);
        s.scenarioActive.hints = Math.max(0, Math.min(3, parseInt(s.scenarioActive.hints, 10) || 0));
      }
    }
    s.review = normalizeReviewState(s.review);
    s.exam = normalizeExamState(s.exam);
    return s;
  }

  function clampNumber(value, min, max, fallback) {
    var number = Number(value);
    if (!isFinite(number)) number = fallback;
    return Math.max(min, Math.min(max, number));
  }

  function safeTimestamp(value) {
    return typeof value === 'string' && !isNaN(Date.parse(value)) ? value : new Date(0).toISOString();
  }

  function normalizeScenarioRun(value) {
    if (!isPlainObject(value)) return null;
    return {
      attempts: Math.max(1, parseInt(value.attempts, 10) || 1),
      bestScore: clampNumber(value.bestScore, 0, 100, 0),
      bestSeconds: clampNumber(value.bestSeconds, 0, 365 * 24 * 60 * 60, 0),
      lastScore: clampNumber(value.lastScore, 0, 100, 0),
      lastSeconds: clampNumber(value.lastSeconds, 0, 365 * 24 * 60 * 60, 0),
      lastHints: clampNumber(value.lastHints, 0, 3, 0),
      lastCompletedAt: safeTimestamp(value.lastCompletedAt)
    };
  }

  function normalizeReviewSession(value) {
    if (!isPlainObject(value)) return null;
    return {
      completedAt: safeTimestamp(value.completedAt),
      reviewed: Math.max(0, parseInt(value.reviewed, 10) || 0),
      correct: Math.max(0, parseInt(value.correct, 10) || 0),
      again: Math.max(0, parseInt(value.again, 10) || 0),
      filter: value.filter === 'quiz' || value.filter === 'commands' ? value.filter : 'all',
      durationSeconds: Math.max(0, parseInt(value.durationSeconds, 10) || 0)
    };
  }

  function normalizeExamResult(value) {
    if (!isPlainObject(value)) return null;
    var questionIds = Array.isArray(value.questionIds)
      ? value.questionIds.filter(function (id) { return !!RHEL.exam.question(id); })
      : [];
    var total = questionIds.length || Math.max(0, Math.min(100, parseInt(value.total, 10) || 0));
    var correct = clampNumber(value.correct, 0, total || 100, 0);
    var practicalPassed = value.practicalPassed === true;
    var score = clampNumber(value.score, 0, 100, total ? Math.round(((correct + (practicalPassed ? 1 : 0)) / (total + 1)) * 100) : 0);
    var answers = {};
    if (isPlainObject(value.answers)) {
      Object.keys(value.answers).forEach(function (id) {
        var item = RHEL.exam.question(id);
        var choice = parseInt(value.answers[id], 10);
        if (item && isFinite(choice) && choice >= 0 && choice < item.question.options.length) answers[id] = choice;
      });
    }
    var moduleStats = {};
    RHEL.modules.forEach(function (module) {
      var source = isPlainObject(value.moduleStats) && isPlainObject(value.moduleStats[module.id]) ? value.moduleStats[module.id] : {};
      var moduleTotal = Math.max(0, parseInt(source.total, 10) || 0);
      moduleStats[module.id] = {
        id: module.id,
        number: module.number,
        title: module.title,
        correct: clampNumber(source.correct, 0, moduleTotal, 0),
        total: moduleTotal
      };
    });
    var questionResults = Array.isArray(value.questionResults) ? value.questionResults.filter(function (item) {
      return isPlainObject(item) && !!RHEL.exam.question(item.id);
    }).map(function (item) {
      var source = RHEL.exam.question(item.id);
      return { id: item.id, lesson: source.lesson, module: source.module, qi: source.qi, chosen: item.chosen === null || item.chosen === undefined ? null : parseInt(item.chosen, 10), correct: item.correct === true };
    }) : [];
    return {
      id: typeof value.id === 'string' ? value.id.slice(0, 80) : 'exam-imported',
      completedAt: safeTimestamp(value.completedAt),
      startedAt: Number(value.startedAt) || 0,
      durationSeconds: clampNumber(value.durationSeconds, 0, 24 * 60 * 60, 0),
      score: score,
      correct: correct,
      total: total,
      practicalPassed: practicalPassed,
      pass: score >= RHEL.exam.config.passScore && practicalPassed,
      moduleStats: moduleStats,
      questionResults: questionResults,
      questionIds: questionIds,
      answers: answers
    };
  }

  function normalizeExamHistoryItem(value) {
    if (!isPlainObject(value)) return null;
    var practicalPassed = value.practicalPassed === true;
    var score = clampNumber(value.score, 0, 100, 0);
    return {
      id: typeof value.id === 'string' ? value.id.slice(0, 80) : 'exam-imported',
      completedAt: safeTimestamp(value.completedAt),
      score: score,
      correct: clampNumber(value.correct, 0, 100, 0),
      total: clampNumber(value.total, 0, 100, 0),
      practicalPassed: practicalPassed,
      pass: score >= RHEL.exam.config.passScore && practicalPassed,
      durationSeconds: clampNumber(value.durationSeconds, 0, 24 * 60 * 60, 0)
    };
  }

  function normalizeReviewState(value) {
    var review = { version: 1, items: {}, active: null, lastSession: null, history: [] };
    if (!isPlainObject(value)) return review;
    var cardMap = {};
    getReviewCards().forEach(function (card) { cardMap[card.id] = card; });
    if (isPlainObject(value.items)) {
      Object.keys(value.items).forEach(function (id) {
        var item = value.items[id];
        if (!cardMap[id] || !isPlainObject(item)) return;
        var box = parseInt(item.box, 10);
        if (!isFinite(box)) box = 1;
        review.items[id] = {
          box: Math.max(1, Math.min(5, box)),
          due: Number(item.due) || 0,
          seen: Math.max(0, parseInt(item.seen, 10) || 0),
          correct: Math.max(0, parseInt(item.correct, 10) || 0),
          wrong: Math.max(0, parseInt(item.wrong, 10) || 0),
          last: item.last ? Number(item.last) : null
        };
      });
    }
    if (isPlainObject(value.active) && Array.isArray(value.active.queue)) {
      var queue = value.active.queue.filter(function (id) { return !!cardMap[id]; });
      if (queue.length) {
        review.active = {
          queue: queue,
          index: Math.max(0, Math.min(queue.length, parseInt(value.active.index, 10) || 0)),
          filter: value.active.filter === 'quiz' || value.active.filter === 'commands' ? value.active.filter : 'all',
          startedAt: Number(value.active.startedAt) || Date.now(),
          correct: Math.max(0, parseInt(value.active.correct, 10) || 0),
          again: Math.max(0, parseInt(value.active.again, 10) || 0)
        };
      }
    }
    if (isPlainObject(value.lastSession)) review.lastSession = normalizeReviewSession(value.lastSession);
    if (Array.isArray(value.history)) {
      review.history = value.history.map(normalizeReviewSession).filter(Boolean).slice(-20);
    }
    return review;
  }

  function normalizeExamState(value) {
    var exam = { active: null, lastResult: null, history: [], learnerName: '' };
    if (!isPlainObject(value)) return exam;
    if (typeof value.learnerName === 'string') exam.learnerName = value.learnerName.slice(0, 80);
    if (isPlainObject(value.active) && Array.isArray(value.active.questionIds) && value.active.questionIds.length) {
      var validIds = value.active.questionIds.filter(function (id) { return !!RHEL.exam.question(id); });
      if (validIds.length === value.active.questionIds.length) {
        var answers = {};
        if (isPlainObject(value.active.answers)) {
          Object.keys(value.active.answers).forEach(function (id) {
            var item = RHEL.exam.question(id);
            var choice = parseInt(value.active.answers[id], 10);
            if (item && isFinite(choice) && choice >= 0 && choice < item.question.options.length) answers[id] = choice;
          });
        }
        exam.active = {
          id: typeof value.active.id === 'string' ? value.active.id : 'exam-' + Date.now(),
          questionIds: validIds,
          answers: answers,
          index: Math.max(0, Math.min(validIds.length, parseInt(value.active.index, 10) || 0)),
          startedAt: Number(value.active.startedAt) || Date.now(),
          endsAt: Number(value.active.endsAt) || (Date.now() + RHEL.exam.config.minutes * 60000)
        };
      }
    }
    if (isPlainObject(value.lastResult)) exam.lastResult = normalizeExamResult(value.lastResult);
    if (Array.isArray(value.history)) exam.history = value.history.map(normalizeExamHistoryItem).filter(Boolean).slice(-10);
    return exam;
  }

  function saveState() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) {}
  }

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function escAttr(value) { return esc(value); }

  function rawCmd(value) {
    return String(value || '')
      .replace(/&gt;/g, '>')
      .replace(/&lt;/g, '<')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");
  }

  var ICONS = {
    arrow: '<path d="M4 12h15M13 6l6 6-6 6"/>',
    arrowUp: '<path d="M7 17 17 7M7 7h10v10"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3 2"/>',
    book: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5Z"/><path d="M4 5.5v15M8 7h8M8 11h5"/>',
    terminal: '<path d="m5 7 5 5-5 5M12 17h7"/>',
    shield: '<path d="M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6Z"/><path d="m9 12 2 2 4-4"/>',
    target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1"/>',
    layers: '<path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5M3 16l9 5 9-5"/>',
    compass: '<circle cx="12" cy="12" r="8.5"/><path d="m15.5 8.5-2 5-5 2 2-5 5-2Z"/>',
    copy: '<rect x="8" y="8" width="11" height="11" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
    play: '<path d="m8 5 10 7-10 7V5Z"/>',
    reset: '<path d="M3 12a9 9 0 1 0 3-6.7M3 4v5h5"/>',
    chevron: '<path d="m9 6 6 6-6 6"/>',
    external: '<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
    spark: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8"/>',
    warn: '<path d="M12 3 2.5 20h19L12 3Z"/><path d="M12 9v5M12 17h.01"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    download: '<path d="M12 4v11M8 11l4 4 4-4"/><path d="M5 20h14"/>',
    upload: '<path d="M12 20V9M8 13l4-4 4 4"/><path d="M5 4h14"/>'
  };

  function icon(name, size, cls) {
    var s = size || 16;
    return '<svg class="' + (cls || '') + '" aria-hidden="true" viewBox="0 0 24 24" width="' + s + '" height="' + s + '" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' + (ICONS[name] || '') + '</svg>';
  }

  function isComplete(id) { return state.completedLessons.indexOf(id) !== -1; }
  function isLabDone(id) { return state.labsDone.indexOf(id) !== -1; }
  function sandboxSystem() {
    return window.RHEL_SANDBOX && typeof window.RHEL_SANDBOX.getSystem === 'function' ? window.RHEL_SANDBOX.getSystem() : null;
  }
  function labStepAuto(step) {
    if (!step || typeof step.check !== 'function') return null;
    var sys = sandboxSystem();
    if (!sys) return null;
    try { return !!step.check(sys); }
    catch (e) { return false; }
  }
  function scenarioGoalMet(scenario) {
    var sys = sandboxSystem();
    if (!scenario || !sys) return false;
    try { return !!scenario.goal(sys); }
    catch (e) { return false; }
  }
  function labStepDone(id, step, index) {
    if ((state.labSteps[id] || [])[index]) return true;
    return labStepAuto(step) === true;
  }
  function coursePercent() {
    return Math.round((state.completedLessons.length / RHEL.lessonOrder.length) * 100);
  }

  function totalCommands() { return getCommands().length; }

  function getCommands() {
    if (commandCache) return commandCache;
    var seen = {};
    var list = [];
    RHEL.lessonOrder.forEach(function (id) {
      var lesson = RHEL.lessons[id];
      if (!lesson || !lesson.commands) return;
      lesson.commands.forEach(function (c) {
        var raw = rawCmd(c.cmd);
        if (seen[raw]) return;
        seen[raw] = true;
        list.push({
          cmd: raw,
          desc: c.desc,
          category: c.category || 'General',
          lesson: id,
          lessonTitle: lesson.title
        });
      });
    });
    list.sort(function (a, b) {
      if (a.category === b.category) return a.cmd.localeCompare(b.cmd);
      return a.category.localeCompare(b.category);
    });
    commandCache = list;
    return list;
  }

  function getReviewCards() {
    if (!reviewCardCache) reviewCardCache = RHEL.review.buildCards(getCommands());
    return reviewCardCache;
  }

  function reviewDueCount(now) {
    return RHEL.review.dueCount(getReviewCards(), state.review.items || {}, now || Date.now());
  }

  function reviewCardById(id) {
    return getReviewCards().filter(function (card) { return card.id === id; })[0] || null;
  }

  function shuffleList(list) {
    var copy = list.slice();
    for (var i = copy.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var value = copy[i];
      copy[i] = copy[j];
      copy[j] = value;
    }
    return copy;
  }

  function reviewStats(now) {
    var cards = getReviewCards();
    var items = state.review.items || {};
    var due = 0;
    var fresh = 0;
    var learning = 0;
    var mature = 0;
    var quizDue = 0;
    var commandDue = 0;
    cards.forEach(function (card) {
      var item = items[card.id];
      if (!item) fresh += 1;
      else if (item.box >= 4) mature += 1;
      else learning += 1;
      if (RHEL.review.isDueToday(item, now || Date.now())) {
        due += 1;
        if (card.kind === 'quiz') quizDue += 1;
        else commandDue += 1;
      }
    });
    return { total: cards.length, due: due, fresh: fresh, learning: learning, mature: mature, quizDue: quizDue, commandDue: commandDue };
  }

  function updateReviewUI() {
    var due = reviewDueCount();
    document.querySelectorAll('[data-review-due]').forEach(function (el) {
      el.textContent = due;
      el.setAttribute('aria-label', due + ' review cards due today');
    });
    document.querySelectorAll('[data-review-due-label]').forEach(function (el) {
      el.textContent = due === 1 ? '1 card due today' : due + ' cards due today';
    });
  }

  function scenarioRun(id) {
    return state.scenarioRuns && state.scenarioRuns[id] ? state.scenarioRuns[id] : null;
  }

  function activeScenario() {
    if (!state.scenarioActive) return null;
    return RHEL.scenarios.find(state.scenarioActive.id);
  }

  function formatDuration(totalSeconds) {
    var seconds = Math.max(0, Math.round(totalSeconds || 0));
    var minutes = Math.floor(seconds / 60);
    var rest = seconds % 60;
    return minutes + ':' + String(rest).padStart(2, '0');
  }

  function formatClock(totalSeconds) {
    var seconds = Math.max(0, Math.ceil(totalSeconds || 0));
    var minutes = Math.floor(seconds / 60);
    var rest = seconds % 60;
    return String(minutes).padStart(2, '0') + ':' + String(rest).padStart(2, '0');
  }

  function examRemaining() {
    var active = state.exam.active;
    if (!active) return 0;
    return Math.max(0, Math.ceil((active.endsAt - Date.now()) / 1000));
  }

  function examAnsweredCount() {
    var active = state.exam.active;
    if (!active) return 0;
    return active.questionIds.filter(function (id) { return active.answers[id] !== undefined; }).length;
  }

  function examPracticalPassed() {
    var sys = sandboxSystem();
    if (!sys) return false;
    try { return !!RHEL.exam.practical.check(sys); }
    catch (e) { return false; }
  }

  function scenarioElapsed() {
    if (!state.scenarioActive) return 0;
    return Math.max(0, Math.round((Date.now() - state.scenarioActive.startedAt) / 1000));
  }

  function objectiveScore(lesson, index) {
    var questionIndex = index % lesson.quiz.length;
    var answer = (state.quiz[lesson.id] || {})[questionIndex];
    var quizCorrect = answer === lesson.quiz[questionIndex].answer;
    var stepIndex = index % lesson.lab.steps.length;
    var step = lesson.lab.steps[stepIndex];
    var labDone = labStepDone(lesson.id, step, stepIndex);
    var manual = (state.objectives[lesson.id] || []).indexOf(index) !== -1;
    var score = (quizCorrect ? 45 : 0) + (labDone ? 45 : 0) + (manual ? 10 : 0);
    var status = score >= 90 ? 'Mastered' : score >= 45 ? 'Practicing' : score > 0 ? 'Started' : 'Not started';
    return {
      questionIndex: questionIndex,
      question: lesson.quiz[questionIndex],
      answer: answer,
      quizCorrect: quizCorrect,
      stepIndex: stepIndex,
      step: step,
      labDone: labDone,
      manual: manual,
      score: score,
      status: status
    };
  }

  function getContinueLesson() {
    var lastIndex = state.lastLesson ? RHEL.lessonOrder.indexOf(state.lastLesson) : -1;
    for (var i = Math.max(lastIndex, 0); i < RHEL.lessonOrder.length; i++) {
      if (!isComplete(RHEL.lessonOrder[i])) return RHEL.lessons[RHEL.lessonOrder[i]];
    }
    for (var j = 0; j < RHEL.lessonOrder.length; j++) {
      if (!isComplete(RHEL.lessonOrder[j])) return RHEL.lessons[RHEL.lessonOrder[j]];
    }
    return RHEL.lessons[RHEL.lessonOrder[0]];
  }

  function getModuleProgress(module) {
    var total = module.lessons.length;
    var done = module.lessons.filter(isComplete).length;
    return { total: total, done: done, pct: total ? Math.round((done / total) * 100) : 0 };
  }

  function applyTheme(theme) {
    state.theme = theme === 'dark' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', state.theme);
    document.documentElement.style.colorScheme = state.theme;
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', state.theme === 'dark' ? '#13110e' : '#f3efe7');
    var btn = document.getElementById('theme-toggle');
    if (btn) {
      var next = state.theme === 'dark' ? 'light' : 'dark';
      btn.setAttribute('aria-label', 'Switch to ' + next + ' theme');
      btn.setAttribute('title', 'Switch to ' + next + ' theme');
    }
    saveState();
  }

  function updateProgressUI() {
    var pct = coursePercent();
    document.querySelectorAll('[data-progress-percent]').forEach(function (el) { el.textContent = pct + '%'; });
    document.querySelectorAll('[data-progress-bar]').forEach(function (el) { el.style.width = pct + '%'; });
    document.querySelectorAll('[data-progress-ring]').forEach(function (el) {
      el.style.setProperty('--p', pct);
      var label = el.querySelector('span');
      if (label) label.textContent = pct + '%';
    });
    document.querySelectorAll('[data-completed-count]').forEach(function (el) { el.textContent = state.completedLessons.length; });
    document.querySelectorAll('[data-labs-count]').forEach(function (el) { el.textContent = state.labsDone.length; });
    document.querySelectorAll('[data-lesson-count-total]').forEach(function (el) { el.textContent = RHEL.lessonOrder.length; });
    updateReviewUI();
  }

  function showToast(html, duration) {
    if (!toastEl) return;
    toastEl.innerHTML = html;
    toastEl.classList.add('is-visible');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(function () {
      toastEl.classList.remove('is-visible');
    }, duration || 4800);
  }

  /* ------------------------------------------------------------------------
     Home
     ------------------------------------------------------------------------ */

  function viewHome() {
    var next = getContinueLesson();
    var nextNum = String(RHEL.getLessonNumber(next.id)).padStart(2, '0');
    var pct = coursePercent();
    var started = state.completedLessons.length > 0 || !!state.lastLesson;
    var modules = RHEL.modules;
    var commandCount = totalCommands();
    var review = reviewStats();
    var incidentsDone = RHEL.scenarios.filter(function (scenario) { return !!scenarioRun(scenario.id); }).length;
    var lastExam = state.exam.lastResult;

    var levelRail = RHEL.levels.map(function (level, i) {
      var live = level.status === 'live';
      var meta = live ? level.lessonsLabel || (RHEL.lessonOrder.length + ' lessons') : level.modules.length + ' modules';
      return `
        <a class="level-card ${live ? 'is-live' : ''}" href="${live ? '#/learn' : '#/roadmap'}">
          <span class="level-card-top">
            <span class="level-index">${level.id}</span>
            <span class="level-status">${live ? 'Available now' : 'Mapped'}</span>
          </span>
          <h3 class="level-title">${esc(level.title)}</h3>
          <p class="level-desc">${esc(level.promise)}</p>
          <span class="level-meta"><span>${meta}</span>${icon('arrowUp', 12)}</span>
        </a>`;
    }).join('');

    var moduleCards = modules.map(function (m) {
      var p = getModuleProgress(m);
      return `
        <article class="module-card">
          <div class="module-card-top">
            <span class="module-num">Module ${m.number}</span>
            <span class="module-duration">${esc(m.duration)}</span>
          </div>
          <h3>${esc(m.title)}</h3>
          <p>${esc(m.blurb)}</p>
          <div class="module-lessons">
            ${m.lessons.map(function (id) {
              var lesson = RHEL.lessons[id];
              return `
                <a class="module-lesson ${isComplete(id) ? 'is-done' : ''}" href="#/lesson/${id}">
                  <span class="module-lesson-index">${String(RHEL.getLessonNumber(id)).padStart(2, '0')}</span>
                  <span>${esc(lesson.title)}</span>
                  <span class="check-dot" aria-label="${isComplete(id) ? 'Complete' : 'Not complete'}"></span>
                </a>`;
            }).join('')}
          </div>
          <div class="level-meta" style="margin-top:16px; border-top:0; padding-top:0;">
            <span>${p.done}/${p.total} complete</span>
            <span>${p.pct}%</span>
          </div>
        </article>`;
    }).join('');

    return `
    <div class="view home-view">
      <section class="home-hero shell">
        <div class="hero-copy">
          <div class="hero-kicker">
            <span class="pill">Zero → production</span>
            <span class="sep"></span>
            <span>Independent RHEL field guide</span>
          </div>
          <h1 class="hero-title">From first prompt<br>to <span class="accent">production.</span></h1>
          <p class="hero-sub">A complete, hands-on path through Red Hat Enterprise Linux. Learn the shell, identity, storage, services, networking, and automation the way an administrator actually uses them — with <strong>objectives, labs, and a terminal you can practice in.</strong></p>
          <div class="hero-actions">
            <a class="btn btn-primary" href="#/lesson/${next.id}">${started ? 'Continue' : 'Start'} Lesson ${nextNum} ${icon('arrow', 16, 'arrow')}</a>
            <a class="btn btn-ghost" href="#/roadmap">See the full path</a>
          </div>
          <div class="hero-proof">
            <div><strong>5</strong><span>Levels</span></div>
            <div><strong>${RHEL.lessonOrder.length}</strong><span>Core lessons</span></div>
            <div><strong>${RHEL.lessonOrder.length}</strong><span>Guided labs</span></div>
            <div><strong>${commandCount}</strong><span>Commands</span></div>
            <div class="next"><a href="#/commands">Command index ${icon('arrow', 13)}</a></div>
          </div>
        </div>

        <div class="hero-stage">
          <div class="hero-note">${icon('terminal', 12)} simulated sandbox included</div>
          <div class="terminal-window">
            <div class="terminal-head">
              <div class="terminal-dots" aria-hidden="true"><span></span><span></span><span></span></div>
              <div class="terminal-title">student@rhel-lab — ~</div>
              <span class="terminal-badge">field session</span>
            </div>
            <div class="terminal-body" aria-label="Example terminal session">
              <div class="line"><span class="prompt">[student@rhel-lab ~]$</span><span class="cmd">whoami</span></div>
              <div class="line"><span class="out">student</span></div>
              <div class="line"><span class="prompt">[student@rhel-lab ~]$</span><span class="cmd">cat /etc/redhat-release</span></div>
              <div class="line"><span class="out accent">Red Hat Enterprise Linux release 9.5 (Plow)</span></div>
              <div class="line"><span class="prompt">[student@rhel-lab ~]$</span><span class="cmd">systemctl is-active sshd</span></div>
              <div class="line"><span class="out green">active</span></div>
              <div class="line"><span class="prompt">[student@rhel-lab ~]$</span><span class="cmd">df -h /</span></div>
              <div class="line"><span class="out">Filesystem      Size  Used Avail Use% Mounted on</span></div>
              <div class="line"><span class="out">/dev/mapper/rhel-root 20G 7.4G 13G 38% /</span></div>
              <div class="line"><span class="prompt">[student@rhel-lab ~]$</span><span class="cmd">sudo systemctl --failed</span></div>
              <div class="line"><span class="out">0 loaded units listed.</span></div>
              <div class="line"><span class="prompt">[student@rhel-lab ~]$</span><span class="cmd"><span class="terminal-caret" aria-hidden="true"></span></span></div>
            </div>
            <div class="terminal-foot"><span>stateful practice shell</span><span>● connected</span></div>
          </div>
          <div class="hero-progress-card">
            <div class="progress-ring" data-progress-ring style="--p:${pct}"><span>${pct}%</span></div>
            <div>
              <span class="label">Your fieldbook</span>
              <strong>${state.completedLessons.length} of ${RHEL.lessonOrder.length} lessons complete</strong>
              <small>${started ? 'Next: ' + esc(next.title) : 'Begin with the basics'}</small>
            </div>
          </div>
        </div>
      </section>

      <div class="topic-ticker" aria-hidden="true">
        <div class="ticker-track">
          <div class="ticker-group">
            ${['systemd', 'SELinux', 'LVM & XFS', 'firewalld', 'Podman', 'Ansible', 'Identity', 'Observability', 'Bash', 'Recovery'].map(function (t) { return '<span class="ticker-item">' + t + '</span>'; }).join('')}
          </div>
          <div class="ticker-group">
            ${['systemd', 'SELinux', 'LVM & XFS', 'firewalld', 'Podman', 'Ansible', 'Identity', 'Observability', 'Bash', 'Recovery'].map(function (t) { return '<span class="ticker-item">' + t + '</span>'; }).join('')}
          </div>
        </div>
      </div>

      <section class="section shell" id="path">
        <div class="section-head">
          <div>
            <p class="eyebrow">The complete path</p>
            <h2>Climb in the <em>right order.</em></h2>
          </div>
          <p>Five levels, one operating model. Start with the daily-driver skills, then add storage depth, containers, automation, and production design. No skipped fundamentals.</p>
        </div>
        <div class="level-rail">${levelRail}</div>
      </section>

      <section class="section section-border shell">
        <div class="section-head-row">
          <div>
            <p class="eyebrow">Level 01 · Foundations</p>
            <h2>Sixteen lessons. <em>Four modules.</em></h2>
          </div>
          <a class="text-link" href="#/learn">Open the curriculum ${icon('arrow', 14)}</a>
        </div>
        <div class="module-grid">${moduleCards}</div>
      </section>

      <section class="section practice-band shell">
        <div class="section-head">
          <div>
            <p class="eyebrow">Practice beyond the reading</p>
            <h2>Break it, recall it, <em>prove it.</em></h2>
          </div>
          <p>Three ways to turn recognition into working memory: live incidents, spaced review, and a timed final exam with a practical task.</p>
        </div>
        <div class="practice-grid">
          <a class="practice-card" href="#/scenarios">
            <span class="practice-card-icon">${icon('warn', 19)}</span>
            <span class="practice-card-kicker">Broken Systems</span>
            <h3>Five 2 a.m. pages.</h3>
            <p>Diagnose SELinux, full disks, fstab, SSH key modes, and a missing firewall port in the stateful sandbox.</p>
            <span class="practice-card-meta">${incidentsDone}/${RHEL.scenarios.length} resolved ${icon('arrow', 12)}</span>
          </a>
          <a class="practice-card" href="#/review">
            <span class="practice-card-icon">${icon('target', 19)}</span>
            <span class="practice-card-kicker">Spaced review</span>
            <h3><span data-review-due>${review.due}</span> cards due today.</h3>
            <p>Quiz questions plus command flashcards in both directions. Five Leitner boxes keep the schedule honest.</p>
            <span class="practice-card-meta">${review.total} cards · ${review.mature} mature ${icon('arrow', 12)}</span>
          </a>
          <a class="practice-card" href="#/exam">
            <span class="practice-card-icon">${icon('shield', 19)}</span>
            <span class="practice-card-kicker">Final exam</span>
            <h3>30 questions. One machine.</h3>
            <p>A module-balanced timed exam plus a practical sandbox task, a skills breakdown, and a printable certificate.</p>
            <span class="practice-card-meta">${lastExam ? 'Last score ' + lastExam.score + '%' : '35 minutes'} ${icon('arrow', 12)}</span>
          </a>
        </div>
      </section>

      <section class="section section-border shell">
        <div class="lab-feature">
          <div class="lab-feature-copy">
            <p class="eyebrow">A lesson is not a lecture</p>
            <h2>Read a little.<br><em>Do a lot.</em></h2>
            <p>Each lesson ends with a lab you can actually finish. Build a directory tree, trace a permission problem, find a SELinux denial, write a health report. Verification steps tell you when you are done — not just when you have read.</p>
            <a class="btn btn-primary" href="#/lesson/security/lab">Try a security lab ${icon('arrow', 15, 'arrow')}</a>
          </div>
          <div class="lab-preview">
            <div class="lab-paper">
              <div class="lab-paper-head"><span>Lab · 04 / Security</span><span>22 min</span></div>
              <h3>Keep SELinux enforcing</h3>
              <p>Deploy content into a web root and diagnose a context mismatch without turning off the control.</p>
              <div class="lab-step"><span class="lab-step-num">1</span><span>Confirm the mode: <code>getenforce</code></span></div>
              <div class="lab-step"><span class="lab-step-num">2</span><span>Install and start <code>httpd</code></span></div>
              <div class="lab-step is-done"><span class="lab-step-num">3</span><span>Copy a file and inspect its context</span></div>
              <div class="lab-step"><span class="lab-step-num">4</span><span>Run <code>restorecon -Rv</code></span></div>
              <div class="lab-paper-foot"><span>EVIDENCE, NOT GUESSES</span><span>3 / 5</span></div>
            </div>
          </div>
        </div>
      </section>

      <section class="section section-border shell">
        <div class="section-head">
          <div>
            <p class="eyebrow">The method</p>
            <h2>Built like a <em>field manual.</em></h2>
          </div>
          <p>Enterprise Linux rewards calm, evidence, and repeatability. The format is designed to build those habits from the first command.</p>
        </div>
        <div class="principle-grid">
          <article class="principle">
            <div class="principle-icon">${icon('target', 19)}</div>
            <h3>Objective first</h3>
            <p>Every lesson opens with what you will be able to do. The reading exists to serve the objective, not the other way around.</p>
            <span class="micro">No mystery curriculum</span>
          </article>
          <article class="principle">
            <div class="principle-icon">${icon('terminal', 19)}</div>
            <h3>Lab driven</h3>
            <p>Commands are copyable, labs have verification steps, and the sandbox lets you build muscle memory before touching a real host.</p>
            <span class="micro">Practice over screenshots</span>
          </article>
          <article class="principle">
            <div class="principle-icon">${icon('shield', 19)}</div>
            <h3>Production habits</h3>
            <p>Snapshot before changes. Read the denial. Prefer the narrow rule. Change one thing at a time. Safety is part of the syllabus.</p>
            <span class="micro">Do it right from day one</span>
          </article>
        </div>
      </section>

      <section class="section shell">
        <div class="section-head-row">
          <div>
            <p class="eyebrow">A five-week shape</p>
            <h2>One hour a day. <em>Real progress.</em></h2>
          </div>
          <a class="text-link" href="#/learn">Start the plan ${icon('arrow', 14)}</a>
        </div>
        <div class="plan-strip">
          <div class="plan-week"><div class="week">Week <strong>01</strong></div><h3>Orientation & shell</h3><p>Map the filesystem, read a prompt, move without guessing. Build the lab habit.</p></div>
          <div class="plan-week"><div class="week">Week <strong>02</strong></div><h3>Files & identity</h3><p>Copy, search, create users, set permissions. Stop using 777 forever.</p></div>
          <div class="plan-week"><div class="week">Week <strong>03</strong></div><h3>Systems</h3><p>Processes, packages, services, ports. Learn what is actually running.</p></div>
          <div class="plan-week"><div class="week">Week <strong>04</strong></div><h3>Storage & scripts</h3><p>Read mounts, diagnose full disks, write a health report that exits correctly.</p></div>
          <div class="plan-week"><div class="week">Week <strong>05</strong></div><h3>Security & triage</h3><p>Keep SELinux enforcing, harden SSH, and run a calm first-pass investigation.</p></div>
        </div>
      </section>

      <section class="section section-border shell">
        <div class="section-head">
          <div>
            <p class="eyebrow">Before you begin</p>
            <h2>Questions worth <em>answering.</em></h2>
          </div>
          <p>No paywall, no account, no pretend production environment. Just a clear path and the honest constraints.</p>
        </div>
        <div class="faq-list">
          <details class="faq-item">
            <summary>Do I need a paid RHEL subscription?</summary>
            <div class="faq-answer"><p>No. A free Red Hat Developer subscription is available for individual learning, and cloud providers offer RHEL images. You can also practice on a RHEL-compatible rebuild such as Rocky Linux or AlmaLinux. The administration model is nearly identical; vendor-specific tasks should be verified against RHEL documentation.</p></div>
          </details>
          <details class="faq-item">
            <summary>Is this official RHCSA or RHCE training?</summary>
            <div class="faq-answer"><p>No. This is an independent fieldbook, not affiliated with or endorsed by Red Hat. The path is deliberately aligned with the skills those exams test, but always check the current official exam objectives before booking an exam.</p></div>
          </details>
          <details class="faq-item">
            <summary>Can I learn without a server?</summary>
            <div class="faq-answer"><p>Yes. A local VM with 2 vCPUs, 2–4 GB RAM, and 20 GB disk is enough for Level 01. The simulated terminal in this site is useful for recall, but labs that change the system should be done in a disposable VM.</p></div>
          </details>
          <details class="faq-item">
            <summary>Where is my progress stored?</summary>
            <div class="faq-answer"><p>In your browser's <code>localStorage</code> on this device. There is no account and no server-side profile. Clearing site data or changing browsers will reset it. The site works offline after the first load.</p></div>
          </details>
          <details class="faq-item">
            <summary>Are the commands safe to run?</summary>
            <div class="faq-answer"><p>The terminal sandbox is simulated and stateful: it has a virtual filesystem, users, packages, services, mounts, and a permission engine. Changes persist in this browser and can be reset or snapshotted, so it is safe for practice. Commands shown in lessons are real RHEL commands; some change users, services, storage, or security settings. Run those only in a lab VM you can rebuild, and never paste a destructive command without reading it first.</p></div>
          </details>
          <details class="faq-item">
            <summary>What comes after Foundations?</summary>
            <div class="faq-answer"><p>Level 02 turns the basics into operational fluency: storage, identity, services, networking, and scheduled work. Levels 03–05 cover containers, SELinux depth, boot recovery, automation, high availability, and a production capstone. The full objective map is on the <a href="#/roadmap">roadmap</a>.</p></div>
          </details>
        </div>
      </section>

      <section class="section shell">
        <div class="closing-cta">
          <div>
            <p class="eyebrow">Your next command</p>
            <h2>Open a terminal.<br>Start with <em>whoami.</em></h2>
            <p>Twelve minutes from now, you will know where you are, how to read a prompt, and why the manual is the best tool on the system.</p>
          </div>
          <a class="btn btn-primary" href="#/lesson/${next.id}">${started ? 'Continue Lesson ' + nextNum : 'Begin the fieldbook'} ${icon('arrow', 16, 'arrow')}</a>
        </div>
      </section>
    </div>`;
  }

  /* ------------------------------------------------------------------------
     Curriculum
     ------------------------------------------------------------------------ */

  function viewLearn() {
    var pct = coursePercent();
    var modules = RHEL.modules.map(function (m) {
      var p = getModuleProgress(m);
      return `
        <section class="module-block">
          <header class="module-block-head">
            <div class="module-block-num">${m.number}</div>
            <div>
              <h3>${esc(m.title)}</h3>
              <p>${esc(m.blurb)}</p>
            </div>
            <div class="module-block-meta">${m.duration}<br>${p.done}/${p.total} complete</div>
          </header>
          ${m.lessons.map(function (id) {
            var lesson = RHEL.lessons[id];
            var done = isComplete(id);
            return `
              <a class="lesson-row ${done ? 'is-done' : ''}" href="#/lesson/${id}">
                <span class="lesson-row-num">${String(RHEL.getLessonNumber(id)).padStart(2, '0')}</span>
                <span class="lesson-row-main"><strong>${esc(lesson.title)}</strong><span>${esc(lesson.subtitle)}</span></span>
                <span class="lesson-row-duration">${lesson.minutes} min</span>
                <span class="lesson-row-status"><span class="status-dot"></span>${done ? 'Complete' : 'Open'}${icon('chevron', 13, 'lesson-row-arrow')}</span>
              </a>`;
          }).join('')}
        </section>`;
    }).join('');

    return `
    <div class="view">
      <section class="page-hero">
        <div class="shell page-hero-inner">
          <div>
            <p class="eyebrow">Curriculum · Volume 01</p>
            <h1>Foundations,<br><em>done properly.</em></h1>
            <p class="lede">Sixteen lessons across four modules. Start with the shell and the filesystem, then build toward identity, services, storage, scripting, and a calm triage method. Every lesson has objectives, a command deck, a lab, and a checkpoint.</p>
          </div>
          <div class="page-hero-aside">
            <div class="progress-panel">
              <div class="progress-panel-row"><span>Level 01 progress</span><strong data-progress-percent>${pct}%</strong></div>
              <div class="progress-panel-track"><span class="progress-panel-fill" data-progress-bar style="width:${pct}%"></span></div>
              <small><span data-completed-count>${state.completedLessons.length}</span> of <span data-lesson-count-total>${RHEL.lessonOrder.length}</span> lessons complete · progress saved locally</small>
            </div>
          </div>
        </div>
      </section>

      <div class="curriculum-body shell">
        <div class="curriculum-head">
          <h2>The path through Level 01</h2>
          <p>Read the objective. Do the lab. Mark the lesson complete when you can explain the work without following along.</p>
        </div>
        ${modules}
        <div class="progress-tools">
          <div class="progress-tools-copy">
            <strong>Progress tools</strong>
            <span>Back up this fieldbook as a JSON file or restore it on another device.</span>
          </div>
          <div class="progress-tools-actions">
            <a class="text-link" href="#/labs">Browse all ${RHEL.lessonOrder.length} labs ${icon('arrow', 14)}</a>
            <a class="text-link" href="#/mastery">Objective mastery ${icon('arrow', 14)}</a>
            <a class="text-link" href="#/review">Review · <span data-review-due>${reviewDueCount()}</span> due ${icon('arrow', 14)}</a>
            <button class="btn btn-sm btn-ghost" data-export-progress>${icon('download', 13)} Export progress</button>
            <button class="btn btn-sm btn-ghost" data-import-progress>${icon('upload', 13)} Import progress</button>
            <input type="file" accept="application/json,.json" data-import-file hidden>
            <button class="btn btn-sm btn-ghost" data-reset-progress>${icon('reset', 13)} Reset progress</button>
          </div>
        </div>

        <div style="margin-top:64px;">
          <div class="curriculum-head">
            <h2>Next volumes</h2>
            <p>Foundations is the on-ramp. The complete objective map continues through operator work, administration, automation, and production design.</p>
          </div>
          <div class="level-outline-grid">
            ${RHEL.levels.slice(1).map(function (level) {
              return `
                <article class="level-outline-card">
                  <div class="level-outline-card-top">
                    <span class="level-index">Level ${level.id}</span>
                    <span class="badge">${level.duration}</span>
                  </div>
                  <h3>${esc(level.title)}</h3>
                  <p>${esc(level.promise)}</p>
                  <div class="topic-tags">${level.modules.map(function (m) { return '<span class="topic-tag">' + esc(m.title) + '</span>'; }).join('')}</div>
                  <div style="margin-top:18px;"><a class="text-link" href="#/roadmap">See the objective map ${icon('arrow', 13)}</a></div>
                </article>`;
            }).join('')}
          </div>
        </div>
      </div>
    </div>`;
  }

  /* ------------------------------------------------------------------------
     Lesson
     ------------------------------------------------------------------------ */

  function lessonNavMarkup(currentId) {
    return RHEL.modules.map(function (m) {
      return `
        <div class="lesson-nav-group">
          <span>Module ${m.number} · ${esc(m.title)}</span>
          ${m.lessons.map(function (id) {
            var l = RHEL.lessons[id];
            return `<a class="lesson-nav-link ${id === currentId ? 'is-active' : ''} ${isComplete(id) ? 'is-done' : ''}" href="#/lesson/${id}">
              <span class="nav-num">${String(RHEL.getLessonNumber(id)).padStart(2, '0')}</span>
              <span>${esc(l.title)}</span>
              <span class="nav-dot" aria-label="${isComplete(id) ? 'Complete' : 'Not complete'}"></span>
            </a>`;
          }).join('')}
        </div>`;
    }).join('');
  }

  function completeButton(id) {
    var done = isComplete(id);
    return `<button class="btn ${done ? 'btn-primary' : 'btn-red'} btn-sm" data-complete-lesson="${id}">
      ${icon(done ? 'check' : 'check', 14)} ${done ? 'Completed · undo' : 'Mark lesson complete'}
    </button>`;
  }

  function viewLesson(id, section) {
    var lesson = RHEL.getLesson(id);
    if (!lesson) return viewNotFound();
    var module = RHEL.getModule(lesson.module);
    var index = RHEL.getLessonNumber(id);
    var prev = RHEL.getPrevLesson(id);
    var next = RHEL.getNextLesson(id);
    var objectives = state.objectives[id] || [];
    var labSteps = state.labSteps[id] || [];
    var labDoneCount = lesson.lab.steps.filter(function (step, i) { return labStepDone(id, step, i); }).length;
    var labPct = Math.round((labDoneCount / lesson.lab.steps.length) * 100);
    var sections = lesson.sections.map(function (s, i) {
      return { title: s.title, id: 's' + (i + 1), body: s.body };
    });

    var objectivesMarkup = lesson.objectives.map(function (o, i) {
      var checked = objectives.indexOf(i) !== -1;
      return `<label class="objective"><input type="checkbox" data-objective data-lesson="${id}" data-index="${i}" ${checked ? 'checked' : ''}><span>${esc(o)}</span></label>`;
    }).join('');

    var commandsMarkup = lesson.commands.map(function (c) {
      var raw = rawCmd(c.cmd);
      return `<div class="command-card">
        <div class="command-card-main"><code>${esc(raw)}</code><p>${esc(c.desc)}</p></div>
        <div class="command-card-actions">
          <button class="icon-action" data-copy="${escAttr(raw)}" aria-label="Copy command" title="Copy">${icon('copy', 13)}</button>
          <button class="icon-action" data-try="${escAttr(raw)}" aria-label="Try in sandbox" title="Try in sandbox">${icon('play', 13)}</button>
        </div>
      </div>`;
    }).join('');

    var labMarkup = lesson.lab.steps.map(function (step, i) {
      var manual = !!labSteps[i];
      var auto = labStepAuto(step) === true;
      var done = manual || auto;
      return `<li class="lab-item ${done ? 'is-checked' : ''}">
        <div class="lab-item-check"><input type="checkbox" data-lab-step data-lesson="${id}" data-index="${i}" aria-label="Mark lab step ${i + 1} complete" ${done ? 'checked' : ''}></div>
        <div class="lab-item-body">
          <p>${esc(step.text)}</p>
          ${step.cmd ? '<pre>' + esc(rawCmd(step.cmd)) + '</pre>' : ''}
          ${step.verify ? '<span class="verify">' + esc(step.verify) + '</span>' : ''}
          ${auto && !manual ? '<span class="verify verify-auto">Automatically detected from your sandbox</span>' : ''}
        </div>
      </li>`;
    }).join('');

    var savedQuiz = (state.quiz && state.quiz[id]) || {};
    var quizMarkup = lesson.quiz.map(function (q, qi) {
      var answered = savedQuiz[qi] !== undefined;
      var chosen = savedQuiz[qi];
      var correct = answered && chosen === q.answer;
      var order = RHEL.quizOrder(id, qi, q);
      return `<div class="quiz-question" data-quiz-question data-q="${qi}" ${answered ? 'data-answered="true"' : ''}>
        <div class="quiz-q"><span class="qnum">0${qi + 1}</span><span>${esc(q.q)}</span></div>
        <div class="quiz-options">
          ${order.map(function (oi, displayIndex) {
            var cls = 'quiz-option';
            if (answered && oi === q.answer) cls += ' is-correct';
            if (answered && oi === chosen && oi !== q.answer) cls += ' is-wrong';
            return `<button class="${cls}" data-quiz-option data-lesson="${id}" data-q="${qi}" data-option="${oi}" ${answered ? 'disabled' : ''}><span class="opt-letter">${String.fromCharCode(65 + displayIndex)}</span><span>${esc(q.options[oi])}</span></button>`;
          }).join('')}
        </div>
        <div class="quiz-feedback ${answered ? 'is-visible' : ''} ${answered && !correct ? 'is-wrong' : ''}" data-quiz-feedback>${answered ? esc((correct ? 'Correct. ' : 'Not quite. ') + q.why) : ''}</div>
      </div>`;
    }).join('');

    var toc = sections.map(function (s) {
      return `<li><a href="#${s.id}" data-toc="${s.id}">${esc(s.title)}</a></li>`;
    }).join('');

    var nextLabel = next ? next.title : 'Back to curriculum';
    var prevBlock = prev ? `<a class="pager-link" href="#/lesson/${prev.id}"><span>← Previous</span><strong>${esc(prev.title)}</strong></a>` : '<span></span>';
    var nextBlock = next ? `<a class="pager-link next" href="#/lesson/${next.id}"><span>Next →</span><strong>${esc(next.title)}</strong></a>` : '<a class="pager-link next" href="#/learn"><span>Finished</span><strong>Back to the curriculum</strong></a>';

    return `
    <div class="view lesson-page">
      <div class="reading-progress" id="reading-progress"></div>
      <div class="shell">
        <div class="lesson-layout">
          <aside class="lesson-nav" aria-label="Lesson navigation">
            <div class="lesson-nav-head"><span>Level 01</span><span>${index}/${RHEL.lessonOrder.length}</span></div>
            ${lessonNavMarkup(id)}
          </aside>

          <article class="lesson-article">
            <details class="lesson-mobile-nav">
              <summary>${icon('menu', 14)} Lesson navigation · ${index} of ${RHEL.lessonOrder.length}</summary>
              <nav class="lesson-nav" aria-label="Lesson navigation mobile">${lessonNavMarkup(id)}</nav>
            </details>

            <header class="lesson-header">
              <nav class="breadcrumb" aria-label="Breadcrumb">
                <a href="#/learn">Curriculum</a><span class="slash">/</span>
                <a href="#/learn">Module ${module.number}</a><span class="slash">/</span>
                <span>Lesson ${String(index).padStart(2, '0')}</span>
              </nav>
              <h1 class="lesson-title">${esc(lesson.title)}</h1>
              <p class="lesson-deck">${esc(lesson.subtitle)}</p>
              <div class="lesson-meta">
                <span class="meta-chip level">Level 01 · ${esc(module.title)}</span>
                <span class="meta-chip">${icon('clock', 11)} ${lesson.minutes} min</span>
                <span class="meta-chip">${esc(lesson.difficulty)}</span>
                <span class="meta-chip"><span class="meta-dot"></span> ${isComplete(id) ? 'Completed' : 'In progress'}</span>
              </div>
            </header>

            <section class="objectives-card" aria-labelledby="objectives-title">
              <h2 id="objectives-title">By the end, you can</h2>
              <p>Check these off only when you could explain or do them without the lesson open.</p>
              <div class="objective-list">${objectivesMarkup}</div>
              <div class="objectives-count"><span data-objective-count="${id}">${objectives.length}</span> of ${lesson.objectives.length} objectives checked</div>
            </section>

            <div class="prose">
              ${sections.map(function (s) {
                return `<h2 id="${s.id}">${esc(s.title)}</h2>` + s.body;
              }).join('')}
            </div>

            <section class="command-deck" aria-labelledby="deck-title">
              <div class="deck-head"><h2 id="deck-title">Command deck</h2><span>${lesson.commands.length} commands · copy or try</span></div>
              <div class="command-cards">${commandsMarkup}</div>
            </section>

            <section class="lab-block" id="lab" aria-labelledby="lab-title">
              <header class="lab-block-head">
                <div>
                  <p class="eyebrow">Lab · ${esc(module.title)}</p>
                  <h2 id="lab-title">${esc(lesson.lab.title)}</h2>
                  <p>${esc(lesson.lab.scenario)}</p>
                </div>
                <span class="lab-time">${lesson.lab.minutes} min</span>
              </header>
              <div class="lab-body">
                <ol class="lab-steps">${labMarkup}</ol>
              </div>
              <footer class="lab-foot">
                <div class="lab-progress" data-lab-progress="${id}"><span>${labDoneCount}</span> / ${lesson.lab.steps.length} steps · ${labPct}%</div>
                <button class="lab-complete ${isLabDone(id) ? 'is-done' : ''}" data-lab-done="${id}">${icon('check', 12)} ${isLabDone(id) ? 'Lab complete' : 'Mark lab complete'}</button>
              </footer>
            </section>

            <section class="quiz-block" id="quiz" aria-labelledby="quiz-title">
              <div class="quiz-head"><h2 id="quiz-title">Checkpoint</h2><span>${lesson.quiz.length} questions</span></div>
              <p class="quiz-intro">Answer from memory. Each question gives immediate feedback; there is no score to game.</p>
              ${quizMarkup}
            </section>

            <div class="lesson-complete-bar">
              <p><strong>${isComplete(id) ? 'This lesson is complete.' : 'Ready to mark it done?'}</strong>${isComplete(id) ? 'You can undo this if you want another pass.' : 'Complete the lab and checkpoint first. Honest progress beats a filled progress bar.'}</p>
              ${completeButton(id)}
            </div>

            <nav class="lesson-pager" aria-label="Lesson pagination">
              ${prevBlock}
              ${nextBlock}
            </nav>
          </article>

          <aside class="lesson-rail" aria-label="Lesson details">
            <div class="rail-block">
              <p class="rail-title">In this lesson</p>
              <ul class="toc">${toc}</ul>
            </div>
            <div class="rail-card">
              <p class="rail-title">Lesson state</p>
              <div class="rail-stat"><span>Objectives</span><strong><span data-objective-count="${id}">${objectives.length}</span>/${lesson.objectives.length}</strong></div>
              <div class="rail-progress"><span style="width:${Math.round((objectives.length / lesson.objectives.length) * 100)}%"></span></div>
              <div class="rail-stat" data-lab-rail="${id}"><span>Lab steps</span><strong>${labDoneCount}/${lesson.lab.steps.length}</strong></div>
              <div class="rail-progress"><span style="width:${labPct}%"></span></div>
              <div class="rail-stat"><span>Status</span><strong>${isComplete(id) ? 'Complete' : 'In progress'}</strong></div>
            </div>
            <div class="rail-block">
              <p class="rail-note">Commands here are real. Practice them in a disposable RHEL VM. The in-browser sandbox is simulated and stateful; reset it from the terminal panel when you want a clean machine.</p>
            </div>
          </aside>
        </div>
      </div>
    </div>`;
  }

  /* ------------------------------------------------------------------------
     Labs
     ------------------------------------------------------------------------ */

  function viewLabs() {
    var labs = RHEL.lessonOrder.map(function (id) {
      var l = RHEL.lessons[id];
      var m = RHEL.getModule(l.module);
      return { lesson: l, module: m, done: isLabDone(id) };
    });
    var doneCount = labs.filter(function (l) { return l.done; }).length;

    return `
    <div class="view">
      <section class="page-hero">
        <div class="shell page-hero-inner">
          <div>
            <p class="eyebrow">Hands-on · Level 01</p>
            <h1>Labs that <em>prove it.</em></h1>
            <p class="lede">Reading creates recognition. Labs create recall. Every lab has a scenario, explicit steps, and a verification checkpoint. Use a disposable VM and take a snapshot first.</p>
          </div>
          <div class="page-hero-aside">
            <div class="progress-panel">
              <div class="progress-panel-row"><span>Labs completed</span><strong><span data-labs-count>${doneCount}</span> / ${labs.length}</strong></div>
              <div class="progress-panel-track"><span class="progress-panel-fill" style="width:${Math.round((doneCount / labs.length) * 100)}%"></span></div>
              <small>Step checklists are saved locally. Mark a lab complete when every step verifies.</small>
            </div>
          </div>
        </div>
      </section>

      <div class="labs-page shell">
        <div class="filter-bar">
          <span class="filter-label">Filter</span>
          <button class="filter-chip is-active" data-lab-filter="all">All labs</button>
          ${RHEL.modules.map(function (m) { return `<button class="filter-chip" data-lab-filter="${m.id}">${m.number} · ${esc(m.title)}</button>`; }).join('')}
        </div>
        <div class="lab-grid" id="lab-grid">
          ${labs.map(function (item) {
            var l = item.lesson;
            return `<article class="lab-card ${item.done ? 'is-done' : ''}" data-lab-card data-module="${l.module}">
              <div class="lab-card-top">
                <span class="lab-card-module">Module ${item.module.number} · ${esc(item.module.title)}</span>
                ${item.done ? '<span class="badge badge-green">Complete</span>' : '<span class="badge">Lab</span>'}
              </div>
              <h3>${esc(l.lab.title)}</h3>
              <p>${esc(l.lab.scenario)}</p>
              <div class="lab-card-meta"><span>${icon('clock', 11)} ${l.lab.minutes} min</span><span>${icon('terminal', 11)} ${l.lab.steps.length} steps</span><span>Lesson ${String(RHEL.getLessonNumber(l.id)).padStart(2, '0')}</span></div>
              <a class="lab-card-link" href="#/lesson/${l.id}/lab"><span>Open the lab</span>${icon('arrow', 14)}</a>
            </article>`;
          }).join('')}
          <div class="empty-state" id="labs-empty" hidden>No labs in this module yet.</div>
        </div>
      </div>
    </div>`;
  }

  /* ------------------------------------------------------------------------
     Command index
     ------------------------------------------------------------------------ */

  function viewCommands() {
    var commands = getCommands();
    var categories = [];
    commands.forEach(function (c) { if (categories.indexOf(c.category) === -1) categories.push(c.category); });
    categories.sort();

    function actionButtons(c) {
      return `<div class="command-actions">
        <button class="icon-action" data-copy="${escAttr(c.cmd)}" aria-label="Copy ${escAttr(c.cmd)}" title="Copy">${icon('copy', 12)}</button>
        <button class="icon-action" data-try="${escAttr(c.cmd)}" aria-label="Try ${escAttr(c.cmd)} in sandbox" title="Try in sandbox">${icon('play', 12)}</button>
      </div>`;
    }

    var rows = commands.map(function (c) {
      var haystack = [c.cmd, c.desc, c.category, c.lessonTitle].join(' ').toLowerCase();
      return `<tr data-command-row data-cat="${escAttr(c.category)}" data-search="${escAttr(haystack)}">
        <td><code>${esc(c.cmd)}</code></td>
        <td class="cmd-desc">${esc(c.desc)}</td>
        <td class="cmd-cat">${esc(c.category)}</td>
        <td><a class="cmd-lesson" href="#/lesson/${c.lesson}">${esc(c.lessonTitle)}</a></td>
        <td>${actionButtons(c)}</td>
      </tr>`;
    }).join('');

    var mobile = commands.map(function (c) {
      var haystack = [c.cmd, c.desc, c.category, c.lessonTitle].join(' ').toLowerCase();
      return `<article class="command-mobile-card" data-command-row data-cat="${escAttr(c.category)}" data-search="${escAttr(haystack)}">
        <code>${esc(c.cmd)}</code>
        <p>${esc(c.desc)}</p>
        <div class="command-mobile-foot"><a href="#/lesson/${c.lesson}">${esc(c.lessonTitle)}</a>${actionButtons(c)}</div>
      </article>`;
    }).join('');

    return `
    <div class="view">
      <section class="page-hero">
        <div class="shell page-hero-inner">
          <div>
            <p class="eyebrow">Reference · built from the lessons</p>
            <h1>The command <em>index.</em></h1>
            <p class="lede">Every command in Level 01, deduplicated and linked back to the lesson that explains it. Copy it, try it in the sandbox, then run it in your lab.</p>
          </div>
          <div class="page-hero-aside">
            <div class="progress-panel">
              <div class="progress-panel-row"><span>Commands indexed</span><strong>${commands.length}</strong></div>
              <div class="progress-panel-track"><span class="progress-panel-fill" style="width:100%"></span></div>
              <small>${categories.length} categories · RHEL 9 &amp; 10 oriented</small>
            </div>
          </div>
        </div>
      </section>

      <div class="commands-page shell">
        <div class="command-toolbar">
          <div class="command-search">
            ${icon('search', 17)}
            <input type="search" id="command-search" placeholder="Search commands, descriptions, or lessons…" autocomplete="off" aria-label="Search commands">
          </div>
          <div class="command-count"><strong id="command-count">${commands.length}</strong> commands shown</div>
        </div>
        <div class="command-categories" id="command-categories">
          <button class="filter-chip is-active" data-command-category="all">All</button>
          ${categories.map(function (c) { return `<button class="filter-chip" data-command-category="${escAttr(c)}">${esc(c)}</button>`; }).join('')}
        </div>
        <div class="command-table-wrap">
          <table class="command-table">
            <thead><tr><th>Command</th><th>What it does</th><th>Category</th><th>Lesson</th><th></th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
        <div class="command-mobile-list">${mobile}</div>
        <div class="command-empty" id="command-empty" hidden>No commands match that filter. Try a broader term.</div>
      </div>
    </div>`;
  }

  /* ------------------------------------------------------------------------
     Roadmap
     ------------------------------------------------------------------------ */

  function viewRoadmap() {
    var levels = RHEL.levels.map(function (level) {
      var live = level.status === 'live';
      var modules = level.modules.map(function (m) {
        var desc = live ? (m.lessons.length + ' lessons · ' + m.duration) : (m.desc || '');
        return `<div class="roadmap-module"><strong>${esc(m.title)}</strong><span>${esc(desc)}</span></div>`;
      }).join('');
      return `
        <section class="roadmap-level ${live ? 'is-live' : ''}">
          <div class="roadmap-marker"><span class="num">${level.id}</span><span class="state">${live ? 'Live' : 'Mapped'}</span></div>
          <div class="roadmap-card">
            <div class="roadmap-card-head">
              <div><p class="eyebrow" style="margin-bottom:10px;">${esc(level.kicker)}</p><h2>${esc(level.title)}</h2></div>
              <span class="badge ${live ? 'badge-red' : ''}">${live ? 'Available now' : 'Next volume'}</span>
            </div>
            <p class="promise">${esc(level.promise)}</p>
            <div class="outcome-chips">${level.outcomes.map(function (o) { return '<span class="outcome-chip">' + esc(o) + '</span>'; }).join('')}</div>
            <div class="roadmap-modules">${modules}</div>
            ${live ? '<div class="roadmap-cta"><a class="btn btn-primary btn-sm" href="#/learn">Open Level 01 ' + icon('arrow', 13) + '</a></div>' : ''}
          </div>
        </section>`;
    }).join('');

    return `
    <div class="view">
      <section class="page-hero">
        <div class="shell page-hero-inner">
          <div>
            <p class="eyebrow">The full path · zero to production</p>
            <h1>One map.<br><em>Five levels.</em></h1>
            <p class="lede">The complete objective map for enterprise Linux: foundations, operations, administration, automation, and production design. Level 01 is live now; later volumes are mapped so you can see where each skill is going.</p>
          </div>
          <div class="page-hero-aside">
            <div class="progress-panel">
              <div class="progress-panel-row"><span>Current volume</span><strong>01</strong></div>
              <div class="progress-panel-track"><span class="progress-panel-fill" style="width:${coursePercent()}%"></span></div>
              <small>${state.completedLessons.length} of ${RHEL.lessonOrder.length} Foundations lessons complete</small>
            </div>
          </div>
        </div>
      </section>

      <div class="shell roadmap">
        <div class="roadmap-intro">
          <div>
            <p class="eyebrow">Why this order</p>
            <h2>Fluency before <em>complexity.</em></h2>
            <p>Every later skill depends on the layer below it. Automation is fragile without permissions literacy. High availability is dangerous without storage fluency. The sequence is deliberate: each level assumes the habits of the previous one.</p>
          </div>
          <div class="roadmap-note"><strong>Not an official certification guide.</strong> The path is aligned with the skills RHCSA, RHCE, and RHCA tracks test, but objectives change. Verify the current official exam objectives before you book.</div>
        </div>

        ${levels}

        <section class="cert-map">
          <div class="section-head">
            <div><p class="eyebrow">Certification context</p><h2>Where the path <em>maps.</em></h2></div>
            <p>Certifications are checkpoints, not the destination. Use them to structure study; use the lab habits to keep the job.</p>
          </div>
          <div class="cert-grid">
            ${RHEL.certifications.map(function (c) {
              return `<article class="cert-card">
                <span class="cert-code">${esc(c.code)}</span>
                <h3>${esc(c.name)}</h3>
                <p>${esc(c.range)} · ${esc(c.desc)}</p>
                <ul>${c.topics.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('')}</ul>
              </article>`;
            }).join('')}
          </div>
        </section>
      </div>
    </div>`;
  }

  /* ------------------------------------------------------------------------
     Broken Systems scenarios
     ------------------------------------------------------------------------ */

  function viewScenarios(id) {
    if (id) {
      var scenario = RHEL.scenarios.find(id);
      if (!scenario) return viewNotFound();
      return viewScenarioDetail(scenario);
    }

    var completed = RHEL.scenarios.filter(function (scenario) { return !!scenarioRun(scenario.id); }).length;
    var scores = RHEL.scenarios.map(function (scenario) {
      var run = scenarioRun(scenario.id);
      return run ? run.bestScore : null;
    }).filter(function (score) { return score !== null; });
    var average = scores.length ? Math.round(scores.reduce(function (sum, score) { return sum + score; }, 0) / scores.length) : 0;

    var cards = RHEL.scenarios.map(function (scenario, index) {
      var run = scenarioRun(scenario.id);
      var lesson = RHEL.getLesson(scenario.lesson);
      return `<article class="scenario-card ${run ? 'is-done' : ''}">
        <div class="scenario-card-top">
          <span class="scenario-num">CASE ${String(index + 1).padStart(2, '0')}</span>
          <span class="badge ${run ? 'badge-green' : ''}">${run ? 'Resolved · ' + run.bestScore + '/100' : 'Open incident'}</span>
        </div>
        <h3>${esc(scenario.title)}</h3>
        <p>${esc(scenario.subtitle)}</p>
        <div class="scenario-card-meta">
          <span>${icon('clock', 11)} target ${Math.round(scenario.timeTarget / 60)} min</span>
          <span>${icon('layers', 11)} 3 hints</span>
          <span>${icon('book', 11)} ${esc(lesson ? lesson.title : scenario.lesson)}</span>
        </div>
        ${run ? `<div class="scenario-best"><span>Best ${run.bestScore}</span><span>${formatClock(run.bestSeconds)}</span><span>${run.attempts} attempt${run.attempts === 1 ? '' : 's'}</span></div>` : ''}
        <div class="scenario-card-actions">
          <a class="btn btn-sm ${run ? 'btn-ghost' : 'btn-primary'}" href="#/scenarios/${scenario.id}">${run ? 'Run again' : 'Open incident'} ${icon('arrow', 13)}</a>
          <a class="text-link" href="#/lesson/${scenario.lesson}">Related lesson</a>
        </div>
      </article>`;
    }).join('');

    return `
    <div class="view">
      <section class="page-hero">
        <div class="shell page-hero-inner">
          <div>
            <p class="eyebrow">Broken Systems · five incidents</p>
            <h1>It is 2 a.m.<br><em>What do you check?</em></h1>
            <p class="lede">Five small, realistic failures in the stateful sandbox. Each one has a story, a live goal check, a three-level hint ladder, and a time target. You are not reading an answer key. You are working the incident.</p>
            <div class="hero-actions" style="margin-top:26px;"><a class="btn btn-primary" href="#/scenarios/selinux-httpd">Take the first call ${icon('arrow', 15, 'arrow')}</a><a class="btn btn-ghost" href="#/learn">Review the lessons</a></div>
          </div>
          <div class="page-hero-aside">
            <div class="progress-panel">
              <div class="progress-panel-row"><span>Incidents resolved</span><strong>${completed} / ${RHEL.scenarios.length}</strong></div>
              <div class="progress-panel-track"><span class="progress-panel-fill" style="width:${Math.round(completed / RHEL.scenarios.length * 100)}%"></span></div>
              <small>${scores.length ? 'Average best score ' + average + '/100. Hints cost 15 points each.' : 'Start anywhere. The sandbox remembers the story state.'}</small>
            </div>
          </div>
        </div>
      </section>
      <div class="scenario-page shell">
        <div class="curriculum-head">
          <h2>Pick up the pager</h2>
          <p>Every scenario resets the sandbox to its own broken state. Use the terminal, check the goal, then restore the next incident.</p>
        </div>
        <div class="scenario-grid">${cards}</div>
        <div class="scenario-legend">
          <span class="timeline-dot"></span><strong>Scoring:</strong> start at 100. Hints cost 15 each; time over the target costs up to 45. Your best result is kept.
        </div>
      </div>
    </div>`;
  }

  function viewScenarioDetail(scenario) {
    var run = scenarioRun(scenario.id);
    var isActive = !!(state.scenarioActive && state.scenarioActive.id === scenario.id);
    var hints = isActive ? state.scenarioActive.hints : 0;
    var goal = isActive && scenarioGoalMet(scenario);
    var elapsed = isActive ? scenarioElapsed() : 0;
    var lesson = RHEL.getLesson(scenario.lesson);
    var other = state.scenarioActive && !isActive ? RHEL.scenarios.find(state.scenarioActive.id) : null;

    var hintBlocks = scenario.hints.map(function (hint, index) {
      var revealed = index < hints;
      var next = index === hints;
      return `<div class="scenario-hint ${revealed ? 'is-revealed' : ''}">
        <div class="scenario-hint-head">
          <span>${index === 0 ? 'Nudge' : index === 1 ? 'Bigger hint' : 'Answer'}</span>
          ${revealed ? '<span class="badge badge-green">Revealed</span>' : next && isActive ? `<button class="btn btn-sm btn-ghost" data-scenario-hint="${index}">Reveal · −15 pts</button>` : '<span class="scenario-locked">Locked</span>'}
        </div>
        ${revealed ? `<div class="scenario-hint-body">${hint}</div>` : '<p class="scenario-hint-veiled">Reveal the previous level first.</p>'}
      </div>`;
    }).join('');

    return `
    <div class="view">
      <section class="page-hero scenario-hero">
        <div class="shell page-hero-inner">
          <div>
            <div class="breadcrumb"><a href="#/scenarios">Broken Systems</a><span class="slash">/</span><span>${esc(scenario.title)}</span></div>
            <p class="eyebrow">Incident · time target ${Math.round(scenario.timeTarget / 60)} min</p>
            <h1>${esc(scenario.title)}</h1>
            <p class="lede">${esc(scenario.story)}</p>
            <div class="hero-actions" style="margin-top:26px;">
              <button class="btn btn-primary" data-scenario-start="${scenario.id}">${isActive ? 'Restart incident' : run ? 'Run this incident again' : 'Start incident'} ${icon('play', 14)}</button>
              <button class="btn btn-ghost" data-open-sandbox>Open terminal ${icon('terminal', 15)}</button>
              <a class="btn btn-ghost" href="#/lesson/${scenario.lesson}">Lesson: ${esc(lesson ? lesson.title : scenario.lesson)}</a>
            </div>
            ${other ? `<p class="scenario-other">Another incident is active: <a href="#/scenarios/${other.id}">${esc(other.title)}</a>. Starting this one resets the sandbox.</p>` : ''}
          </div>
          <div class="page-hero-aside">
            <div class="progress-panel scenario-timer-panel">
              <div class="progress-panel-row"><span>Incident clock</span><strong data-scenario-clock>${formatClock(elapsed)}</strong></div>
              <div class="scenario-target-row"><span>Target ${formatClock(scenario.timeTarget)}</span><span>${hints} hint${hints === 1 ? '' : 's'} used</span></div>
              <div class="scenario-goal-live ${goal ? 'is-met' : ''}" data-scenario-goal aria-live="polite">
                <span class="status-dot"></span>
                <strong>${goal ? 'Goal met' : isActive ? 'Goal not met yet' : 'Not started'}</strong>
                <small>${goal ? 'The live check passes. Resolving the incident…' : 'The check runs against the sandbox state.'}</small>
              </div>
              ${run ? `<small class="scenario-best-note">Best score ${run.bestScore}/100 · best time ${formatClock(run.bestSeconds)} · ${run.attempts} attempt${run.attempts === 1 ? '' : 's'}</small>` : ''}
            </div>
          </div>
        </div>
      </section>

      <div class="scenario-workspace shell">
        <div class="scenario-main">
          <article class="scenario-brief">
            <p class="eyebrow">The pager</p>
            <h2>Read the evidence.<br><em>Change one thing.</em></h2>
            <p>${esc(scenario.story)}</p>
            <div class="scenario-brief-note"><strong>Goal:</strong> diagnose the failure in the terminal sandbox and satisfy the live check without revealing the answer. The sandbox is disposable; reset or snapshot from the terminal panel at any time.</div>
          </article>
          <section class="scenario-hints">
            <div class="section-head-row"><div><p class="eyebrow">Hint ladder</p><h2>Nudge, then clue, <em>then answer.</em></h2></div><span class="badge">${hints}/3 revealed</span></div>
            ${hintBlocks}
          </section>
          <section class="scenario-goal-card ${goal ? 'is-met' : ''}">
            <div>
              <p class="eyebrow">Goal check</p>
              <h2>Prove the system is healthy.</h2>
              <p>${goal ? 'The goal check is passing. This incident will be scored automatically.' : isActive ? 'Not yet. Inspect the state, make the fix, then let the automatic check run.' : 'Start the incident to load its broken sandbox state and enable the goal check.'}</p>
            </div>
            <div class="scenario-goal-actions">
              <button class="btn btn-sm btn-ghost" data-scenario-check="${scenario.id}" ${isActive ? '' : 'disabled'}>Check goal now</button>
              <span class="scenario-goal-status ${goal ? 'is-met' : ''}" data-scenario-goal-text>${goal ? 'PASS' : isActive ? 'WAITING' : 'IDLE'}</span>
            </div>
          </section>
        </div>
        <aside class="scenario-side">
          <div class="scenario-side-card">
            <p class="eyebrow">Runbook discipline</p>
            <ol>
              <li>Confirm the symptom with a command, not a guess.</li>
              <li>Find the layer: filesystem, context, identity, service, or network.</li>
              <li>Change one thing and re-check the live goal.</li>
              <li>Write down the evidence before you close the incident.</li>
            </ol>
          </div>
          <div class="scenario-side-card">
            <p class="eyebrow">Scoring</p>
            <div class="scenario-score-row"><span>Base</span><strong>100</strong></div>
            <div class="scenario-score-row"><span>Each hint</span><strong>−15</strong></div>
            <div class="scenario-score-row"><span>Time over target</span><strong>up to −45</strong></div>
            <p class="scenario-side-note">The result is saved to your progress and included in the export.</p>
          </div>
          <div class="scenario-side-card">
            <p class="eyebrow">Related lesson</p>
            <a class="scenario-lesson-link" href="#/lesson/${scenario.lesson}"><strong>${esc(lesson ? lesson.title : scenario.lesson)}</strong><span>${esc(lesson ? lesson.subtitle : '')}</span>${icon('arrow', 14)}</a>
          </div>
        </aside>
      </div>
    </div>`;
  }

  /* ------------------------------------------------------------------------
     Spaced review
     ------------------------------------------------------------------------ */

  function viewReview(section) {
    if (section === 'session') return viewReviewSession();
    var stats = reviewStats();
    var active = state.review.active;
    var last = state.review.lastSession;
    var commandMature = getReviewCards().filter(function (card) {
      return card.kind === 'command' && state.review.items[card.id] && state.review.items[card.id].box >= 4;
    }).length;

    return `
    <div class="view">
      <section class="page-hero">
        <div class="shell page-hero-inner">
          <div>
            <p class="eyebrow">Review · spaced repetition</p>
            <h1>Remember it<br><em>tomorrow.</em></h1>
            <p class="lede">Checkpoint questions return at widening intervals. Every command in the index becomes a two-way flashcard: command to meaning, and meaning to command. Five boxes, no streak guilt, no account.</p>
            <div class="hero-actions" style="margin-top:26px;">
              <button class="btn btn-primary" data-start-review="all">Start due review ${icon('play', 14)}</button>
              <a class="btn btn-ghost" href="#/mastery">Objective mastery ${icon('target', 15)}</a>
            </div>
          </div>
          <div class="page-hero-aside">
            <div class="progress-panel">
              <div class="progress-panel-row"><span>Due today</span><strong data-review-due>${stats.due}</strong></div>
              <div class="progress-panel-track"><span class="progress-panel-fill" style="width:${stats.total ? Math.round(stats.due / stats.total * 100) : 0}%"></span></div>
              <small>${stats.fresh} new · ${stats.learning} learning · ${stats.mature} mature</small>
            </div>
          </div>
        </div>
      </section>

      <div class="review-page shell">
        ${active ? `<div class="review-resume">
          <div><p class="eyebrow">Session in progress</p><strong>${active.queue.length - active.index} cards left · ${active.correct} correct · ${active.again} again</strong></div>
          <a class="btn btn-sm btn-primary" href="#/review/session">Resume session ${icon('arrow', 13)}</a>
        </div>` : ''}
        ${last ? `<div class="review-last"><span>Last session: ${last.reviewed} cards reviewed · ${last.correct} correct · ${last.again} again</span><span>${new Date(last.completedAt).toLocaleDateString()}</span></div>` : ''}

        <div class="review-stat-grid">
          <article class="review-stat"><span>Total cards</span><strong>${stats.total}</strong><small>${stats.quizDue} quiz cards due · ${stats.commandDue} command cards due</small></article>
          <article class="review-stat"><span>Due today</span><strong data-review-due>${stats.due}</strong><small>New cards count as due</small></article>
          <article class="review-stat"><span>Mature</span><strong>${stats.mature}</strong><small>${commandMature} command directions in box 4+</small></article>
          <article class="review-stat"><span>Mastery map</span><strong>80</strong><small>Objectives with quiz and lab evidence</small></article>
        </div>

        <div class="review-options">
          <article class="review-option">
            <span class="review-option-icon">${icon('target', 20)}</span>
            <h2>Due review</h2>
            <p>Mix checkpoint questions and both flashcard directions. The queue is capped at 20 cards per session.</p>
            <button class="btn btn-primary btn-sm" data-start-review="all">Review everything ${icon('arrow', 13)}</button>
          </article>
          <article class="review-option">
            <span class="review-option-icon">${icon('book', 20)}</span>
            <h2>Quiz only</h2>
            <p>${stats.quizDue} checkpoint questions are due today. Good for a short recall pass before the exam.</p>
            <button class="btn btn-ghost btn-sm" data-start-review="quiz">Review quiz cards</button>
          </article>
          <article class="review-option">
            <span class="review-option-icon">${icon('terminal', 20)}</span>
            <h2>Commands both ways</h2>
            <p>${stats.commandDue} command directions due. See a command and recall what it does — then reverse it.</p>
            <button class="btn btn-ghost btn-sm" data-start-review="commands">Review commands</button>
          </article>
        </div>

        <section class="review-explainer">
          <div><p class="eyebrow">How the boxes work</p><h2>Short intervals.<br><em>Long memory.</em></h2></div>
          <div class="review-boxes">
            ${['Again → 10 min', 'Box 2 → 1 day', 'Box 3 → 3 days', 'Box 4 → 7 days', 'Box 5 → 21 days'].map(function (text, index) { return `<span class="review-box ${index === 0 ? 'is-start' : ''}"><strong>${index + 1}</strong>${text}</span>`; }).join('')}
          </div>
          <p class="review-source">Quiz cards come from the 48 checkpoint questions. Command cards come from the deduplicated command index, generated in both directions. Everything is stored locally and included in the progress export.</p>
        </section>
      </div>
    </div>`;
  }

  function viewReviewSession() {
    var active = state.review.active;
    if (!active) {
      var last = state.review.lastSession;
      return `
      <div class="view">
        <section class="page-hero">
          <div class="shell page-hero-inner"><div>
            <div class="breadcrumb"><a href="#/review">Review</a><span class="slash">/</span><span>Session</span></div>
            <p class="eyebrow">Review session</p>
            <h1>${last ? 'Session <em>complete.</em>' : 'No session <em>running.</em>'}</h1>
            <p class="lede">${last ? 'You reviewed ' + last.reviewed + ' cards, marked ' + last.correct + ' correct, and sent ' + last.again + ' back to box 1. The schedule has already updated.' : 'Start a session from the review dashboard. Due cards are waiting.'}</p>
            <div class="hero-actions" style="margin-top:26px;"><a class="btn btn-primary" href="#/review">Back to review ${icon('arrow', 14)}</a><button class="btn btn-ghost" data-start-review="all">Start another session</button></div>
          </div></div>
        </section>
      </div>`;
    }

    if (active.index >= active.queue.length) {
      return viewReviewSessionSummary(active);
    }

    var card = reviewCardById(active.queue[active.index]);
    if (!card) return viewReview('');
    var answerMarkup = card.kind === 'command' && card.direction === 'reverse'
      ? '<code>' + esc(card.answer) + '</code>'
      : esc(card.answer);
    var promptMarkup = card.kind === 'command' && card.direction === 'forward'
      ? '<code>' + esc(card.prompt) + '</code>'
      : esc(card.prompt);
    var pct = Math.round((active.index / active.queue.length) * 100);
    var filterLabel = active.filter === 'quiz' ? 'Quiz only' : active.filter === 'commands' ? 'Commands only' : 'Mixed review';

    return `
    <div class="view">
      <div class="review-session shell">
        <h1 class="sr-only">Review session</h1>
        <div class="review-session-top">
          <div class="breadcrumb"><a href="#/review">Review</a><span class="slash">/</span><span>${esc(filterLabel)}</span></div>
          <div class="review-session-progress"><span>${active.index + 1} / ${active.queue.length}</span><span>${active.correct} correct</span><span>${active.again} again</span></div>
          <div class="progress-panel-track"><span class="progress-panel-fill" style="width:${pct}%"></span></div>
        </div>

        <article class="review-card" id="review-card-focus" tabindex="-1" aria-labelledby="review-prompt-label">
          <div class="review-card-meta">
            <span class="badge">${esc(card.label)}</span>
            <span>${esc(card.lessonTitle)}</span>
            <span>${esc(card.kind === 'quiz' ? 'Checkpoint' : card.category || 'Command index')}</span>
          </div>
          <p class="eyebrow" id="review-prompt-label">${card.kind === 'quiz' ? 'Question' : card.direction === 'forward' ? 'What does this command do?' : 'Which command does this?'}</p>
          <div class="review-prompt">${promptMarkup}</div>
          <div class="review-answer ${reviewRevealed ? 'is-visible' : ''}" aria-live="polite">
            ${reviewRevealed ? `<span class="review-answer-label">Answer</span><div class="review-answer-main">${answerMarkup}</div><p>${esc(card.detail || '')}</p>` : '<span>Answer hidden. Recall it before revealing.</span>'}
          </div>
          <div class="review-card-actions">
            ${reviewRevealed
              ? `<button class="btn btn-ghost" data-review-grade="again">Again <kbd>1</kbd></button><button class="btn btn-primary" data-review-grade="good">Got it <kbd>2</kbd></button>`
              : `<button class="btn btn-primary" data-review-reveal>Reveal answer <kbd>space</kbd></button>`}
          </div>
          <div class="review-keyboard-hint">Keyboard: <kbd>space</kbd> reveal · <kbd>1</kbd> again · <kbd>2</kbd> got it</div>
        </article>

        <div class="review-session-foot">
          <a class="text-link" href="#/review">Pause and return later ${icon('arrow', 13)}</a>
          <span>${active.queue.length - active.index - 1} cards after this one</span>
        </div>
      </div>
    </div>`;
  }

  function viewReviewSessionSummary(active) {
    return `
    <div class="view">
      <section class="page-hero">
        <div class="shell page-hero-inner"><div>
          <p class="eyebrow">Review session · complete</p>
          <h1>${active.correct} correct.<br><em>${active.again} back in the queue.</em></h1>
          <p class="lede">The cards you marked "again" return in ten minutes. Cards you knew move outward through the boxes. Small, regular passes beat one heroic reread.</p>
          <div class="hero-actions" style="margin-top:26px;"><a class="btn btn-primary" href="#/review">Back to review ${icon('arrow', 14)}</a><button class="btn btn-ghost" data-start-review="all">Review more due cards</button></div>
        </div></div>
      </section>
    </div>`;
  }

  /* ------------------------------------------------------------------------
     Objective mastery
     ------------------------------------------------------------------------ */

  function viewMastery() {
    var counts = { mastered: 0, practicing: 0, started: 0, notstarted: 0 };
    var moduleMarkup = RHEL.modules.map(function (module) {
      var lessons = module.lessons.map(function (lessonId) {
        var lesson = RHEL.lessons[lessonId];
        var rows = lesson.objectives.map(function (objective, index) {
          var evidence = objectiveScore(lesson, index);
          var statusKey = evidence.status.toLowerCase().replace(/\s+/g, '');
          counts[statusKey] = (counts[statusKey] || 0) + 1;
          var quizClass = evidence.quizCorrect ? 'is-good' : evidence.answer === undefined ? '' : 'is-bad';
          var quizText = evidence.quizCorrect ? 'correct' : evidence.answer === undefined ? 'not answered' : 'needs review';
          return `<div class="mastery-row">
            <span class="mastery-status is-${statusKey}" aria-label="${evidence.status}"></span>
            <div class="mastery-objective"><strong>${esc(objective)}</strong><span>Objective ${String(index + 1).padStart(2, '0')}</span></div>
            <div class="mastery-evidence">
              <span class="evidence-chip ${quizClass}">Checkpoint ${evidence.questionIndex + 1} · ${quizText}</span>
              <span class="evidence-chip ${evidence.labDone ? 'is-good' : ''}">Lab step ${evidence.stepIndex + 1} · ${evidence.labDone ? 'done' : 'open'}</span>
              <span class="evidence-chip ${evidence.manual ? 'is-good' : ''}">Objective check · ${evidence.manual ? 'checked' : 'open'}</span>
            </div>
            <span class="mastery-score">${evidence.score}<small>%</small></span>
          </div>`;
        }).join('');
        return `<details class="mastery-lesson" open>
          <summary><span><strong>${esc(lesson.title)}</strong><small>${lesson.objectives.length} objectives · ${esc(module.title)}</small></span><a href="#/lesson/${lesson.id}" class="text-link" onclick="event.stopPropagation()">Open lesson ${icon('arrow', 12)}</a></summary>
          <div class="mastery-rows">${rows}</div>
        </details>`;
      }).join('');
      return `<section class="mastery-module">
        <div class="mastery-module-head"><span class="module-num">Module ${module.number}</span><h2>${esc(module.title)}</h2><p>${esc(module.blurb)}</p></div>
        ${lessons}
      </section>`;
    }).join('');
    var total = RHEL.lessonOrder.reduce(function (sum, id) { return sum + RHEL.lessons[id].objectives.length; }, 0);
    var mastered = counts.mastered || 0;
    var pct = total ? Math.round(mastered / total * 100) : 0;

    return `
    <div class="view">
      <section class="page-hero">
        <div class="shell page-hero-inner">
          <div>
            <p class="eyebrow">Mastery · 80 objectives · quiz + lab evidence</p>
            <h1>Every objective.<br><em>Every piece of evidence.</em></h1>
            <p class="lede">Level 01 has 80 checkable objectives. This map joins three signals for each one: a checkpoint question, a lab step, and your own objective check. It is a study instrument, not a certification decision.</p>
          </div>
          <div class="page-hero-aside">
            <div class="progress-panel">
              <div class="progress-panel-row"><span>Objectives mastered</span><strong>${mastered} / ${total}</strong></div>
              <div class="progress-panel-track"><span class="progress-panel-fill" style="width:${pct}%"></span></div>
              <small>${counts.practicing || 0} practicing · ${counts.started || 0} started · ${counts.notstarted || 0} not started</small>
            </div>
          </div>
        </div>
      </section>
      <div class="mastery-page shell">
        <div class="mastery-legend">
          <span><i class="mastery-status is-mastered"></i>Mastered · quiz + lab + check</span>
          <span><i class="mastery-status is-practicing"></i>Practicing · some evidence</span>
          <span><i class="mastery-status is-started"></i>Started</span>
          <span><i class="mastery-status is-notstarted"></i>Not started</span>
        </div>
        <div class="mastery-note">Evidence is mapped from the lesson's checkpoint questions and lab steps in order. Open a lesson to change the underlying quiz, lab, and objective state. Lab steps with automatic sandbox checks update as you work.</div>
        ${moduleMarkup}
        <div class="mastery-footer-actions"><a class="btn btn-ghost btn-sm" href="#/review">Review due cards</a><a class="btn btn-primary btn-sm" href="#/exam">Take the final exam ${icon('arrow', 14)}</a></div>
      </div>
    </div>`;
  }

  /* ------------------------------------------------------------------------
     Final exam
     ------------------------------------------------------------------------ */

  function viewExam(section) {
    if (state.exam.active && section !== 'result') return viewExamActive();
    if (section === 'result' && state.exam.lastResult) return viewExamResult();
    return viewExamLanding();
  }

  function viewExamLanding() {
    var config = RHEL.exam.config;
    var last = state.exam.lastResult;
    var quotaBase = Math.floor(config.questions / RHEL.modules.length);
    var extra = config.questions % RHEL.modules.length;
    var history = state.exam.history || [];

    return `
    <div class="view">
      <section class="page-hero">
        <div class="shell page-hero-inner">
          <div>
            <p class="eyebrow">Level 01 · final exam</p>
            <h1>Thirty questions.<br><em>One machine.</em></h1>
            <p class="lede">A timed checkpoint drawn across all four modules, balanced by module, plus one practical task checked directly against the stateful sandbox. You get one clock, a question navigator, and no answer key until you submit.</p>
            <div class="hero-actions" style="margin-top:26px;">
              <button class="btn btn-primary" data-exam-start>Start the exam ${icon('play', 14)}</button>
              ${last ? `<a class="btn btn-ghost" href="#/exam/result">View last result ${icon('arrow', 14)}</a>` : '<a class="btn btn-ghost" href="#/review">Review first</a>'}
            </div>
          </div>
          <div class="page-hero-aside">
            <div class="progress-panel">
              <div class="progress-panel-row"><span>Format</span><strong>${config.questions} + 1</strong></div>
              <div class="progress-panel-track"><span class="progress-panel-fill" style="width:100%"></span></div>
              <small>${config.minutes} minutes total · ${config.passScore}% to pass · practical required</small>
            </div>
          </div>
        </div>
      </section>

      <div class="exam-page shell">
        <div class="exam-layout">
          <section class="exam-rules">
            <p class="eyebrow">Before the clock starts</p>
            <h2>What this exam <em>tests.</em></h2>
            <div class="exam-rule-grid">
              <article><span>01</span><h3>30 checkpoint questions</h3><p>Drawn from all 16 lessons, balanced across the four modules. Roughly two questions per lesson.</p></article>
              <article><span>02</span><h3>One live practical</h3><p>${esc(RHEL.exam.practical.title)}. The sandbox checks users, groups, ownership, and mode.</p></article>
              <article><span>03</span><h3>${config.minutes} minutes</h3><p>The timer runs while you work, including the practical. At zero, the exam submits automatically.</p></article>
              <article><span>04</span><h3>Skills breakdown</h3><p>Your result shows accuracy per module, the practical result, and a printable certificate at ${config.passScore}% or above.</p></article>
            </div>
            <div class="exam-balance">
              <p class="eyebrow">Module balance</p>
              ${RHEL.modules.map(function (module, index) {
                return `<div class="exam-balance-row"><span>Module ${module.number} · ${esc(module.title)}</span><strong>${quotaBase + (index < extra ? 1 : 0)} questions</strong></div>`;
              }).join('')}
            </div>
          </section>
          <aside class="exam-side">
            <div class="scenario-side-card">
              <p class="eyebrow">Practical task</p>
              <h3>${esc(RHEL.exam.practical.title)}</h3>
              <ol>${RHEL.exam.practical.steps.map(function (step) { return '<li>' + step + '</li>'; }).join('')}</ol>
              <p class="scenario-side-note">You can open the terminal at any time. The practical is checked against the current sandbox state, not a text box. If a previous attempt already satisfies it, starting the exam loads a clean seed automatically.</p>
            </div>
            ${last ? `<div class="scenario-side-card"><p class="eyebrow">Last result</p><div class="exam-last-score"><strong>${last.score}%</strong><span>${last.pass ? 'Passed' : 'Not passed'}</span></div><a class="text-link" href="#/exam/result">Open result page ${icon('arrow', 12)}</a></div>` : ''}
            ${history.length > 1 ? `<div class="scenario-side-card"><p class="eyebrow">Attempts</p>${history.slice(0, 4).map(function (item) { return `<div class="exam-history-row"><span>${new Date(item.completedAt).toLocaleDateString()}</span><strong>${item.score}%</strong></div>`; }).join('')}</div>` : ''}
          </aside>
        </div>
      </div>
    </div>`;
  }

  function viewExamActive() {
    var active = state.exam.active;
    var total = active.questionIds.length;
    var index = Math.max(0, Math.min(total, active.index));
    var remaining = examRemaining();
    var answered = examAnsweredCount();
    var practical = index === total;
    var item = practical ? null : RHEL.exam.question(active.questionIds[index]);
    var selected = item ? active.answers[item.id] : undefined;
    var practicalPassed = examPracticalPassed();
    var letters = ['A', 'B', 'C', 'D', 'E', 'F'];

    var questionMarkup = practical ? `
      <div class="exam-practical" data-exam-practical>
        <div class="exam-question-meta"><span class="badge badge-red">Practical</span><span>Live sandbox check</span></div>
        <p class="eyebrow">Task</p>
        <h2>${esc(RHEL.exam.practical.title)}</h2>
        <p class="exam-practical-intro">${esc(RHEL.exam.practical.intro)}</p>
        <ol class="exam-practical-steps">${RHEL.exam.practical.steps.map(function (step) { return '<li>' + step + '</li>'; }).join('')}</ol>
        <div class="exam-practical-live ${practicalPassed ? 'is-met' : ''}" data-exam-practical-status aria-live="polite">
          <span class="status-dot"></span>
          <strong>${practicalPassed ? 'Practical check passing' : 'Waiting for a passing check'}</strong>
          <small>${practicalPassed ? 'Your current sandbox state satisfies every condition.' : 'Open the terminal, complete the work, and the live check will update.'}</small>
        </div>
        <div class="exam-practical-actions"><button class="btn btn-primary btn-sm" data-open-sandbox>Open terminal sandbox ${icon('terminal', 14)}</button><button class="btn btn-ghost btn-sm" data-exam-check-practical>Re-check now</button></div>
      </div>` : `
      <div class="exam-question">
        <div class="exam-question-meta"><span class="badge">Question ${index + 1} of ${total}</span><span>${esc(item.lessonTitle)}</span><span>Module ${RHEL.getModule(item.module) ? RHEL.getModule(item.module).number : ''}</span></div>
        <p class="eyebrow">Choose one</p>
        <h2>${esc(item.question.q)}</h2>
        <div class="exam-options" role="radiogroup" aria-label="Answer options">
          ${item.question.options.map(function (option, optionIndex) {
            return `<label class="exam-option ${selected === optionIndex ? 'is-selected' : ''}">
              <input type="radio" name="exam-option" value="${optionIndex}" data-exam-option="${optionIndex}" ${selected === optionIndex ? 'checked' : ''}>
              <span class="exam-option-letter">${letters[optionIndex]}</span>
              <span>${esc(option)}</span>
            </label>`;
          }).join('')}
        </div>
      </div>`;

    var nav = active.questionIds.map(function (id, questionIndex) {
      return `<button class="exam-nav-item ${active.answers[id] !== undefined ? 'is-answered' : ''} ${questionIndex === index ? 'is-current' : ''}" data-exam-index="${questionIndex}" aria-label="Question ${questionIndex + 1}${active.answers[id] !== undefined ? ', answered' : ', unanswered'}">${questionIndex + 1}</button>`;
    }).join('') + `<button class="exam-nav-item exam-nav-practical ${practical ? 'is-current' : ''} ${practicalPassed ? 'is-answered' : ''}" data-exam-index="${total}" aria-label="Practical task">P</button>`;

    return `
    <div class="view">
      <h1 class="sr-only">Final exam in progress</h1>
      <div class="exam-session-bar">
        <div class="shell exam-session-inner">
          <div class="exam-session-title"><span class="badge badge-red">Live exam</span><strong>Level 01 final</strong><span><span data-exam-answered-count>${answered}</span> / ${total} answered</span></div>
          <div class="exam-clock ${remaining <= 300 ? 'is-urgent' : ''}"><span>Time remaining</span><strong data-exam-clock aria-label="Time remaining">${formatClock(remaining)}</strong></div>
          <button class="btn btn-sm btn-primary" data-exam-submit>Submit exam</button>
        </div>
      </div>

      <div class="exam-page shell">
        <div class="exam-session-layout">
          <aside class="exam-navigator">
            <p class="eyebrow">Questions</p>
            <div class="exam-nav-grid">${nav}</div>
            <div class="exam-nav-legend"><span><i class="is-current"></i>Current</span><span><i class="is-answered"></i>Answered</span></div>
            <div class="exam-nav-progress"><div class="progress-panel-track"><span class="progress-panel-fill" style="width:${Math.round(answered / total * 100)}%"></span></div><small>${total - answered} unanswered</small></div>
          </aside>
          <main class="exam-question-wrap">
            ${questionMarkup}
            <div class="exam-question-actions">
              <button class="btn btn-ghost btn-sm" data-exam-goto="prev" ${index === 0 ? 'disabled' : ''}>${icon('arrow', 13)} Previous</button>
              ${practical ? '<span class="exam-practical-note">Review your answers, then submit.</span>' : `<button class="btn btn-primary btn-sm" data-exam-goto="next">Next ${icon('arrow', 13)}</button>`}
            </div>
          </main>
        </div>
      </div>
    </div>`;
  }

  function viewExamResult() {
    var result = state.exam.lastResult;
    var config = RHEL.exam.config;
    var eligible = result.score >= config.passScore && result.practicalPassed;
    var learner = state.exam.learnerName || 'Your name';
    var certId = 'RHEL-01-' + String(result.id || Date.now()).replace(/[^a-z0-9]/gi, '').slice(-8).toUpperCase();
    var moduleStats = result.moduleStats || RHEL.exam.moduleStats(result.questionIds || [], result.answers || {});
    var weak = [];

    var breakdown = RHEL.modules.map(function (module) {
      var stat = moduleStats[module.id] || { correct: 0, total: 0 };
      var pct = stat.total ? Math.round(stat.correct / stat.total * 100) : 0;
      if (pct < 70) weak.push(module);
      return `<article class="exam-skill-card">
        <div class="exam-skill-head"><span>Module ${module.number}</span><strong>${pct}%</strong></div>
        <h3>${esc(module.title)}</h3>
        <div class="progress-panel-track"><span class="progress-panel-fill ${pct < 70 ? 'is-weak' : ''}" style="width:${pct}%"></span></div>
        <p>${stat.correct} of ${stat.total} checkpoint questions correct</p>
      </article>`;
    }).join('');

    return `
    <div class="view">
      <section class="page-hero exam-result-hero ${result.pass ? 'is-pass' : 'is-fail'}">
        <div class="shell page-hero-inner">
          <div>
            <p class="eyebrow">Level 01 · final exam result</p>
            <h1>${result.pass ? 'Passed.' : 'Not yet.'}<br><em>${result.score}%.</em></h1>
            <p class="lede">${result.correct} of ${result.total} checkpoint questions correct. Practical task ${result.practicalPassed ? 'passed' : 'not passing'}. ${result.pass ? 'You met the 80% bar and the live machine requirement.' : 'The pass mark is 80% plus a passing practical. The breakdown below shows where to spend the next session.'}</p>
            <div class="hero-actions" style="margin-top:26px;"><button class="btn btn-primary" data-exam-start>Retake exam ${icon('reset', 14)}</button><a class="btn btn-ghost" href="#/mastery">Objective mastery</a><a class="btn btn-ghost" href="#/review">Review due cards</a></div>
          </div>
          <div class="page-hero-aside">
            <div class="progress-panel">
              <div class="progress-panel-row"><span>Final score</span><strong>${result.score}%</strong></div>
              <div class="progress-panel-track"><span class="progress-panel-fill" style="width:${result.score}%"></span></div>
              <small>${formatDuration(result.durationSeconds)} used · ${result.completedAt ? new Date(result.completedAt).toLocaleString() : ''}</small>
            </div>
          </div>
        </div>
      </section>

      <div class="exam-result-page shell">
        <div class="exam-result-summary">
          <article><span>Questions</span><strong>${result.correct}/${result.total}</strong><small>Correct</small></article>
          <article><span>Practical</span><strong>${result.practicalPassed ? 'Pass' : 'Fail'}</strong><small>Live sandbox check</small></article>
          <article><span>Time</span><strong>${formatDuration(result.durationSeconds)}</strong><small>of ${config.minutes}:00</small></article>
          <article><span>Certificate</span><strong>${eligible ? 'Ready' : 'Locked'}</strong><small>${eligible ? 'Print below' : '80% + practical'}</small></article>
        </div>

        <section class="exam-breakdown">
          <div class="section-head"><div><p class="eyebrow">Skills breakdown</p><h2>Where you are <em>strong.</em></h2></div><p>Each module is scored from its share of the 30 checkpoint questions. Use the weak modules below as the next study queue.</p></div>
          <div class="exam-skill-grid">${breakdown}</div>
          ${weak.length ? `<div class="exam-weak-links"><strong>Review next:</strong>${weak.map(function (module) { return `<a href="#/lesson/${module.lessons[0]}">${esc(module.title)}</a>`; }).join('')}</div>` : ''}
        </section>

        <section class="exam-practical-result ${result.practicalPassed ? 'is-met' : ''}">
          <div><p class="eyebrow">Practical task</p><h2>${esc(RHEL.exam.practical.title)}</h2><p>${result.practicalPassed ? 'The live sandbox state satisfied group membership, ownership, home directory, and setgid directory mode.' : 'The practical did not pass at submission. The task is not a text answer: it is checked against the machine state.'}</p></div>
          <span class="exam-practical-badge">${result.practicalPassed ? 'PASS' : 'NOT PASSING'}</span>
        </section>
      </div>

        ${eligible ? `<section class="certificate-shell shell" id="completion-certificate">
          <div class="certificate-controls no-print">
            <label for="cert-name">Name for the certificate</label>
            <input id="cert-name" type="text" maxlength="80" value="${escAttr(state.exam.learnerName)}" placeholder="Your name" data-cert-name autocomplete="name">
            <button class="btn btn-primary btn-sm" data-print-certificate>${icon('download', 13)} Print certificate</button>
          </div>
          <article class="certificate" aria-label="Printable completion certificate">
            <div class="certificate-rule"></div>
            <p class="certificate-kicker">RHEL Fieldbook · Level 01 · Foundations</p>
            <h2>Certificate of Completion</h2>
            <p class="certificate-awarded">This certifies that</p>
            <p class="certificate-name" data-cert-name-text>${esc(learner)}</p>
            <p class="certificate-copy">has completed the Level 01 Foundations final exam with a score of <strong>${result.score}%</strong>, including the practical sandbox task: <strong>${esc(RHEL.exam.practical.title)}</strong>.</p>
            <div class="certificate-meta"><span><strong>${result.score}%</strong>Final score</span><span><strong>${result.correct}/${result.total}</strong>Questions</span><span><strong>${new Date(result.completedAt).toLocaleDateString()}</strong>Date</span><span><strong>${certId}</strong>Certificate ID</span></div>
            <p class="certificate-small">Independent study project. Not affiliated with, endorsed by, or sponsored by Red Hat, Inc. This certificate records completion inside this fieldbook; it is not an industry certification.</p>
            <div class="certificate-rule"></div>
          </article>
        </section>` : `<section class="certificate-shell shell is-locked">
          <div class="certificate-lock"><span class="badge">Locked</span><h2>Completion certificate</h2><p>Pass both the 30-question checkpoint and the practical task to unlock the printable certificate. Current score: ${result.score}%.</p><a class="btn btn-ghost btn-sm" href="#/review">Start a review session</a></div>
        </section>`}
    </div>`;
  }

  function viewNotFound() {
    return `
    <div class="view">
      <section class="page-hero">
        <div class="shell page-hero-inner">
          <div>
            <p class="eyebrow">404 · path not found</p>
            <h1>That command<br><em>doesn't exist.</em></h1>
            <p class="lede">The page you asked for is not in this fieldbook. Check the URL, or return to the curriculum and pick a lesson.</p>
            <div class="hero-actions" style="margin-top:26px;"><a class="btn btn-primary" href="#/learn">Back to the curriculum ${icon('arrow', 15, 'arrow')}</a><a class="btn btn-ghost" href="#/">Home</a></div>
          </div>
        </div>
      </section>
    </div>`;
  }

  /* ------------------------------------------------------------------------
     Routing
     ------------------------------------------------------------------------ */

  function parseRoute() {
    var raw = location.hash.replace(/^#/, '');
    if (!raw || raw === '/') return { name: 'home' };
    var parts = raw.replace(/^\//, '').split('/').filter(Boolean);
    var name = parts[0] || 'home';
    if (name === 'lesson') {
      return { name: 'lesson', id: parts[1] || '', section: parts[2] || '' };
    }
    if (name === 'scenarios') {
      return { name: 'scenarios', id: parts[1] || '' };
    }
    if (name === 'review') {
      return { name: 'review', section: parts[1] || '' };
    }
    if (name === 'exam') {
      return { name: 'exam', section: parts[1] || '' };
    }
    if (name === 'mastery') {
      return { name: 'mastery' };
    }
    if (['learn', 'roadmap', 'labs', 'commands'].indexOf(name) !== -1) {
      return { name: name };
    }
    return { name: 'notfound' };
  }

  function setActiveNav(name) {
    activeNav = name === 'lesson' ? 'learn' : name === 'mastery' ? 'review' : name;
    document.querySelectorAll('[data-nav]').forEach(function (link) {
      link.classList.toggle('is-active', link.getAttribute('data-nav') === activeNav);
      if (link.getAttribute('data-nav') === activeNav) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
  }

  function setTitle(route) {
    var title = 'RHEL Fieldbook — From first prompt to production';
    if (route.name === 'learn') title = 'Foundations · RHEL Fieldbook';
    if (route.name === 'labs') title = 'Labs · RHEL Fieldbook';
    if (route.name === 'commands') title = 'Command index · RHEL Fieldbook';
    if (route.name === 'roadmap') title = 'The full path · RHEL Fieldbook';
    if (route.name === 'scenarios') {
      var scenario = route.id ? RHEL.scenarios.find(route.id) : null;
      title = scenario ? scenario.title + ' · Broken Systems' : 'Broken Systems · RHEL Fieldbook';
    }
    if (route.name === 'review') title = route.section === 'session' ? 'Review session · RHEL Fieldbook' : 'Review · RHEL Fieldbook';
    if (route.name === 'exam') {
      title = state.exam.active && route.section !== 'result'
        ? 'Final exam in progress · RHEL Fieldbook'
        : route.section === 'result' && state.exam.lastResult
          ? 'Final exam result · RHEL Fieldbook'
          : 'Final exam · RHEL Fieldbook';
    }
    if (route.name === 'mastery') title = 'Objective mastery · RHEL Fieldbook';
    if (route.name === 'lesson') {
      var lesson = RHEL.getLesson(route.id);
      if (lesson) title = lesson.title + ' · RHEL Fieldbook';
    }
    if (route.name === 'notfound') title = 'Not found · RHEL Fieldbook';
    document.title = title;
  }

  function renderRoute(opts) {
    opts = opts || {};
    var route = parseRoute();
    currentRoute = route;
    if (!(route.name === 'review' && route.section === 'session')) reviewRevealed = false;
    if (route.name === 'review' && route.section === 'session' && state.review.active && state.review.active.index >= state.review.active.queue.length) {
      finalizeReviewSession();
    }
    var html;
    if (route.name === 'home') html = viewHome();
    else if (route.name === 'learn') html = viewLearn();
    else if (route.name === 'labs') html = viewLabs();
    else if (route.name === 'commands') html = viewCommands();
    else if (route.name === 'roadmap') html = viewRoadmap();
    else if (route.name === 'scenarios') html = viewScenarios(route.id);
    else if (route.name === 'review') html = viewReview(route.section);
    else if (route.name === 'exam') html = viewExam(route.section);
    else if (route.name === 'mastery') html = viewMastery();
    else if (route.name === 'lesson') html = viewLesson(route.id, route.section);
    else html = viewNotFound();

    app.innerHTML = html;
    setActiveNav(route.name);
    setTitle(route);
    updateProgressUI();
    enhanceCodeBlocks();
    updateLiveClocks();
    refreshExamPractical();

    if (route.name === 'lesson' && RHEL.getLesson(route.id)) {
      state.lastLesson = route.id;
      state.lastVisit = new Date().toISOString();
      saveState();
    }

    if (route.name === 'labs') setupLabFilters();
    if (route.name === 'commands') setupCommandFilters();
    if (route.name === 'review' && route.section === 'session') {
      var focusCard = document.getElementById('review-card-focus');
      if (focusCard) window.setTimeout(function () { focusCard.focus(); }, 40);
    }
    if (route.name === 'exam' && state.exam.active && route.section !== 'result' && examRemaining() <= 0) {
      window.setTimeout(function () { submitExam(true); }, 30);
    }

    closeNav();
    closePalette();

    if (!opts.keepScroll) {
      if (route.name === 'lesson' && route.section) {
        var target = document.getElementById(route.section);
        if (target) {
          window.requestAnimationFrame(function () {
            target.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
          });
        } else {
          window.scrollTo(0, 0);
        }
      } else {
        window.scrollTo(0, 0);
      }
    }
    updateReadingProgress();
  }

  function prefersReducedMotion() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  /* ------------------------------------------------------------------------
     Reading progress and TOC
     ------------------------------------------------------------------------ */

  function updateReadingProgress() {
    var bar = document.getElementById('reading-progress');
    var article = document.querySelector('.lesson-article');
    if (!bar || !article) return;
    var articleTop = article.getBoundingClientRect().top + window.scrollY;
    var span = Math.max(article.offsetHeight - window.innerHeight + 260, 1);
    var value = Math.max(0, Math.min(1, (window.scrollY - articleTop + 120) / span));
    bar.style.width = (value * 100) + '%';

    var headings = Array.prototype.slice.call(document.querySelectorAll('.prose h2[id]'));
    var current = null;
    headings.forEach(function (h) {
      if (h.getBoundingClientRect().top < 150) current = h.id;
    });
    document.querySelectorAll('.toc a').forEach(function (a) {
      a.classList.toggle('is-active', a.getAttribute('data-toc') === current);
    });
  }

  /* ------------------------------------------------------------------------
     Code blocks and copy
     ------------------------------------------------------------------------ */

  function enhanceCodeBlocks() {
    document.querySelectorAll('.prose pre').forEach(function (pre) {
      if (pre.querySelector('.copy-btn')) return;
      var text = pre.textContent;
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'copy-btn';
      btn.innerHTML = icon('copy', 11) + ' Copy';
      btn.setAttribute('aria-label', 'Copy code block');
      btn.addEventListener('click', function () {
        copyText(text).then(function () {
          btn.classList.add('is-copied');
          btn.innerHTML = icon('check', 11) + ' Copied';
          window.setTimeout(function () {
            btn.classList.remove('is-copied');
            btn.innerHTML = icon('copy', 11) + ' Copy';
          }, 1600);
        });
      });
      pre.appendChild(btn);
    });
  }

  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text).catch(function () { return legacyCopy(text); });
    }
    return Promise.resolve(legacyCopy(text));
  }

  function legacyCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '-1000px';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (e) {}
    document.body.removeChild(ta);
  }

  function copyFeedback(btn) {
    btn.classList.add('is-copied');
    var oldTitle = btn.getAttribute('title');
    btn.setAttribute('title', 'Copied');
    window.setTimeout(function () {
      btn.classList.remove('is-copied');
      if (oldTitle) btn.setAttribute('title', oldTitle);
    }, 1500);
  }

  /* ------------------------------------------------------------------------
     Progress mutations
     ------------------------------------------------------------------------ */

  function toggleLessonComplete(id) {
    var idx = state.completedLessons.indexOf(id);
    var nowDone = idx === -1;
    if (nowDone) state.completedLessons.push(id);
    else state.completedLessons.splice(idx, 1);
    state.lastLesson = id;
    saveState();
    updateProgressUI();

    document.querySelectorAll('[data-complete-lesson="' + id + '"]').forEach(function (btn) {
      var wrapper = document.createElement('div');
      wrapper.innerHTML = completeButton(id);
      btn.replaceWith(wrapper.firstElementChild);
    });

    document.querySelectorAll('.lesson-nav-link[href="#/lesson/' + id + '"]').forEach(function (link) {
      link.classList.toggle('is-done', nowDone);
      var dot = link.querySelector('.nav-dot');
      if (dot) dot.setAttribute('aria-label', nowDone ? 'Complete' : 'Not complete');
    });

    document.querySelectorAll('[data-lesson-status]').forEach(function (el) {
      if (el.getAttribute('data-lesson-status') === id) el.textContent = nowDone ? 'Completed' : 'In progress';
    });

    var next = RHEL.getNextLesson(id);
    if (nowDone) {
      showToast('<strong>Lesson complete.</strong> ' + (next ? 'Up next: <a href="#/lesson/' + next.id + '">' + esc(next.title) + '</a>' : 'Level 01 is finished. <a href="#/learn">Review the curriculum</a>.'));
      celebrateButton(id);
    } else {
      showToast('<strong>Marked incomplete.</strong> A useful excuse to run the lab again.');
    }
  }

  function celebrateButton(id) {
    var bar = document.querySelector('.lesson-complete-bar p');
    if (!bar) return;
    bar.innerHTML = '<strong>This lesson is complete.</strong>You can undo this if you want another pass.';
  }

  function toggleLabDone(id) {
    var idx = state.labsDone.indexOf(id);
    var nowDone = idx === -1;
    if (nowDone) state.labsDone.push(id);
    else state.labsDone.splice(idx, 1);
    saveState();
    updateProgressUI();

    document.querySelectorAll('[data-lab-done="' + id + '"]').forEach(function (btn) {
      btn.classList.toggle('is-done', nowDone);
      btn.innerHTML = icon('check', 12) + ' ' + (nowDone ? 'Lab complete' : 'Mark lab complete');
    });
    showToast(nowDone ? '<strong>Lab complete.</strong> Evidence beats a watched video.' : '<strong>Lab reopened.</strong> Run the verification steps again.');
  }

  function updateObjectiveCount(id) {
    var arr = state.objectives[id] || [];
    document.querySelectorAll('[data-objective-count="' + id + '"]').forEach(function (el) {
      el.textContent = arr.length;
    });
    var lesson = RHEL.getLesson(id);
    var rail = document.querySelector('.rail-card .rail-progress span');
    if (lesson && rail) rail.style.width = Math.round((arr.length / lesson.objectives.length) * 100) + '%';
  }

  function handleObjective(input) {
    var id = input.getAttribute('data-lesson');
    var index = parseInt(input.getAttribute('data-index'), 10);
    var arr = (state.objectives[id] || []).slice();
    var pos = arr.indexOf(index);
    if (input.checked && pos === -1) arr.push(index);
    if (!input.checked && pos !== -1) arr.splice(pos, 1);
    arr.sort(function (a, b) { return a - b; });
    state.objectives[id] = arr;
    saveState();
    updateObjectiveCount(id);
    updateProgressUI();
  }

  function updateLabProgress(id) {
    var lesson = RHEL.getLesson(id);
    var count = lesson.lab.steps.filter(function (step, i) { return labStepDone(id, step, i); }).length;
    var pct = Math.round((count / lesson.lab.steps.length) * 100);
    document.querySelectorAll('[data-lab-progress="' + id + '"]').forEach(function (el) {
      el.innerHTML = '<span>' + count + '</span> / ' + lesson.lab.steps.length + ' steps · ' + pct + '%';
    });
    var bars = document.querySelectorAll('.rail-card .rail-progress span');
    if (bars && bars.length > 1) bars[1].style.width = pct + '%';
    document.querySelectorAll('[data-lab-rail="' + id + '"] strong').forEach(function (el) {
      el.textContent = count + '/' + lesson.lab.steps.length;
    });
    return { count: count, total: lesson.lab.steps.length, pct: pct };
  }

  function refreshLabChecks() {
    var ids = {};
    document.querySelectorAll('[data-lab-step]').forEach(function (input) {
      var id = input.getAttribute('data-lesson');
      var index = parseInt(input.getAttribute('data-index'), 10);
      var lesson = RHEL.getLesson(id);
      if (!lesson || !lesson.lab.steps[index]) return;
      var step = lesson.lab.steps[index];
      var manual = !!(state.labSteps[id] || [])[index];
      var auto = labStepAuto(step) === true;
      var done = manual || auto;
      input.checked = done;
      var item = input.closest('.lab-item');
      if (item) {
        item.classList.toggle('is-checked', done);
        var existing = item.querySelector('.verify-auto');
        if (auto && !manual && !existing) {
          var badge = document.createElement('span');
          badge.className = 'verify verify-auto';
          badge.textContent = 'Automatically detected from your sandbox';
          var body = item.querySelector('.lab-item-body');
          if (body) body.appendChild(badge);
        } else if ((!auto || manual) && existing) {
          existing.remove();
        }
      }
      ids[id] = true;
    });
    Object.keys(ids).forEach(function (id) { updateLabProgress(id); });
  }

  function handleLabStep(input) {
    var id = input.getAttribute('data-lesson');
    var index = parseInt(input.getAttribute('data-index'), 10);
    var arr = (state.labSteps[id] || []).slice();
    arr[index] = input.checked;
    state.labSteps[id] = arr;
    var lesson = RHEL.getLesson(id);
    var step = lesson && lesson.lab.steps[index];
    var auto = step ? labStepAuto(step) === true : false;
    var done = input.checked || auto;
    input.checked = done;
    var item = input.closest('.lab-item');
    if (item) item.classList.toggle('is-checked', done);
    saveState();
    var progress = updateLabProgress(id);
    if (progress.count === progress.total && progress.total > 0) {
      showToast('<strong>All lab steps checked.</strong> Verify the result, then mark the lab complete.');
    }
  }

  function handleQuizOption(btn) {
    var id = btn.getAttribute('data-lesson');
    var qi = parseInt(btn.getAttribute('data-q'), 10);
    var oi = parseInt(btn.getAttribute('data-option'), 10);
    var lesson = RHEL.getLesson(id);
    if (!lesson) return;
    var q = lesson.quiz[qi];
    var group = btn.closest('.quiz-question');
    if (!group || group.getAttribute('data-answered') === 'true') return;
    group.setAttribute('data-answered', 'true');
    var options = group.querySelectorAll('[data-quiz-option]');
    options.forEach(function (option) {
      option.disabled = true;
      var i = parseInt(option.getAttribute('data-option'), 10);
      if (i === q.answer) option.classList.add('is-correct');
      if (i === oi && oi !== q.answer) option.classList.add('is-wrong');
    });
    var feedback = group.querySelector('[data-quiz-feedback]');
    if (feedback) {
      feedback.textContent = (oi === q.answer ? 'Correct. ' : 'Not quite. ') + q.why;
      feedback.classList.add('is-visible');
      if (oi !== q.answer) feedback.classList.add('is-wrong');
    }
    if (!state.quiz) state.quiz = {};
    if (!state.quiz[id]) state.quiz[id] = {};
    state.quiz[id][qi] = oi;
    saveState();
  }

  /* ------------------------------------------------------------------------
     Scenario actions
     ------------------------------------------------------------------------ */

  function startScenario(id) {
    var scenario = RHEL.scenarios.find(id);
    if (!scenario) return;
    if (state.scenarioActive) {
      var message = state.scenarioActive.id === id
        ? 'Restart this incident? The sandbox and timer will reset.'
        : 'Another incident is active. Loading this one resets the sandbox and abandons the current run. Continue?';
      if (!window.confirm(message)) return;
    }
    try {
      var sys = window.RHEL_SANDBOX.machine.create();
      scenario.patch(sys);
      window.RHEL_SANDBOX.loadState(sys, {
        clearLog: true,
        message: 'Broken Systems · ' + scenario.title + ' — live sandbox loaded.'
      });
    } catch (err) {
      showToast('<strong>Could not load the scenario.</strong> The sandbox state is unchanged.');
      return;
    }
    state.scenarioActive = { id: id, startedAt: Date.now(), hints: 0 };
    saveState();
    if (location.hash !== '#/scenarios/' + id) location.hash = '#/scenarios/' + id;
    else renderRoute({ keepScroll: true });
    showToast('<strong>Incident started.</strong> Read the story, work the evidence, and let the goal check decide when it is over.');
  }

  function revealScenarioHint(level) {
    var scenario = activeScenario();
    if (!scenario || !state.scenarioActive) return;
    if (level !== state.scenarioActive.hints) return;
    state.scenarioActive.hints = Math.min(3, level + 1);
    saveState();
    renderRoute({ keepScroll: true });
  }

  function completeScenario(scenario) {
    if (!scenario || !state.scenarioActive || state.scenarioActive.id !== scenario.id) return;
    var seconds = scenarioElapsed();
    var hints = state.scenarioActive.hints;
    var score = RHEL.scenarios.score(seconds, hints, scenario.timeTarget);
    var previous = scenarioRun(scenario.id) || {};
    var bestSeconds = previous.bestSeconds ? Math.min(previous.bestSeconds, seconds) : seconds;
    state.scenarioRuns[scenario.id] = {
      attempts: (previous.attempts || 0) + 1,
      bestScore: Math.max(previous.bestScore || 0, score),
      bestSeconds: bestSeconds,
      lastScore: score,
      lastSeconds: seconds,
      lastHints: hints,
      lastCompletedAt: new Date().toISOString()
    };
    state.scenarioActive = null;
    saveState();
    if (currentRoute.name === 'scenarios') renderRoute({ keepScroll: true });
    showToast('<strong>Incident resolved.</strong> Score ' + score + '/100 in ' + formatDuration(seconds) + ' with ' + hints + ' hint' + (hints === 1 ? '' : 's') + '.');
  }

  function refreshScenarioCheck() {
    if (!state.scenarioActive) return;
    var scenario = activeScenario();
    if (!scenario) return;
    var met = scenarioGoalMet(scenario);
    document.querySelectorAll('[data-scenario-goal]').forEach(function (el) {
      el.classList.toggle('is-met', met);
      var title = el.querySelector('strong');
      var note = el.querySelector('small');
      if (title) title.textContent = met ? 'Goal met' : 'Goal not met yet';
      if (note) note.textContent = met ? 'The live check passes. Resolving the incident…' : 'The check runs against the sandbox state.';
    });
    document.querySelectorAll('[data-scenario-goal-text]').forEach(function (el) {
      el.textContent = met ? 'PASS' : 'WAITING';
      el.classList.toggle('is-met', met);
    });
    if (met) completeScenario(scenario);
  }

  function checkScenarioNow(id) {
    var scenario = RHEL.scenarios.find(id);
    if (!scenario || !state.scenarioActive || state.scenarioActive.id !== id) return;
    if (scenarioGoalMet(scenario)) completeScenario(scenario);
    else showToast('<strong>Goal not met yet.</strong> Read the evidence and change one thing at a time.');
  }

  /* ------------------------------------------------------------------------
     Review actions
     ------------------------------------------------------------------------ */

  function startReviewSession(filter) {
    if (state.review.active && !window.confirm('A review session is already in progress. Start a new one and discard its position?')) return;
    var cards = getReviewCards().filter(function (card) {
      if (filter === 'quiz') return card.kind === 'quiz';
      if (filter === 'commands') return card.kind === 'command';
      return true;
    });
    var now = Date.now();
    var due = cards.filter(function (card) { return RHEL.review.isDueToday(state.review.items[card.id], now); });
    var pool = due.length ? due : cards;
    var queue = shuffleList(pool).slice(0, 20).map(function (card) { return card.id; });
    if (!queue.length) {
      showToast('<strong>No cards available.</strong> Try a different review filter.');
      return;
    }
    state.review.active = {
      queue: queue,
      index: 0,
      filter: filter || 'all',
      startedAt: now,
      correct: 0,
      again: 0
    };
    reviewRevealed = false;
    saveState();
    if (location.hash !== '#/review/session') location.hash = '#/review/session';
    else renderRoute();
  }

  function finalizeReviewSession() {
    var active = state.review.active;
    if (!active) return;
    var summary = {
      completedAt: new Date().toISOString(),
      reviewed: active.queue.length,
      correct: active.correct,
      again: active.again,
      filter: active.filter,
      durationSeconds: Math.max(0, Math.round((Date.now() - active.startedAt) / 1000))
    };
    state.review.lastSession = summary;
    state.review.history = (state.review.history || []).concat(summary).slice(-20);
    state.review.active = null;
    reviewRevealed = false;
    saveState();
  }

  function gradeReviewCard(correct) {
    var active = state.review.active;
    if (!active) return;
    var card = reviewCardById(active.queue[active.index]);
    if (!card) return;
    RHEL.review.grade(state.review.items, card.id, correct, Date.now());
    if (correct) active.correct += 1;
    else active.again += 1;
    active.index += 1;
    if (active.index >= active.queue.length) finalizeReviewSession();
    else saveState();
    reviewRevealed = false;
    renderRoute({ keepScroll: true });
  }

  function revealReviewCard() {
    reviewRevealed = true;
    renderRoute({ keepScroll: true });
  }

  /* ------------------------------------------------------------------------
     Exam actions
     ------------------------------------------------------------------------ */

  function startExam() {
    if (state.exam.active && !window.confirm('An exam is already running. Start a new one and discard the current answers?')) return;
    var refreshed = false;
    if (examPracticalPassed()) {
      try {
        var fresh = window.RHEL_SANDBOX.machine.create();
        window.RHEL_SANDBOX.loadState(fresh, {
          clearLog: true,
          message: 'Final exam · clean sandbox loaded for the practical task.'
        });
        refreshed = true;
      } catch (err) { /* keep the current machine if reset is unavailable */ }
    }
    var picked = RHEL.exam.draw(RHEL.exam.config.questions);
    var now = Date.now();
    state.exam.active = {
      id: 'exam-' + now,
      questionIds: picked.map(function (item) { return item.id; }),
      answers: {},
      index: 0,
      startedAt: now,
      endsAt: now + (RHEL.exam.config.minutes * 60000)
    };
    saveState();
    if (location.hash !== '#/exam') location.hash = '#/exam';
    else renderRoute();
    showToast(refreshed
      ? '<strong>The clock is running.</strong> A clean sandbox seed was loaded for the practical task.'
      : '<strong>The clock is running.</strong> ' + RHEL.exam.config.minutes + ' minutes, 30 questions, and one live practical task.');
  }

  function submitExam(auto) {
    var active = state.exam.active;
    if (!active) return;
    var answered = examAnsweredCount();
    var practicalPassed = examPracticalPassed();
    if (!auto) {
      var message = 'Submit the final exam? ' + (active.questionIds.length - answered) + ' question(s) are unanswered and the practical is ' + (practicalPassed ? 'passing' : 'not passing') + '.';
      if (!window.confirm(message)) return;
    }

    var correct = 0;
    var questionResults = [];
    active.questionIds.forEach(function (id) {
      var item = RHEL.exam.question(id);
      if (!item) return;
      var chosen = active.answers[id];
      var isCorrect = chosen === item.question.answer;
      if (isCorrect) correct += 1;
      questionResults.push({ id: id, lesson: item.lesson, module: item.module, qi: item.qi, chosen: chosen === undefined ? null : chosen, correct: isCorrect });
    });
    var total = active.questionIds.length;
    var score = Math.round(((correct + (practicalPassed ? 1 : 0)) / (total + 1)) * 100);
    var result = {
      id: active.id,
      completedAt: new Date().toISOString(),
      startedAt: active.startedAt,
      durationSeconds: Math.max(0, Math.round((Date.now() - active.startedAt) / 1000)),
      score: score,
      correct: correct,
      total: total,
      practicalPassed: practicalPassed,
      pass: score >= RHEL.exam.config.passScore && practicalPassed,
      moduleStats: RHEL.exam.moduleStats(active.questionIds, active.answers),
      questionResults: questionResults,
      questionIds: active.questionIds.slice(),
      answers: JSON.parse(JSON.stringify(active.answers))
    };
    state.exam.lastResult = result;
    state.exam.history = [{
      id: result.id,
      completedAt: result.completedAt,
      score: result.score,
      correct: result.correct,
      total: result.total,
      practicalPassed: result.practicalPassed,
      pass: result.pass,
      durationSeconds: result.durationSeconds
    }].concat(state.exam.history || []).slice(0, 10);
    state.exam.active = null;
    saveState();
    if (auto) showToast('<strong>Time expired.</strong> The exam was submitted automatically.');
    if (currentRoute.name === 'exam') {
      if (location.hash !== '#/exam/result') location.hash = '#/exam/result';
      else renderRoute();
    } else {
      showToast('<strong>Exam submitted.</strong> Open the result page from the final exam screen.');
    }
  }

  function refreshExamPractical() {
    if (!state.exam.active) return;
    var passed = examPracticalPassed();
    document.querySelectorAll('[data-exam-practical]').forEach(function (panel) {
      panel.classList.toggle('is-met', passed);
      var status = panel.querySelector('[data-exam-practical-status]');
      if (status) {
        status.classList.toggle('is-met', passed);
        var title = status.querySelector('strong');
        var note = status.querySelector('small');
        if (title) title.textContent = passed ? 'Practical check passing' : 'Waiting for a passing check';
        if (note) note.textContent = passed ? 'Your current sandbox state satisfies every condition.' : 'Open the terminal, complete the work, and the live check will update.';
      }
    });
    document.querySelectorAll('.exam-nav-practical').forEach(function (item) {
      item.classList.toggle('is-answered', passed);
    });
  }

  function updateLiveClocks() {
    if (state.scenarioActive) {
      var scenarioClock = document.querySelector('[data-scenario-clock]');
      if (scenarioClock) scenarioClock.textContent = formatClock(scenarioElapsed());
    }
    if (state.exam.active) {
      var remaining = examRemaining();
      document.querySelectorAll('[data-exam-clock]').forEach(function (clock) {
        clock.textContent = formatClock(remaining);
        var holder = clock.closest('.exam-clock');
        if (holder) holder.classList.toggle('is-urgent', remaining <= 300);
      });
    }
  }

  var liveClock = null;
  function startLiveClock() {
    if (liveClock) return;
    liveClock = window.setInterval(function () {
      updateLiveClocks();
      if (state.exam.active && examRemaining() <= 0) submitExam(true);
    }, 1000);
  }

  /* ------------------------------------------------------------------------
     Filters
     ------------------------------------------------------------------------ */

  function setupLabFilters() {
    var chips = document.querySelectorAll('[data-lab-filter]');
    var cards = document.querySelectorAll('[data-lab-card]');
    var empty = document.getElementById('labs-empty');
    chips.forEach(function (chip) {
      chip.addEventListener('click', function () {
        var filter = chip.getAttribute('data-lab-filter');
        chips.forEach(function (c) { c.classList.toggle('is-active', c === chip); });
        var visible = 0;
        cards.forEach(function (card) {
          var show = filter === 'all' || card.getAttribute('data-module') === filter;
          card.hidden = !show;
          if (show) visible++;
        });
        if (empty) empty.hidden = visible !== 0;
      });
    });
  }

  var commandState = { q: '', category: 'all' };

  function setupCommandFilters() {
    commandState = { q: '', category: 'all' };
    var input = document.getElementById('command-search');
    var chips = document.querySelectorAll('[data-command-category]');
    if (input) {
      input.addEventListener('input', function () {
        commandState.q = input.value.trim().toLowerCase();
        applyCommandFilters();
      });
    }
    chips.forEach(function (chip) {
      chip.addEventListener('click', function () {
        commandState.category = chip.getAttribute('data-command-category');
        chips.forEach(function (c) { c.classList.toggle('is-active', c === chip); });
        applyCommandFilters();
      });
    });
    applyCommandFilters();
  }

  function applyCommandFilters() {
    var rows = document.querySelectorAll('[data-command-row]');
    var tableRows = document.querySelectorAll('tr[data-command-row]');
    var visibleTable = 0;
    var visibleAll = 0;
    rows.forEach(function (row) {
      var categoryOk = commandState.category === 'all' || row.getAttribute('data-cat') === commandState.category;
      var searchOk = !commandState.q || (row.getAttribute('data-search') || '').indexOf(commandState.q) !== -1;
      var show = categoryOk && searchOk;
      row.hidden = !show;
      if (show) {
        visibleAll++;
        if (row.tagName === 'TR') visibleTable++;
      }
    });
    var count = document.getElementById('command-count');
    if (count) count.textContent = visibleTable || visibleAll;
    var empty = document.getElementById('command-empty');
    if (empty) empty.hidden = visibleAll !== 0;
    var wrap = document.querySelector('.command-table-wrap');
    var mobile = document.querySelector('.command-mobile-list');
    if (wrap) wrap.style.display = visibleTable === 0 ? 'none' : '';
    if (mobile) mobile.style.display = visibleAll === 0 ? 'none' : '';
  }

  /* ------------------------------------------------------------------------
     Progress export / import
     ------------------------------------------------------------------------ */

  function progressSnapshot() {
    return {
      completedLessons: state.completedLessons.slice(),
      objectives: JSON.parse(JSON.stringify(state.objectives || {})),
      labSteps: JSON.parse(JSON.stringify(state.labSteps || {})),
      quiz: JSON.parse(JSON.stringify(state.quiz || {})),
      labsDone: state.labsDone.slice(),
      lastLesson: state.lastLesson || null,
      lastVisit: state.lastVisit || null,
      scenarioRuns: JSON.parse(JSON.stringify(state.scenarioRuns || {})),
      scenarioActive: state.scenarioActive ? JSON.parse(JSON.stringify(state.scenarioActive)) : null,
      review: JSON.parse(JSON.stringify(state.review || {})),
      exam: JSON.parse(JSON.stringify(state.exam || {}))
    };
  }

  function exportProgress() {
    var payload = {
      app: 'RHEL Fieldbook',
      schema: 3,
      quizVersion: 3,
      exportedAt: new Date().toISOString(),
      progress: progressSnapshot()
    };
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = 'rhel-fieldbook-progress-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    showToast('<strong>Progress exported.</strong> Keep the JSON file as your backup.');
  }

  function isPlainObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function normalizeImportedProgress(parsed) {
    if (!isPlainObject(parsed)) throw new Error('The file must contain a JSON object.');
    var progress = parsed;
    if (parsed.app !== undefined) {
      if (parsed.app !== 'RHEL Fieldbook') throw new Error('This is not a RHEL Fieldbook progress file.');
      if (parsed.schema !== undefined && parsed.schema !== 1 && parsed.schema !== 2 && parsed.schema !== 3) {
        throw new Error('Unsupported progress file version.');
      }
      progress = parsed.progress;
    }
    if (!isPlainObject(progress)) throw new Error('The progress payload is missing.');

    var recognized = ['completedLessons', 'objectives', 'labSteps', 'quiz', 'labsDone', 'lastLesson', 'lastVisit', 'scenarioRuns', 'scenarioActive', 'review', 'exam'];
    var hasProgress = recognized.some(function (key) { return progress[key] !== undefined; });
    if (!hasProgress) throw new Error('No progress fields were found in this file.');

    var out = {
      completedLessons: [],
      objectives: {},
      labSteps: {},
      quiz: {},
      labsDone: [],
      lastLesson: null,
      lastVisit: null,
      scenarioRuns: {},
      scenarioActive: null,
      review: { version: 1, items: {}, active: null, lastSession: null, history: [] },
      exam: { active: null, lastResult: null, history: [], learnerName: '' }
    };

    function lessonFor(id, label) {
      if (typeof id !== 'string' || !RHEL.lessons[id]) {
        throw new Error('Unknown lesson id in ' + label + ': ' + String(id) + '.');
      }
      return RHEL.lessons[id];
    }

    function stringList(value, label) {
      if (value === undefined) return [];
      if (!Array.isArray(value)) throw new Error(label + ' must be an array.');
      var seen = {};
      var list = [];
      value.forEach(function (id) {
        lessonFor(id, label);
        if (!seen[id]) { seen[id] = true; list.push(id); }
      });
      return list;
    }

    out.completedLessons = stringList(progress.completedLessons, 'completedLessons');
    out.labsDone = stringList(progress.labsDone, 'labsDone');

    if (progress.objectives !== undefined) {
      if (!isPlainObject(progress.objectives)) throw new Error('objectives must be an object.');
      Object.keys(progress.objectives).forEach(function (id) {
        var lesson = lessonFor(id, 'objectives');
        var values = progress.objectives[id];
        if (!Array.isArray(values)) throw new Error('Objectives for ' + id + ' must be an array.');
        var clean = [];
        values.forEach(function (value) {
          var n = parseInt(value, 10);
          if (!isFinite(n) || n < 0 || n >= lesson.objectives.length) {
            throw new Error('Objective index out of range for ' + id + ': ' + String(value) + '.');
          }
          if (clean.indexOf(n) === -1) clean.push(n);
        });
        clean.sort(function (a, b) { return a - b; });
        if (clean.length) out.objectives[id] = clean;
      });
    }

    if (progress.labSteps !== undefined) {
      if (!isPlainObject(progress.labSteps)) throw new Error('labSteps must be an object.');
      Object.keys(progress.labSteps).forEach(function (id) {
        var lesson = lessonFor(id, 'labSteps');
        var values = progress.labSteps[id];
        if (!Array.isArray(values)) throw new Error('Lab steps for ' + id + ' must be an array.');
        if (values.length > lesson.lab.steps.length) throw new Error('Too many lab steps for ' + id + '.');
        var clean = [];
        values.forEach(function (value) {
          if (value === null || value === undefined) {
            clean.push(false);
            return;
          }
          if (value !== true && value !== false && value !== 0 && value !== 1) {
            throw new Error('Lab step values for ' + id + ' must be true or false.');
          }
          clean.push(!!value);
        });
        if (clean.some(Boolean)) out.labSteps[id] = clean;
      });
    }

    if (progress.quiz !== undefined) {
      if (!isPlainObject(progress.quiz)) throw new Error('quiz must be an object.');
      Object.keys(progress.quiz).forEach(function (id) {
        var lesson = lessonFor(id, 'quiz');
        var answers = progress.quiz[id];
        if (!isPlainObject(answers)) throw new Error('Quiz answers for ' + id + ' must be an object.');
        var clean = {};
        Object.keys(answers).forEach(function (key) {
          var qi = parseInt(key, 10);
          var oi = parseInt(answers[key], 10);
          var question = lesson.quiz[qi];
          if (!isFinite(qi) || !question) throw new Error('Quiz question out of range for ' + id + ': ' + key + '.');
          if (!isFinite(oi) || oi < 0 || oi >= question.options.length) {
            throw new Error('Quiz answer out of range for ' + id + ' question ' + (qi + 1) + '.');
          }
          clean[qi] = oi;
        });
        if (Object.keys(clean).length) out.quiz[id] = clean;
      });
    }

    if (progress.lastLesson !== undefined && progress.lastLesson !== null) {
      lessonFor(progress.lastLesson, 'lastLesson');
      out.lastLesson = progress.lastLesson;
    }
    if (progress.lastVisit !== undefined && progress.lastVisit !== null) {
      if (typeof progress.lastVisit !== 'string') throw new Error('lastVisit must be a string.');
      out.lastVisit = progress.lastVisit;
    }
    if (progress.scenarioRuns !== undefined) {
      if (!isPlainObject(progress.scenarioRuns)) throw new Error('scenarioRuns must be an object.');
      Object.keys(progress.scenarioRuns).forEach(function (id) {
        if (!RHEL.scenarios.find(id)) throw new Error('Unknown scenario id: ' + id + '.');
        if (!isPlainObject(progress.scenarioRuns[id])) throw new Error('Scenario result for ' + id + ' must be an object.');
        var run = normalizeScenarioRun(progress.scenarioRuns[id]);
        if (!run) throw new Error('Scenario result for ' + id + ' is malformed.');
        out.scenarioRuns[id] = run;
      });
    }
    if (progress.scenarioActive !== undefined && progress.scenarioActive !== null) {
      if (!isPlainObject(progress.scenarioActive) || !RHEL.scenarios.find(progress.scenarioActive.id)) {
        throw new Error('scenarioActive must reference a known scenario.');
      }
      out.scenarioActive = JSON.parse(JSON.stringify(progress.scenarioActive));
    }
    if (progress.review !== undefined) out.review = normalizeReviewState(progress.review);
    if (progress.exam !== undefined) out.exam = normalizeExamState(progress.exam);
    return out;
  }

  function importProgressFile(file) {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      showToast('<strong>Import failed.</strong> The progress file is too large.');
      return;
    }
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var parsed = JSON.parse(String(reader.result || ''));
        var imported = normalizeImportedProgress(parsed);
        if (!window.confirm('Replace your current progress with this import? This cannot be undone.')) return;
        state = Object.assign({}, state, imported, { quizVersion: 3 });
        saveState();
        commandCache = null;
        reviewCardCache = null;
        reviewRevealed = false;
        renderRoute();
        showToast('<strong>Progress imported.</strong> ' + imported.completedLessons.length + ' lessons, ' + imported.labsDone.length + ' labs, and review history restored.');
      } catch (err) {
        showToast('<strong>Import failed.</strong> ' + esc(err.message || 'Invalid progress file.'));
      }
    };
    reader.onerror = function () {
      showToast('<strong>Import failed.</strong> The file could not be read.');
    };
    reader.readAsText(file);
  }

  /* ------------------------------------------------------------------------
     Reset
     ------------------------------------------------------------------------ */

  function resetProgress() {
    if (!window.confirm('Reset all lesson, scenario, review, and exam progress on this device? Sandbox files are separate and stay put. This cannot be undone.')) return;
    var theme = state.theme;
    state = freshState();
    state.theme = theme;
    saveState();
    commandCache = null;
    reviewCardCache = null;
    reviewRevealed = false;
    renderRoute();
    showToast('<strong>Progress reset.</strong> A clean fieldbook. Start with Lesson 01.');
  }

  /* ------------------------------------------------------------------------
     Header, nav, theme
     ------------------------------------------------------------------------ */

  function closeNav() {
    document.body.classList.remove('nav-open');
    var btn = document.getElementById('menu-toggle');
    if (btn) {
      btn.setAttribute('aria-expanded', 'false');
      btn.setAttribute('aria-label', 'Open menu');
    }
  }

  function toggleNav() {
    var open = document.body.classList.toggle('nav-open');
    var btn = document.getElementById('menu-toggle');
    if (btn) {
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      btn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    }
  }

  function setupHeader() {
    var themeBtn = document.getElementById('theme-toggle');
    if (themeBtn) {
      themeBtn.addEventListener('click', function () {
        applyTheme(state.theme === 'dark' ? 'light' : 'dark');
      });
    }
    var menuBtn = document.getElementById('menu-toggle');
    if (menuBtn) menuBtn.addEventListener('click', toggleNav);
    var nav = document.getElementById('primary-nav');
    if (nav) {
      nav.addEventListener('click', function (e) {
        if (e.target.closest('a')) closeNav();
      });
    }
    var searchBtn = document.getElementById('search-trigger');
    if (searchBtn) searchBtn.addEventListener('click', openPalette);
    window.addEventListener('resize', function () {
      if (window.innerWidth > 760) closeNav();
    });
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  function onScroll() {
    if (header) header.classList.toggle('is-scrolled', window.scrollY > 6);
    updateReadingProgress();
  }

  /* ------------------------------------------------------------------------
     Command palette
     ------------------------------------------------------------------------ */

  var paletteActive = -1;
  var paletteResults = [];
  var paletteBuilt = false;
  var paletteIndex = [];

  function buildPaletteIndex() {
    paletteIndex = [];
    RHEL.lessonOrder.forEach(function (id) {
      var l = RHEL.lessons[id];
      paletteIndex.push({
        type: 'Lesson',
        icon: String(RHEL.getLessonNumber(id)).padStart(2, '0'),
        title: l.title,
        subtitle: l.subtitle,
        url: '#/lesson/' + id,
        haystack: [l.title, l.subtitle, l.difficulty, (l.tags || []).join(' '), l.objectives.join(' ')].join(' ').toLowerCase()
      });
    });
    getCommands().forEach(function (c) {
      paletteIndex.push({
        type: 'Command',
        icon: '>_',
        title: c.cmd,
        subtitle: c.desc + ' · ' + c.category,
        url: '#/lesson/' + c.lesson,
        haystack: [c.cmd, c.desc, c.category, c.lessonTitle].join(' ').toLowerCase(),
        copy: c.cmd
      });
    });
    RHEL.lessonOrder.forEach(function (id) {
      var l = RHEL.lessons[id];
      paletteIndex.push({
        type: 'Lab',
        icon: 'LAB',
        title: l.lab.title,
        subtitle: l.lab.scenario,
        url: '#/lesson/' + id + '/lab',
        haystack: [l.lab.title, l.lab.scenario, l.lab.steps.map(function (s) { return s.text; }).join(' ')].join(' ').toLowerCase()
      });
    });
    RHEL.scenarios.forEach(function (scenario) {
      paletteIndex.push({
        type: 'Scenario',
        icon: '2AM',
        title: scenario.title,
        subtitle: scenario.subtitle + ' · ' + Math.round(scenario.timeTarget / 60) + ' min target',
        url: '#/scenarios/' + scenario.id,
        haystack: [scenario.title, scenario.subtitle, scenario.story, 'broken systems incident scenario'].join(' ').toLowerCase()
      });
    });
    paletteIndex.push({ type: 'Page', icon: 'GO', title: 'Curriculum', subtitle: 'Level 01 · sixteen lessons', url: '#/learn', haystack: 'curriculum lessons foundations level 01' });
    paletteIndex.push({ type: 'Page', icon: 'GO', title: 'The full path', subtitle: 'Five levels, zero to production', url: '#/roadmap', haystack: 'roadmap path levels production rhcsa rhce rhca' });
    paletteIndex.push({ type: 'Page', icon: 'GO', title: 'Labs', subtitle: 'Hands-on practice', url: '#/labs', haystack: 'labs practice exercises' });
    paletteIndex.push({ type: 'Page', icon: 'GO', title: 'Command index', subtitle: 'Every command in Level 01', url: '#/commands', haystack: 'commands reference index' });
    paletteIndex.push({ type: 'Page', icon: 'GO', title: 'Broken Systems', subtitle: 'Five live incidents in the sandbox', url: '#/scenarios', haystack: 'broken systems scenarios incidents troubleshooting 2am' });
    paletteIndex.push({ type: 'Page', icon: 'REV', title: 'Spaced review', subtitle: 'Due quiz questions and command flashcards', url: '#/review', haystack: 'review spaced repetition leitner flashcards due today' });
    paletteIndex.push({ type: 'Page', icon: 'EX', title: 'Level 01 final exam', subtitle: '30 timed questions and a practical task', url: '#/exam', haystack: 'exam final test certificate practical timed' });
    paletteIndex.push({ type: 'Page', icon: 'MAP', title: 'Objective mastery', subtitle: '80 objectives with quiz and lab evidence', url: '#/mastery', haystack: 'mastery objectives evidence quiz lab progress' });
    paletteBuilt = true;
  }

  function paletteScore(item, q) {
    if (!q) return 0;
    var title = item.title.toLowerCase();
    if (title === q) return 100;
    if (title.indexOf(q) === 0) return 80;
    if (title.indexOf(q) !== -1) return 60;
    if (item.haystack.indexOf(q) !== -1) return 30;
    return -1;
  }

  function renderPalette(query) {
    var q = (query || '').trim().toLowerCase();
    var body = document.getElementById('palette-results');
    if (!body) return;
    if (!paletteBuilt) buildPaletteIndex();
    var results;
    if (!q) {
      results = [
        paletteIndex.find(function (i) { return i.url === '#/lesson/orientation'; }),
        paletteIndex.find(function (i) { return i.url === '#/lesson/shell'; }),
        paletteIndex.find(function (i) { return i.url === '#/lesson/help'; }),
        paletteIndex.find(function (i) { return i.url === '#/learn'; }),
        paletteIndex.find(function (i) { return i.url === '#/scenarios'; }),
        paletteIndex.find(function (i) { return i.url === '#/review'; }),
        paletteIndex.find(function (i) { return i.url === '#/exam'; }),
        paletteIndex.find(function (i) { return i.url === '#/roadmap'; })
      ].filter(Boolean);
    } else {
      results = paletteIndex.map(function (item) {
        return { item: item, score: paletteScore(item, q) };
      }).filter(function (x) { return x.score >= 0; })
        .sort(function (a, b) { return b.score - a.score; })
        .slice(0, 16)
        .map(function (x) { return x.item; });
    }
    paletteResults = results;
    paletteActive = results.length ? 0 : -1;

    if (!results.length) {
      body.innerHTML = '<div class="palette-empty">No matching lesson, lab, or command. Try “permissions” or “systemctl”.</div>';
      return;
    }
    var html = '';
    var lastType = '';
    results.forEach(function (item, i) {
      if (item.type !== lastType) {
        html += '<div class="palette-section-title">' + esc(item.type) + '</div>';
        lastType = item.type;
      }
      html += `<a class="palette-item ${i === 0 ? 'is-active' : ''}" href="${item.url}" data-palette-index="${i}">
        <span class="palette-item-icon">${esc(item.icon)}</span>
        <span class="palette-item-main"><strong>${esc(item.title)}</strong><span>${esc(item.subtitle)}</span></span>
        ${icon('arrow', 12)}
      </a>`;
    });
    body.innerHTML = html;
  }

  function openPalette() {
    var overlay = document.getElementById('palette');
    if (!overlay) return;
    overlay.hidden = false;
    document.body.classList.add('palette-open');
    var input = document.getElementById('palette-input');
    if (input) {
      input.value = '';
      window.setTimeout(function () { input.focus(); }, 30);
    }
    renderPalette('');
  }

  function closePalette() {
    var overlay = document.getElementById('palette');
    if (!overlay || overlay.hidden) return;
    overlay.hidden = true;
    document.body.classList.remove('palette-open');
  }

  function setupPalette() {
    var overlay = document.getElementById('palette');
    var input = document.getElementById('palette-input');
    if (!overlay || !input) return;
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) closePalette();
    });
    input.addEventListener('input', function () { renderPalette(input.value); });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (!paletteResults.length) return;
        paletteActive = (paletteActive + (e.key === 'ArrowDown' ? 1 : -1) + paletteResults.length) % paletteResults.length;
        document.querySelectorAll('.palette-item').forEach(function (el, i) {
          el.classList.toggle('is-active', i === paletteActive);
          if (i === paletteActive) el.scrollIntoView({ block: 'nearest' });
        });
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (paletteActive >= 0 && paletteResults[paletteActive]) {
          location.hash = paletteResults[paletteActive].url.replace(/^#/, '');
        }
      }
    });
    overlay.addEventListener('click', function (e) {
      if (e.target.closest('.palette-item')) closePalette();
    });
    document.addEventListener('keydown', function (e) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (overlay.hidden) openPalette(); else closePalette();
      } else if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        var tag = (document.activeElement && document.activeElement.tagName) || '';
        if (['INPUT', 'TEXTAREA', 'SELECT'].indexOf(tag) === -1 && !(document.activeElement && document.activeElement.isContentEditable) && overlay.hidden) {
          e.preventDefault();
          openPalette();
        }
      } else if (e.key === 'Escape') {
        closePalette();
        closeNav();
      }
    });
  }

  /* ------------------------------------------------------------------------
     Global events
     ------------------------------------------------------------------------ */

  function setupEvents() {
    document.addEventListener('click', function (e) {
      var copy = e.target.closest('[data-copy]');
      if (copy) {
        e.preventDefault();
        copyText(copy.getAttribute('data-copy')).then(function () {
          copyFeedback(copy);
          showToast('<strong>Copied to clipboard.</strong> Run it in the sandbox or your lab.');
        });
        return;
      }
      var tryBtn = e.target.closest('[data-try]');
      if (tryBtn) {
        e.preventDefault();
        if (window.tryInSandbox) window.tryInSandbox(tryBtn.getAttribute('data-try'));
        return;
      }
      var complete = e.target.closest('[data-complete-lesson]');
      if (complete) {
        e.preventDefault();
        toggleLessonComplete(complete.getAttribute('data-complete-lesson'));
        return;
      }
      var labDone = e.target.closest('[data-lab-done]');
      if (labDone) {
        e.preventDefault();
        toggleLabDone(labDone.getAttribute('data-lab-done'));
        return;
      }
      var quiz = e.target.closest('[data-quiz-option]');
      if (quiz) {
        e.preventDefault();
        handleQuizOption(quiz);
        return;
      }
      var toc = e.target.closest('[data-toc]');
      if (toc) {
        e.preventDefault();
        var target = document.getElementById(toc.getAttribute('data-toc'));
        if (target) target.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
        return;
      }
      var exportBtn = e.target.closest('[data-export-progress]');
      if (exportBtn) {
        e.preventDefault();
        exportProgress();
        return;
      }
      var importBtn = e.target.closest('[data-import-progress]');
      if (importBtn) {
        e.preventDefault();
        var fileInput = document.querySelector('[data-import-file]');
        if (fileInput) fileInput.click();
        return;
      }
      var reset = e.target.closest('[data-reset-progress]');
      if (reset) {
        e.preventDefault();
        resetProgress();
        return;
      }
      var scenarioStart = e.target.closest('[data-scenario-start]');
      if (scenarioStart) {
        e.preventDefault();
        startScenario(scenarioStart.getAttribute('data-scenario-start'));
        return;
      }
      var scenarioHint = e.target.closest('[data-scenario-hint]');
      if (scenarioHint) {
        e.preventDefault();
        revealScenarioHint(parseInt(scenarioHint.getAttribute('data-scenario-hint'), 10));
        return;
      }
      var scenarioCheck = e.target.closest('[data-scenario-check]');
      if (scenarioCheck) {
        e.preventDefault();
        checkScenarioNow(scenarioCheck.getAttribute('data-scenario-check'));
        return;
      }
      var openSandboxBtn = e.target.closest('[data-open-sandbox]');
      if (openSandboxBtn) {
        e.preventDefault();
        if (window.openSandbox) window.openSandbox();
        return;
      }
      var startReview = e.target.closest('[data-start-review]');
      if (startReview) {
        e.preventDefault();
        startReviewSession(startReview.getAttribute('data-start-review'));
        return;
      }
      var reveal = e.target.closest('[data-review-reveal]');
      if (reveal) {
        e.preventDefault();
        revealReviewCard();
        return;
      }
      var grade = e.target.closest('[data-review-grade]');
      if (grade) {
        e.preventDefault();
        gradeReviewCard(grade.getAttribute('data-review-grade') === 'good');
        return;
      }
      var examStart = e.target.closest('[data-exam-start]');
      if (examStart) {
        e.preventDefault();
        startExam();
        return;
      }
      var examSubmit = e.target.closest('[data-exam-submit]');
      if (examSubmit) {
        e.preventDefault();
        submitExam(false);
        return;
      }
      var examNav = e.target.closest('[data-exam-index]');
      if (examNav && state.exam.active) {
        e.preventDefault();
        state.exam.active.index = Math.max(0, Math.min(state.exam.active.questionIds.length, parseInt(examNav.getAttribute('data-exam-index'), 10) || 0));
        saveState();
        renderRoute({ keepScroll: true });
        return;
      }
      var examGoto = e.target.closest('[data-exam-goto]');
      if (examGoto && state.exam.active) {
        e.preventDefault();
        var move = examGoto.getAttribute('data-exam-goto') === 'next' ? 1 : -1;
        state.exam.active.index = Math.max(0, Math.min(state.exam.active.questionIds.length, state.exam.active.index + move));
        saveState();
        renderRoute({ keepScroll: true });
        return;
      }
      var practicalCheck = e.target.closest('[data-exam-check-practical]');
      if (practicalCheck) {
        e.preventDefault();
        refreshExamPractical();
        showToast(examPracticalPassed() ? '<strong>Practical passing.</strong> The live sandbox check is satisfied.' : '<strong>Not passing yet.</strong> Check the task conditions in the terminal.');
        return;
      }
      var printCertificate = e.target.closest('[data-print-certificate]');
      if (printCertificate) {
        e.preventDefault();
        window.print();
        return;
      }
      var paletteItem = e.target.closest('.palette-item');
      if (paletteItem) closePalette();
    });

    document.addEventListener('change', function (e) {
      if (e.target.matches('[data-objective]')) handleObjective(e.target);
      if (e.target.matches('[data-lab-step]')) handleLabStep(e.target);
      if (e.target.matches('[data-exam-option]') && state.exam.active) {
        var active = state.exam.active;
        var qid = active.questionIds[active.index];
        active.answers[qid] = parseInt(e.target.value, 10);
        saveState();
        document.querySelectorAll('[data-exam-option]').forEach(function (input) {
          var label = input.closest('.exam-option');
          if (label) label.classList.toggle('is-selected', input.checked);
        });
        var currentNav = document.querySelector('.exam-nav-item.is-current');
        if (currentNav && currentNav.classList.contains('exam-nav-practical') === false) currentNav.classList.add('is-answered');
        document.querySelectorAll('[data-exam-answered-count]').forEach(function (el) { el.textContent = examAnsweredCount(); });
      }
      if (e.target.matches('[data-import-file]')) {
        var file = e.target.files && e.target.files[0];
        e.target.value = '';
        importProgressFile(file);
      }
    });

    document.addEventListener('input', function (e) {
      if (e.target.matches('[data-cert-name]')) {
        state.exam.learnerName = e.target.value.slice(0, 80);
        saveState();
        document.querySelectorAll('[data-cert-name-text]').forEach(function (el) {
          el.textContent = state.exam.learnerName || 'Your name';
        });
      }
    });

    document.addEventListener('keydown', function (e) {
      if (currentRoute.name !== 'review' || currentRoute.section !== 'session' || !state.review.active) return;
      var tag = (document.activeElement && document.activeElement.tagName) || '';
      if (['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].indexOf(tag) !== -1) return;
      if (!reviewRevealed && (e.key === ' ' || e.key === 'Enter')) {
        e.preventDefault();
        revealReviewCard();
      } else if (reviewRevealed && (e.key === '1' || e.key === '2')) {
        e.preventDefault();
        gradeReviewCard(e.key === '2');
      }
    });

    window.addEventListener('hashchange', function () { renderRoute(); });
    document.addEventListener('rhel:sandbox-change', function () {
      refreshLabChecks();
      refreshScenarioCheck();
      refreshExamPractical();
    });
  }

  /* ------------------------------------------------------------------------
     Boot
     ------------------------------------------------------------------------ */

  applyTheme(state.theme);
  setupHeader();
  setupPalette();
  setupEvents();
  startLiveClock();
  history.scrollRestoration = 'manual';
  renderRoute();
})();

