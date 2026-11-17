/* ==========================================================================
   RHEL Fieldbook — command palette
   Search lessons, commands, labs, scenarios, and pages from one overlay.
   ========================================================================== */

export function createPalette(deps) {
  const RHEL = window.RHEL;
  const { getCommands, closeNav, esc, icon } = deps;

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
    paletteIndex.push({ type: 'Page', icon: 'GO', title: 'Curriculum', subtitle: 'Two live levels · 25 lessons', url: '#/learn', haystack: 'curriculum lessons foundations level 01' });
    paletteIndex.push({ type: 'Page', icon: 'GO', title: 'The full path', subtitle: 'Five levels, zero to production', url: '#/roadmap', haystack: 'roadmap path levels production rhcsa rhce rhca' });
    paletteIndex.push({ type: 'Page', icon: 'GO', title: 'Labs', subtitle: 'Hands-on practice', url: '#/labs', haystack: 'labs practice exercises' });
    paletteIndex.push({ type: 'Page', icon: 'GO', title: 'Command index', subtitle: 'Every command in both live levels', url: '#/commands', haystack: 'commands reference index' });
    paletteIndex.push({ type: 'Page', icon: 'GO', title: 'Broken Systems', subtitle: 'Five live incidents in the sandbox', url: '#/scenarios', haystack: 'broken systems scenarios incidents troubleshooting 2am' });
    paletteIndex.push({ type: 'Page', icon: 'PDF', title: 'Printable cheat sheets', subtitle: 'Objectives, labs, and commands for every lesson', url: '#/cheatsheets', haystack: 'print pdf cheat sheet revision commands objectives' });
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


  return { open: openPalette, close: closePalette, setup: setupPalette };
}
