/* ==========================================================================
   RHEL Fieldbook — reference views
   Labs index, command index, roadmap, and printable cheat sheets.
   ========================================================================== */

import { store } from './state.js';

export function createViews(deps) {
  const RHEL = window.RHEL;
  const state = store.state;
  const { esc, escAttr, icon, isLabDone, getCommands, coursePercent, rawCmd, totalCommands } = deps;

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
            <p class="eyebrow">Hands-on · Levels 01 & 02</p>
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
          ${RHEL.allModules.map(function (m) { return `<button class="filter-chip" data-lab-filter="${m.id}">L${esc(m.level)} · ${m.number} ${esc(m.title)}</button>`; }).join('')}
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
            <p class="lede">Every command across both live levels, deduplicated and linked back to the lesson that explains it. Copy it, try it in the sandbox, then run it in your lab.</p>
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
            ${live ? '<div class="roadmap-cta"><a class="btn btn-primary btn-sm" href="#/learn">Open Level ' + level.id + ' ' + icon('arrow', 13) + '</a></div>' : ''}
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
            <p class="lede">The complete objective map for enterprise Linux: foundations, operations, administration, automation, and production design. Levels 01 and 02 are live now; later volumes are mapped so you can see where each skill is going.</p>
          </div>
          <div class="page-hero-aside">
            <div class="progress-panel">
              <div class="progress-panel-row"><span>Live volumes</span><strong>01 · 02</strong></div>
              <div class="progress-panel-track"><span class="progress-panel-fill" style="width:${coursePercent()}%"></span></div>
              <small>${state.completedLessons.length} of ${RHEL.lessonOrder.length} lessons complete across both live levels</small>
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

  function viewCheatsheets() {
    var levelMarkup = RHEL.liveLevels.map(function (level) {
      var modules = level.modules.map(function (module) {
        var lessons = module.lessons.map(function (id) {
          var lesson = RHEL.lessons[id];
          return `
            <section class="cheat-lesson" id="cheat-${id}">
              <header class="cheat-lesson-head">
                <div><span class="cheat-number">Lesson ${String(RHEL.getLessonNumber(id)).padStart(2, '0')}</span><h3>${esc(lesson.title)}</h3></div>
                <span class="cheat-meta">${lesson.minutes} min · ${esc(lesson.difficulty)}</span>
              </header>
              <p class="cheat-subtitle">${esc(lesson.subtitle)}</p>
              <div class="cheat-columns">
                <div>
                  <h4>Objectives</h4>
                  <ul class="cheat-objectives">${lesson.objectives.map(function (objective) { return '<li>' + esc(objective) + '</li>'; }).join('')}</ul>
                  <h4>Lab</h4>
                  <p class="cheat-lab"><strong>${esc(lesson.lab.title)}</strong><br>${esc(lesson.lab.scenario)}</p>
                </div>
                <div>
                  <h4>Commands to keep</h4>
                  <table class="cheat-commands"><tbody>
                    ${lesson.commands.map(function (command) {
                      return `<tr><td><code>${esc(rawCmd(command.cmd))}</code></td><td>${esc(command.desc)}</td></tr>`;
                    }).join('')}
                  </tbody></table>
                </div>
              </div>
              ${Array.isArray(lesson.versionNotes) && lesson.versionNotes.length ? `<div class="cheat-version"><strong>RHEL 9 → 10</strong> ${lesson.versionNotes.map(esc).join(' ')}</div>` : ''}
            </section>`;
        }).join('');
        return `
          <section class="cheat-module">
            <header class="cheat-module-head"><span>L${esc(level.id)} · Module ${module.number}</span><h2>${esc(module.title)}</h2><p>${esc(module.blurb)}</p></header>
            ${lessons}
          </section>`;
      }).join('');
      return `<section class="cheat-level"><div class="cheat-level-head"><span>Level ${esc(level.id)}</span><h1>${esc(level.title)}</h1><p>${esc(level.promise)}</p></div>${modules}</section>`;
    }).join('');

    return `
    <div class="view cheatsheets-page">
      <section class="page-hero cheat-hero">
        <div class="shell page-hero-inner">
          <div>
            <p class="eyebrow">Print · offline revision</p>
            <h1>Cheat sheets,<br><em>without the noise.</em></h1>
            <p class="lede">Every live lesson distilled to objectives, lab intent, and the commands worth keeping. Each module starts a new print section; use your browser's print dialog to make a PDF or paper copy.</p>
          </div>
          <div class="page-hero-aside cheat-actions">
            <button class="btn btn-primary" data-print-cheatsheets>${icon('download', 15)} Print / save as PDF</button>
            <a class="btn btn-ghost" href="#/learn">Back to curriculum</a>
            <small>${RHEL.lessonOrder.length} lessons · ${totalCommands()} commands · ${RHEL.liveLevels.length} levels</small>
          </div>
        </div>
      </section>
      <div class="cheatsheet-shell shell">
        <div class="cheat-note"><strong>Print tip.</strong> Enable background graphics for the level rules, and choose A4 or Letter portrait. Diagrams and command tables are kept together where possible.</div>
        ${levelMarkup}
      </div>
    </div>`;
  }

  /* ------------------------------------------------------------------------
     Routing
     ------------------------------------------------------------------------ */



  return {
    labs: viewLabs,
    commands: viewCommands,
    roadmap: viewRoadmap,
    cheatsheets: viewCheatsheets
  };
}
