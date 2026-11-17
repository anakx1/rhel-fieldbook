#!/usr/bin/env node
/* Generate the offline service-worker cache list and content-hash version.
   No dependencies: walk the deployable tree, sha256 every file, then write
   sw.js with a stable, reproducible CACHE name. */

'use strict';

var fs = require('fs');
var path = require('path');
var crypto = require('crypto');

var ROOT = path.resolve(__dirname, '..');
var IGNORE_DIRS = new Set(['.git', 'node_modules', 'tests', 'scripts', 'test-results', 'playwright-report', '.github']);
var IGNORE_FILES = new Set(['sw.js', 'package-lock.json']);

function hashFile(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function walk(dir, base, files) {
  fs.readdirSync(dir, { withFileTypes: true })
    .sort(function (a, b) { return a.name.localeCompare(b.name); })
    .forEach(function (entry) {
      if (entry.name.startsWith('.')) return;
      var absolute = path.join(dir, entry.name);
      var relative = path.join(base, entry.name).split(path.sep).join('/');
      if (entry.isDirectory()) {
        if (!IGNORE_DIRS.has(entry.name)) walk(absolute, relative, files);
        return;
      }
      if (!entry.isFile() || IGNORE_FILES.has(entry.name)) return;
      files.push({ path: relative, hash: hashFile(absolute) });
    });
}

var files = [];
[
  ['index.html', 'index.html'],
  ['manifest.webmanifest', 'manifest.webmanifest']
].forEach(function (pair) {
  var absolute = path.join(ROOT, pair[0]);
  if (fs.existsSync(absolute)) files.push({ path: pair[1], hash: hashFile(absolute) });
});
walk(path.join(ROOT, 'assets'), 'assets', files);

files.sort(function (a, b) {
  if (a.path === 'index.html') return -1;
  if (b.path === 'index.html') return 1;
  return a.path.localeCompare(b.path);
});

var digest = crypto.createHash('sha256');
files.forEach(function (file) { digest.update(file.path + '\0' + file.hash + '\n'); });
var version = digest.digest('hex').slice(0, 12);
var cacheName = 'rhel-fieldbook-' + version;
var core = ['./'].concat(files.map(function (file) { return './' + file.path; }));

var worker = `/* RHEL Fieldbook — generated offline cache. Run "node scripts/build-sw.js" after editing assets. */
const CACHE = '${cacheName}';
const CORE = ${JSON.stringify(core, null, 2)};

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(CORE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => caches.match(request).then((hit) => hit || caches.match('./index.html')))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((hit) => {
      if (hit) return hit;
      return fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      });
    })
  );
});
`;

fs.writeFileSync(path.join(ROOT, 'sw.js'), worker);
console.log('sw.js generated · ' + cacheName + ' · ' + files.length + ' files');
