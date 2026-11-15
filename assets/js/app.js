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

  var DEFAULT_STATE = {
    version: 1,
    theme: 'light',
    completedLessons: [],
    objectives: {},
    labSteps: {},
    quiz: {},
    quizVersion: 2,
    labsDone: [],
    lastLesson: null,
    lastVisit: null
  };

  var state = loadState();

  /* ------------------------------------------------------------------------
     Utilities
     ------------------------------------------------------------------------ */

  function loadState() {
    var loaded;
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      loaded = raw ? Object.assign({}, DEFAULT_STATE, JSON.parse(raw)) : Object.assign({}, DEFAULT_STATE);
    } catch (e) {
      loaded = Object.assign({}, DEFAULT_STATE);
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
    var s = Object.assign({}, DEFAULT_STATE, input || {});
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
    s.quizVersion = 2;
    return s;
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
            <div class="terminal-foot"><span>read-only practice shell</span><span>● connected</span></div>
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

      <section class="section shell">
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
            <div class="faq-answer"><p>The terminal sandbox is simulated and read-only. Commands shown in lessons are real RHEL commands; some change users, services, storage, or security settings. Run them only in a lab VM you can rebuild, and never paste a destructive command without reading it first.</p></div>
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
    var labDoneCount = lesson.lab.steps.filter(function (_, i) { return !!labSteps[i]; }).length;
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
      var done = !!labSteps[i];
      return `<li class="lab-item ${done ? 'is-checked' : ''}">
        <div class="lab-item-check"><input type="checkbox" data-lab-step data-lesson="${id}" data-index="${i}" aria-label="Mark lab step ${i + 1} complete" ${done ? 'checked' : ''}></div>
        <div class="lab-item-body">
          <p>${esc(step.text)}</p>
          ${step.cmd ? '<pre>' + esc(rawCmd(step.cmd)) + '</pre>' : ''}
          ${step.verify ? '<span class="verify">' + esc(step.verify) + '</span>' : ''}
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
              <div class="rail-stat"><span>Lab steps</span><strong>${labDoneCount}/${lesson.lab.steps.length}</strong></div>
              <div class="rail-progress"><span style="width:${labPct}%"></span></div>
              <div class="rail-stat"><span>Status</span><strong>${isComplete(id) ? 'Complete' : 'In progress'}</strong></div>
            </div>
            <div class="rail-block">
              <p class="rail-note">Commands here are real. Practice them in a disposable RHEL VM. The sandbox is simulated and read-only.</p>
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
    if (['learn', 'roadmap', 'labs', 'commands'].indexOf(name) !== -1) {
      return { name: name };
    }
    return { name: 'notfound' };
  }

  function setActiveNav(name) {
    activeNav = name === 'lesson' ? 'learn' : name;
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
    var html;
    if (route.name === 'home') html = viewHome();
    else if (route.name === 'learn') html = viewLearn();
    else if (route.name === 'labs') html = viewLabs();
    else if (route.name === 'commands') html = viewCommands();
    else if (route.name === 'roadmap') html = viewRoadmap();
    else if (route.name === 'lesson') html = viewLesson(route.id, route.section);
    else html = viewNotFound();

    app.innerHTML = html;
    setActiveNav(route.name);
    setTitle(route);
    updateProgressUI();
    enhanceCodeBlocks();

    if (route.name === 'lesson' && RHEL.getLesson(route.id)) {
      state.lastLesson = route.id;
      state.lastVisit = new Date().toISOString();
      saveState();
    }

    if (route.name === 'labs') setupLabFilters();
    if (route.name === 'commands') setupCommandFilters();

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
    var steps = state.labSteps[id] || [];
    var count = steps.filter(Boolean).length;
    var pct = Math.round((count / lesson.lab.steps.length) * 100);
    document.querySelectorAll('[data-lab-progress="' + id + '"]').forEach(function (el) {
      el.innerHTML = '<span>' + count + '</span> / ' + lesson.lab.steps.length + ' steps · ' + pct + '%';
    });
    var bars = document.querySelectorAll('.rail-card .rail-progress span');
    if (bars && bars.length > 1) bars[1].style.width = pct + '%';
    return { count: count, total: lesson.lab.steps.length, pct: pct };
  }

  function handleLabStep(input) {
    var id = input.getAttribute('data-lesson');
    var index = parseInt(input.getAttribute('data-index'), 10);
    var arr = (state.labSteps[id] || []).slice();
    arr[index] = input.checked;
    state.labSteps[id] = arr;
    var item = input.closest('.lab-item');
    if (item) item.classList.toggle('is-checked', input.checked);
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
      lastVisit: state.lastVisit || null
    };
  }

  function exportProgress() {
    var payload = {
      app: 'RHEL Fieldbook',
      schema: 2,
      quizVersion: 2,
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
      if (parsed.schema !== undefined && parsed.schema !== 1 && parsed.schema !== 2) {
        throw new Error('Unsupported progress file version.');
      }
      progress = parsed.progress;
    }
    if (!isPlainObject(progress)) throw new Error('The progress payload is missing.');

    var recognized = ['completedLessons', 'objectives', 'labSteps', 'quiz', 'labsDone', 'lastLesson', 'lastVisit'];
    var hasProgress = recognized.some(function (key) { return progress[key] !== undefined; });
    if (!hasProgress) throw new Error('No progress fields were found in this file.');

    var out = {
      completedLessons: [],
      objectives: {},
      labSteps: {},
      quiz: {},
      labsDone: [],
      lastLesson: null,
      lastVisit: null
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
        state = Object.assign({}, state, imported, { quizVersion: 2 });
        saveState();
        commandCache = null;
        renderRoute();
        showToast('<strong>Progress imported.</strong> ' + imported.completedLessons.length + ' lessons and ' + imported.labsDone.length + ' labs restored.');
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
    if (!window.confirm('Reset all lesson, objective, and lab progress on this device? This cannot be undone.')) return;
    var theme = state.theme;
    state = Object.assign({}, DEFAULT_STATE, { theme: theme });
    saveState();
    commandCache = null;
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
    paletteIndex.push({ type: 'Page', icon: 'GO', title: 'Curriculum', subtitle: 'Level 01 · sixteen lessons', url: '#/learn', haystack: 'curriculum lessons foundations level 01' });
    paletteIndex.push({ type: 'Page', icon: 'GO', title: 'The full path', subtitle: 'Five levels, zero to production', url: '#/roadmap', haystack: 'roadmap path levels production rhcsa rhce rhca' });
    paletteIndex.push({ type: 'Page', icon: 'GO', title: 'Labs', subtitle: 'Hands-on practice', url: '#/labs', haystack: 'labs practice exercises' });
    paletteIndex.push({ type: 'Page', icon: 'GO', title: 'Command index', subtitle: 'Every command in Level 01', url: '#/commands', haystack: 'commands reference index' });
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
      var paletteItem = e.target.closest('.palette-item');
      if (paletteItem) closePalette();
    });

    document.addEventListener('change', function (e) {
      if (e.target.matches('[data-objective]')) handleObjective(e.target);
      if (e.target.matches('[data-lab-step]')) handleLabStep(e.target);
      if (e.target.matches('[data-import-file]')) {
        var file = e.target.files && e.target.files[0];
        e.target.value = '';
        importProgressFile(file);
      }
    });

    window.addEventListener('hashchange', function () { renderRoute(); });
  }

  /* ------------------------------------------------------------------------
     Boot
     ------------------------------------------------------------------------ */

  applyTheme(state.theme);
  setupHeader();
  setupPalette();
  setupEvents();
  history.scrollRestoration = 'manual';
  renderRoute();
})();

