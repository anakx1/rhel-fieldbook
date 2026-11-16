/* ==========================================================================
   RHEL Fieldbook — sandbox UI, persistence, and public API
   ========================================================================== */

(function (root) {
  'use strict';

  var SB = root.RHEL_SANDBOX = root.RHEL_SANDBOX || {};
  var Machine = SB.machine;
  var Shell = SB.shell;
  var C = SB.commands;

  var el = {};
  var sys = null;
  var shell = null;

  function $(id) { return document.getElementById(id); }

  function init() {
    el.panel = $('sandbox-panel');
    el.toggle = $('sandbox-toggle');
    el.close = $('sandbox-close');
    el.form = $('sandbox-form');
    el.input = $('sandbox-input');
    el.log = $('sandbox-log');
    el.prompt = $('sandbox-prompt');
    el.title = $('sandbox-title-user');
    el.subtitle = $('sandbox-subtitle');
    el.reset = $('sandbox-reset');
    el.snapshot = $('sandbox-snapshot');
    el.restore = $('sandbox-restore');
    if (!el.panel || !el.form) return;

    sys = Machine.load() || Machine.create();
    shell = Shell.create(sys);

    el.toggle.addEventListener('click', openSandbox);
    el.close.addEventListener('click', closeSandbox);
    el.form.addEventListener('submit', function (event) {
      event.preventDefault();
      var value = el.input.value;
      if (!value.trim()) return;
      el.input.value = '';
      execute(value);
    });
    el.input.addEventListener('keydown', onInputKeydown);
    document.addEventListener('keydown', function (event) {
      if ((event.ctrlKey || event.metaKey) && event.key === '`') {
        event.preventDefault();
        if (el.panel.classList.contains('is-open')) closeSandbox();
        else openSandbox();
      }
      if (event.key === 'Escape' && el.panel.classList.contains('is-open')) closeSandbox();
    });
    if (el.reset) el.reset.addEventListener('click', resetSandbox);
    if (el.snapshot) el.snapshot.addEventListener('click', snapshotSandbox);
    if (el.restore) el.restore.addEventListener('click', restoreSandbox);

    boot();
    updateControls();
  }

  function boot() {
    append('RHEL Fieldbook sandbox · stateful simulated shell', 'out bright');
    append('rhel-lab · RHEL 9.5 · state saved in this browser', 'out');
    append('Type "help" for supported commands. Files, users, services, and packages persist.', 'out');
    append('', 'out');
    updatePrompt();
  }

  function openSandbox() {
    if (!el.panel) return;
    document.body.classList.add('sandbox-open');
    el.panel.classList.add('is-open');
    el.panel.setAttribute('aria-hidden', 'false');
    el.toggle.setAttribute('aria-expanded', 'true');
    root.setTimeout(function () { el.input.focus(); }, 160);
  }

  function closeSandbox() {
    if (!el.panel) return;
    document.body.classList.remove('sandbox-open');
    el.panel.classList.remove('is-open');
    el.panel.setAttribute('aria-hidden', 'true');
    el.toggle.setAttribute('aria-expanded', 'false');
  }

  function append(text, className) {
    var line = document.createElement('div');
    line.className = 'sandbox-line ' + (className || 'out');
    line.textContent = text === '' ? '\u00a0' : text;
    el.log.appendChild(line);
    el.log.scrollTop = el.log.scrollHeight;
  }

  function appendCommand(prompt, command) {
    var line = document.createElement('div');
    line.className = 'sandbox-line cmd';
    var ps = document.createElement('span');
    ps.className = 'sandbox-ps';
    ps.textContent = prompt + ' ';
    line.appendChild(ps);
    line.appendChild(document.createTextNode(command));
    el.log.appendChild(line);
    el.log.scrollTop = el.log.scrollHeight;
  }

  function appendOutput(text, error) {
    if (text === null || text === undefined || text === '') return;
    String(text).replace(/\n$/, '').split('\n').forEach(function (line) {
      append(line, error ? 'out red' : 'out');
    });
  }

  function updatePrompt() {
    var home = sys.env.HOME || '/home/student';
    var cwd = sys.cwd === home ? '~' : (sys.cwd.indexOf(home + '/') === 0 ? '~' + sys.cwd.slice(home.length) : sys.cwd);
    var sigil = sys.sessionUser === 'root' ? '#' : '$';
    var text = sys.sessionUser + '@' + sys.hostname + ':' + cwd + sigil;
    el.prompt.textContent = text;
    if (el.title) el.title.textContent = sys.sessionUser + '@' + sys.hostname;
  }

  function updateControls() {
    if (el.restore) {
      var available = Machine.hasSnapshot();
      el.restore.disabled = !available;
      el.restore.title = available ? 'Restore the saved snapshot' : 'No snapshot saved yet';
    }
  }

  function save() {
    Machine.save(sys);
    updateControls();
    try {
      document.dispatchEvent(new root.CustomEvent('rhel:sandbox-change', { detail: { sys: sys } }));
    } catch (e) { /* older browsers without CustomEvent constructor */ }
  }

  function execute(raw) {
    var command = String(raw || '').trim();
    if (!command) return;
    var prompt = el.prompt.textContent;
    appendCommand(prompt, command);
    var result = shell.run(command);
    if (result.action === 'clear') {
      el.log.innerHTML = '';
      updatePrompt();
      save();
      return;
    }
    if (result.action === 'close') {
      append('Sandbox session is persistent. Use the close button to hide the panel.', 'out amber');
      updatePrompt();
      save();
      return;
    }
    appendOutput(result.stdout, false);
    appendOutput(result.stderr, true);
    updatePrompt();
    save();
  }

  function replaceCurrentToken(line, cursor, start, replacement, trailingSpace) {
    var before = line.slice(0, start);
    var after = line.slice(cursor);
    var suffix = trailingSpace ? ' ' : '';
    var next = before + replacement + suffix + after;
    var position = (before + replacement + suffix).length;
    el.input.value = next;
    el.input.setSelectionRange(position, position);
  }

  function onInputKeydown(event) {
    if (event.key === 'Tab') {
      event.preventDefault();
      var completion = shell.completion(el.input.value, el.input.selectionStart);
      if (!completion || !completion.candidates.length) return;
      if (completion.candidates.length === 1) {
        var candidate = completion.candidates[0];
        var isDirectory = candidate.charAt(candidate.length - 1) === '/';
        replaceCurrentToken(el.input.value, completion.end, completion.start, candidate, !isDirectory);
        return;
      }
      if (completion.common && completion.common.length > completion.prefix.length) {
        replaceCurrentToken(el.input.value, completion.end, completion.start, completion.common, false);
        return;
      }
      appendCommand(el.prompt.textContent, el.input.value);
      append(completion.candidates.join('  '), 'out cyan');
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (!sys.history.length) return;
      var index = shell.historyIndex === undefined ? sys.history.length : shell.historyIndex;
      index = Math.max(0, index - 1);
      shell.historyIndex = index;
      el.input.value = sys.history[index] || '';
      el.input.setSelectionRange(el.input.value.length, el.input.value.length);
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      var current = shell.historyIndex === undefined ? sys.history.length : shell.historyIndex;
      current = Math.min(sys.history.length, current + 1);
      shell.historyIndex = current;
      el.input.value = sys.history[current] || '';
      el.input.setSelectionRange(el.input.value.length, el.input.value.length);
    }
  }

  function resetSandbox() {
    var confirmed = true;
    if (typeof root.confirm === 'function') {
      confirmed = root.confirm('Reset the sandbox machine? Users, files, services, and packages will return to the original seed.');
    }
    if (!confirmed) return;
    sys = Machine.reset();
    shell = Shell.create(sys);
    el.log.innerHTML = '';
    boot();
    save();
  }

  function snapshotSandbox() {
    var saved = Machine.snapshot(sys);
    append(saved ? 'Snapshot saved.' : 'Could not save a snapshot in this browser.', saved ? 'out green' : 'out amber');
    updateControls();
  }

  function restoreSandbox() {
    var restored = Machine.restore();
    if (!restored) {
      append('No snapshot is available to restore.', 'out amber');
      updateControls();
      return;
    }
    sys = restored;
    shell = Shell.create(sys);
    Machine.save(sys);
    el.log.innerHTML = '';
    boot();
    append('Snapshot restored.', 'out green');
    save();
  }

  root.openSandbox = openSandbox;
  root.closeSandbox = closeSandbox;
  root.tryInSandbox = function (command) {
    openSandbox();
    el.input.value = command;
    root.setTimeout(function () {
      el.input.focus();
      el.input.setSelectionRange(command.length, command.length);
    }, 180);
  };

  SB.getSystem = function () { return sys; };
  SB.getShell = function () { return shell; };
  SB.reset = resetSandbox;
  SB.snapshot = snapshotSandbox;
  SB.restore = restoreSandbox;
  SB.help = function () { return C.run(shell.context(), 'help', [], ''); };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})(typeof window !== 'undefined' ? window : globalThis);
