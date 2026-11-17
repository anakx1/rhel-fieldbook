/* ==========================================================================
   RHEL Fieldbook — persisted application state
   Owns the storage schema, migrations, and normalization. The exported
   store object is stable: import/reset replaces its properties so existing
   references remain valid.
   ========================================================================== */

const STORAGE_KEY = 'rhel-fieldbook:v1';

const DEFAULT_STATE = {
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

export function freshState() {
  return JSON.parse(JSON.stringify(DEFAULT_STATE));
}

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function clampNumber(value, min, max, fallback) {
  let number = Number(value);
  if (!Number.isFinite(number)) number = fallback;
  return Math.max(min, Math.min(max, number));
}

function safeTimestamp(value) {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value)) ? value : new Date(0).toISOString();
}

let reviewCardsProvider = () => [];

export function setReviewCardsProvider(provider) {
  reviewCardsProvider = typeof provider === 'function' ? provider : () => [];
}

export const store = { state: freshState() };

export function replaceState(next) {
  Object.keys(store.state).forEach((key) => { delete store.state[key]; });
  Object.assign(store.state, next);
  return store.state;
}

export function loadPersistedState() {
  let loaded;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    loaded = raw ? Object.assign(freshState(), JSON.parse(raw)) : freshState();
  } catch (error) {
    loaded = freshState();
  }
  const migrated = migrateState(loaded);
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated)); } catch (error) {}
  return migrated;
}

export function saveState() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(store.state)); } catch (error) {}
}

