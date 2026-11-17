/* ==========================================================================
   RHEL Fieldbook — hash router
   Parses the SPA route, updates navigation state, and owns document titles.
   ========================================================================== */

import { store } from './state.js';

export function parseRoute() {
  const raw = location.hash.replace(/^#/, '');
  if (!raw || raw === '/') return { name: 'home' };
  const parts = raw.replace(/^\//, '').split('/').filter(Boolean);
  const name = parts[0] || 'home';
  if (name === 'lesson') return { name: 'lesson', id: parts[1] || '', section: parts[2] || '' };
  if (name === 'scenarios') return { name: 'scenarios', id: parts[1] || '' };
  if (name === 'review') return { name: 'review', section: parts[1] || '' };
  if (name === 'exam') return { name: 'exam', section: parts[1] || '' };
  if (name === 'mastery') return { name: 'mastery' };
  if (['learn', 'roadmap', 'labs', 'commands', 'cheatsheets'].includes(name)) return { name };
  return { name: 'notfound' };
}

export function setActiveNav(name) {
  const activeNav = name === 'lesson' ? 'learn' : name === 'mastery' ? 'review' : name === 'cheatsheets' ? 'roadmap' : name;
  document.querySelectorAll('[data-nav]').forEach((link) => {
    link.classList.toggle('is-active', link.getAttribute('data-nav') === activeNav);
    if (link.getAttribute('data-nav') === activeNav) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
}

export function setTitle(route) {
  const RHEL = window.RHEL;
  const state = store.state;
  let title = 'RHEL Fieldbook — From first prompt to production';
  if (route.name === 'learn') title = 'Curriculum · RHEL Fieldbook';
  if (route.name === 'labs') title = 'Labs · RHEL Fieldbook';
  if (route.name === 'commands') title = 'Command index · RHEL Fieldbook';
  if (route.name === 'roadmap') title = 'The full path · RHEL Fieldbook';
  if (route.name === 'cheatsheets') title = 'Printable cheat sheets · RHEL Fieldbook';
  if (route.name === 'scenarios') {
    const scenario = route.id ? RHEL.scenarios.find(route.id) : null;
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
    const lesson = RHEL.getLesson(route.id);
    if (lesson) title = lesson.title + ' · RHEL Fieldbook';
  }
  if (route.name === 'notfound') title = 'Not found · RHEL Fieldbook';
  document.title = title;
}
