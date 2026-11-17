/* ==========================================================================
   RHEL Fieldbook — spaced review
   Leitner boxes, review dashboard, session view, and card grading.
   ========================================================================== */

import { store } from './state.js';

export function createReview(deps) {
  const RHEL = window.RHEL;
  const state = store.state;
  const { getCommands, esc, icon, saveState, showToast, renderRoute } = deps;
  let reviewCardCache = null;
  let reviewRevealed = false;

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
          <p class="review-source">Quiz cards come from every checkpoint question in the live curriculum. Command cards come from the deduplicated command index, generated in both directions. Everything is stored locally and included in the progress export.</p>
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



  function sync(route) {
    if (!(route.name === 'review' && route.section === 'session')) reviewRevealed = false;
    if (route.name === 'review' && route.section === 'session' && state.review.active && state.review.active.index >= state.review.active.queue.length) {
      finalizeReviewSession();
    }
  }

  function invalidate() {
    reviewCardCache = null;
    reviewRevealed = false;
  }

  return {
    getCards: getReviewCards,
    dueCount: reviewDueCount,
    cardById: reviewCardById,
    stats: reviewStats,
    updateUI: updateReviewUI,
    view: viewReview,
    start: startReviewSession,
    grade: gradeReviewCard,
    reveal: revealReviewCard,
    revealed: function () { return reviewRevealed; },
    sync: sync,
    invalidate: invalidate
  };
}