export function normalizeScenarioRun(value) {
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

export function normalizeExamResult(value) {
  if (!isPlainObject(value)) return null;
  const questionIds = Array.isArray(value.questionIds)
    ? value.questionIds.filter((id) => !!window.RHEL.exam.question(id))
    : [];
  const total = questionIds.length || Math.max(0, Math.min(100, parseInt(value.total, 10) || 0));
  const correct = clampNumber(value.correct, 0, total || 100, 0);
  const practicalPassed = value.practicalPassed === true;
  const score = clampNumber(value.score, 0, 100, total ? Math.round(((correct + (practicalPassed ? 1 : 0)) / (total + 1)) * 100) : 0);
  const answers = {};
  if (isPlainObject(value.answers)) {
    Object.keys(value.answers).forEach((id) => {
      const item = window.RHEL.exam.question(id);
      const choice = parseInt(value.answers[id], 10);
      if (item && Number.isFinite(choice) && choice >= 0 && choice < item.question.options.length) answers[id] = choice;
    });
  }
  const moduleStats = {};
  window.RHEL.modules.forEach((module) => {
    const source = isPlainObject(value.moduleStats) && isPlainObject(value.moduleStats[module.id]) ? value.moduleStats[module.id] : {};
    const moduleTotal = Math.max(0, parseInt(source.total, 10) || 0);
    moduleStats[module.id] = {
      id: module.id,
      number: module.number,
      title: module.title,
      correct: clampNumber(source.correct, 0, moduleTotal, 0),
      total: moduleTotal
    };
  });
  const questionResults = Array.isArray(value.questionResults) ? value.questionResults.filter((item) => {
    return isPlainObject(item) && !!window.RHEL.exam.question(item.id);
  }).map((item) => {
    const source = window.RHEL.exam.question(item.id);
    return { id: item.id, lesson: source.lesson, module: source.module, qi: source.qi, chosen: item.chosen === null || item.chosen === undefined ? null : parseInt(item.chosen, 10), correct: item.correct === true };
  }) : [];
  return {
    id: typeof value.id === 'string' ? value.id.slice(0, 80) : 'exam-imported',
    completedAt: safeTimestamp(value.completedAt),
    startedAt: Number(value.startedAt) || 0,
    durationSeconds: clampNumber(value.durationSeconds, 0, 24 * 60 * 60, 0),
    score,
    correct,
    total,
    practicalPassed,
    pass: score >= window.RHEL.exam.config.passScore && practicalPassed,
    moduleStats,
    questionResults,
    questionIds,
    answers
  };
}

function normalizeExamHistoryItem(value) {
  if (!isPlainObject(value)) return null;
  const practicalPassed = value.practicalPassed === true;
  const score = clampNumber(value.score, 0, 100, 0);
  return {
    id: typeof value.id === 'string' ? value.id.slice(0, 80) : 'exam-imported',
    completedAt: safeTimestamp(value.completedAt),
    score,
    correct: clampNumber(value.correct, 0, 100, 0),
    total: clampNumber(value.total, 0, 100, 0),
    practicalPassed,
    pass: score >= window.RHEL.exam.config.passScore && practicalPassed,
    durationSeconds: clampNumber(value.durationSeconds, 0, 24 * 60 * 60, 0)
  };
}

export function normalizeReviewState(value) {
  const review = { version: 1, items: {}, active: null, lastSession: null, history: [] };
  if (!isPlainObject(value)) return review;
  const cardMap = {};
  reviewCardsProvider().forEach((card) => { cardMap[card.id] = card; });
  if (isPlainObject(value.items)) {
    Object.keys(value.items).forEach((id) => {
      const item = value.items[id];
      if (!cardMap[id] || !isPlainObject(item)) return;
      let box = parseInt(item.box, 10);
      if (!Number.isFinite(box)) box = 1;
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
    const queue = value.active.queue.filter((id) => !!cardMap[id]);
    if (queue.length) {
      review.active = {
        queue,
        index: Math.max(0, Math.min(queue.length, parseInt(value.active.index, 10) || 0)),
        filter: value.active.filter === 'quiz' || value.active.filter === 'commands' ? value.active.filter : 'all',
        startedAt: Number(value.active.startedAt) || Date.now(),
        correct: Math.max(0, parseInt(value.active.correct, 10) || 0),
        again: Math.max(0, parseInt(value.active.again, 10) || 0)
      };
    }
  }
  if (isPlainObject(value.lastSession)) review.lastSession = normalizeReviewSession(value.lastSession);
  if (Array.isArray(value.history)) review.history = value.history.map(normalizeReviewSession).filter(Boolean).slice(-20);
  return review;
}

export function normalizeExamState(value) {
  const exam = { active: null, lastResult: null, history: [], learnerName: '' };
  if (!isPlainObject(value)) return exam;
  if (typeof value.learnerName === 'string') exam.learnerName = value.learnerName.slice(0, 80);
  if (isPlainObject(value.active) && Array.isArray(value.active.questionIds) && value.active.questionIds.length) {
    const validIds = value.active.questionIds.filter((id) => !!window.RHEL.exam.question(id));
    if (validIds.length === value.active.questionIds.length) {
      const answers = {};
      if (isPlainObject(value.active.answers)) {
        Object.keys(value.active.answers).forEach((id) => {
          const item = window.RHEL.exam.question(id);
          const choice = parseInt(value.active.answers[id], 10);
          if (item && Number.isFinite(choice) && choice >= 0 && choice < item.question.options.length) answers[id] = choice;
        });
      }
      exam.active = {
        id: typeof value.active.id === 'string' ? value.active.id : 'exam-' + Date.now(),
        questionIds: validIds,
        answers,
        index: Math.max(0, Math.min(validIds.length, parseInt(value.active.index, 10) || 0)),
        startedAt: Number(value.active.startedAt) || Date.now(),
        endsAt: Number(value.active.endsAt) || (Date.now() + window.RHEL.exam.config.minutes * 60000)
      };
    }
  }
  if (isPlainObject(value.lastResult)) exam.lastResult = normalizeExamResult(value.lastResult);
  if (Array.isArray(value.history)) exam.history = value.history.map(normalizeExamHistoryItem).filter(Boolean).slice(-10);
  return exam;
}

export function migrateState(input) {
  const s = Object.assign(freshState(), input || {});
  if (!s.quiz || typeof s.quiz !== 'object' || Array.isArray(s.quiz)) s.quiz = {};
  Object.keys(s.quiz).forEach((lessonId) => {
    const lesson = window.RHEL.lessons[lessonId];
    const answers = s.quiz[lessonId];
    if (!lesson || !lesson.quiz || !answers || typeof answers !== 'object' || Array.isArray(answers)) {
      delete s.quiz[lessonId];
      return;
    }
    const clean = {};
    Object.keys(answers).forEach((key) => {
      const qi = parseInt(key, 10);
      const oi = parseInt(answers[key], 10);
      const question = lesson.quiz[qi];
      if (!Number.isFinite(qi) || !Number.isFinite(oi) || !question) return;
      if (oi < 0 || oi >= question.options.length) return;
      clean[qi] = oi;
    });
    if (Object.keys(clean).length) s.quiz[lessonId] = clean;
    else delete s.quiz[lessonId];
  });
  s.quizVersion = 3;
  s.scenarioRuns = isPlainObject(s.scenarioRuns) ? s.scenarioRuns : {};
  Object.keys(s.scenarioRuns).forEach((id) => {
    const run = window.RHEL.scenarios.find(id) ? normalizeScenarioRun(s.scenarioRuns[id]) : null;
    if (run) s.scenarioRuns[id] = run;
    else delete s.scenarioRuns[id];
  });
  if (s.scenarioActive) {
    const activeScenario = window.RHEL.scenarios.find(s.scenarioActive.id);
    if (!activeScenario || !Number.isFinite(Number(s.scenarioActive.startedAt))) s.scenarioActive = null;
    else {
      s.scenarioActive.startedAt = Number(s.scenarioActive.startedAt);
      s.scenarioActive.hints = Math.max(0, Math.min(3, parseInt(s.scenarioActive.hints, 10) || 0));
    }
  }
  s.review = normalizeReviewState(s.review);
  s.exam = normalizeExamState(s.exam);
  return s;
}
