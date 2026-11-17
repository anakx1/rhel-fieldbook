/* ==========================================================================
   RHEL Fieldbook — the single runtime curriculum loader.
   Lesson metadata is JSON; prose bodies are separate HTML fragments.
   No build step. The loader fetches the manifest once and shares the promise.
   ========================================================================== */

(function (root) {
  'use strict';

  var RHEL = root.RHEL = root.RHEL || {};
  var BASE = 'assets/data/lessons/';
  var pending = null;

  function fetchText(url) {
    return fetch(url, { cache: 'no-cache' }).then(function (response) {
      if (!response.ok) throw new Error('Unable to load ' + url + ' (' + response.status + ')');
      return response.text();
    });
  }

  function fetchJson(url) {
    return fetchText(url).then(function (text) {
      try { return JSON.parse(text); }
      catch (error) { throw new Error('Invalid JSON in ' + url + ': ' + error.message); }
    });
  }

  function sectionUrl(lessonId, file) {
    return BASE + encodeURIComponent(lessonId) + '/' + encodeURIComponent(file);
  }

  function attachMeta(lesson) {
    var module = RHEL.getModule(lesson.module);
    lesson.level = module && module.level ? module.level : '';
    lesson.labChecks = RHEL.labChecks || {};
    if (lesson.lab && Array.isArray(lesson.lab.steps)) {
      lesson.lab.steps.forEach(function (step, index) {
        if (step.check !== 'sandbox') return;
        var checks = (RHEL.labChecks && RHEL.labChecks[lesson.id]) || {};
        step.check = typeof checks[index] === 'function' ? checks[index] : null;
      });
    }
    return lesson;
  }

  function loadOne(id) {
    var dir = BASE + encodeURIComponent(id) + '/';
    return fetchJson(dir + 'lesson.json').then(function (lesson) {
      if (!lesson || lesson.id !== id) throw new Error('Lesson manifest does not match ' + id);
      if (!Array.isArray(lesson.sections) || !lesson.sections.length) {
        throw new Error('Lesson ' + id + ' has no sections');
      }
      return Promise.all(lesson.sections.map(function (section) {
        return fetchText(sectionUrl(id, section.file)).then(function (body) {
          section.body = body;
          return section;
        });
      })).then(function () {
        RHEL.lessons[id] = attachMeta(lesson);
        return lesson;
      });
    });
  }

  RHEL.loadCurriculum = function () {
    if (pending) return pending;
    pending = fetchJson(BASE + 'index.json').then(function (manifest) {
      if (!manifest || !Array.isArray(manifest.lessons)) {
        throw new Error('Curriculum manifest is missing its lesson list');
      }
      var missing = RHEL.lessonOrder.filter(function (id) { return manifest.lessons.indexOf(id) === -1; });
      if (missing.length) throw new Error('Manifest is missing lessons: ' + missing.join(', '));
      return Promise.all(manifest.lessons.map(loadOne)).then(function () {
        RHEL.contentLoaded = true;
        root.dispatchEvent(new CustomEvent('rhel:content-loaded'));
        return manifest.lessons.length;
      });
    }).catch(function (error) {
      pending = null;
      throw error;
    });
    return pending;
  };

  /* Synchronous installation hook used by Node tests and any embedded host. */
  RHEL.installCurriculum = function (records) {
    records.forEach(function (record) {
      RHEL.lessons[record.id] = attachMeta(record);
    });
    RHEL.contentLoaded = true;
    return records.length;
  };
})(typeof window !== 'undefined' ? window : globalThis);
