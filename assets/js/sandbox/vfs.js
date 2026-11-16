/* ==========================================================================
   RHEL Fieldbook — sandbox virtual filesystem and permission engine
   Pure helpers. No DOM. Safe to load in Node for tests.
   ========================================================================== */

(function (root) {
  'use strict';

  var SB = root.RHEL_SANDBOX = root.RHEL_SANDBOX || {};
  var VFS = SB.vfs = {};

  function now() { return Date.now(); }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function normalize(path, cwd, user, sys) {
    if (path === undefined || path === null || path === '') path = cwd || '/';
    path = String(path);

    if (path.charAt(0) === '~') {
      var slash = path.indexOf('/');
      var name = slash === -1 ? path.slice(1) : path.slice(1, slash);
      var rest = slash === -1 ? '' : path.slice(slash);
      var home = null;
      if (!name) {
        home = (user && user.home) || (sys && sys.env && sys.env.HOME) || '/home/student';
      } else if (sys && sys.users && sys.users[name]) {
        home = sys.users[name].home;
      }
      if (home) path = home + rest;
    }

    var absolute = path.charAt(0) === '/';
    var base = absolute ? path : (cwd || '/') + '/' + path;
    var parts = base.split('/');
    var out = [];
    for (var i = 0; i < parts.length; i++) {
      var part = parts[i];
      if (!part || part === '.') continue;
      if (part === '..') {
        if (out.length) out.pop();
      } else {
        out.push(part);
      }
    }
    return '/' + out.join('/');
  }

  function dirname(path) {
    path = String(path || '/');
    if (path === '/') return '/';
    var index = path.lastIndexOf('/');
    return index <= 0 ? '/' : path.slice(0, index);
  }

  function basename(path) {
    path = String(path || '/');
    if (path === '/') return '/';
    return path.slice(path.lastIndexOf('/') + 1);
  }

  function typeChar(node) {
    if (!node) return '?';
    if (node.type === 'dir') return 'd';
    if (node.type === 'link') return 'l';
    if (node.type === 'block') return 'b';
    if (node.type === 'char') return 'c';
    return '-';
  }

  function modeString(node) {
    if (!node) return '----------';
    var mode = node.mode || 0;
    var out = typeChar(node);
    function bit(mask, ch) { return (mode & mask) ? ch : '-'; }
    out += bit(256, 'r') + bit(128, 'w');
    out += (mode & 64) ? ((mode & 2048) ? 's' : 'x') : ((mode & 2048) ? 'S' : '-');
    out += bit(32, 'r') + bit(16, 'w');
    out += (mode & 8) ? ((mode & 1024) ? 's' : 'x') : ((mode & 1024) ? 'S' : '-');
    out += bit(4, 'r') + bit(2, 'w');
    out += (mode & 1) ? ((mode & 512) ? 't' : 'x') : ((mode & 512) ? 'T' : '-');
    return out;
  }

  function octalString(mode) {
    var value = (mode || 0) & 4095;
    var text = value.toString(8);
    while (text.length < 4) text = '0' + text;
    return text;
  }

  function parseOctal(text) {
    var value = String(text || '').trim();
    if (!/^[0-7]{1,4}$/.test(value)) return null;
    var parsed = parseInt(value, 8);
    return isFinite(parsed) ? parsed & 4095 : null;
  }

  function parseSymbolic(mode, spec) {
    mode = mode || 0;
    var clauses = String(spec || '').split(',');
    for (var c = 0; c < clauses.length; c++) {
      var clause = clauses[c].trim();
      if (!clause) continue;
      var match = /^([ugoa]*)([+\-=])([rwxXst]+)$/.exec(clause);
      if (!match) return null;
      var who = match[1] || 'a';
      var op = match[2];
      var perms = match[3];
      var masks = { u: 0, g: 0, o: 0 };
      if (who.indexOf('a') !== -1 || who === '') {
        masks.u = 1; masks.g = 1; masks.o = 1;
      } else {
        if (who.indexOf('u') !== -1) masks.u = 1;
        if (who.indexOf('g') !== -1) masks.g = 1;
        if (who.indexOf('o') !== -1) masks.o = 1;
      }

      var bits = 0;
      for (var p = 0; p < perms.length; p++) {
        var ch = perms.charAt(p);
        if (ch === 'r') bits |= 4;
        else if (ch === 'w') bits |= 2;
        else if (ch === 'x' || (ch === 'X' && (mode & 73 || false))) bits |= 1;
        else if (ch === 's') {
          if (masks.u) mode = (mode | 2048);
          if (masks.g) mode = (mode | 1024);
        } else if (ch === 't') {
          mode = (mode | 512);
        }
      }

      if (op === '=') {
        if (masks.u) mode &= ~(7 << 6);
        if (masks.g) mode &= ~(7 << 3);
        if (masks.o) mode &= ~7;
      }
      if (masks.u) mode = (op === '-' ? (mode & ~(bits << 6)) : (mode | (bits << 6)));
      if (masks.g) mode = (op === '-' ? (mode & ~(bits << 3)) : (mode | (bits << 3)));
      if (masks.o) mode = (op === '-' ? (mode & ~bits) : (mode | bits));
    }
    return mode & 4095;
  }

  function parseMode(spec, current) {
    if (spec === undefined) return null;
    var text = String(spec);
    if (/^[0-7]{1,4}$/.test(text)) return parseOctal(text);
    return parseSymbolic(current || 0, text);
  }

  function userGids(sys, user) {
    var gids = [];
    if (!user) return gids;
    if (gids.indexOf(user.gid) === -1) gids.push(user.gid);
    var groups = sys.groups || {};
    Object.keys(groups).forEach(function (name) {
      var group = groups[name];
      if (group.members && group.members.indexOf(user.name) !== -1 && gids.indexOf(group.gid) === -1) {
        gids.push(group.gid);
      }
    });
    (user.groups || []).forEach(function (name) {
      var group = groups[name];
      if (group && gids.indexOf(group.gid) === -1) gids.push(group.gid);
    });
    return gids;
  }

  function groupByName(sys, name) {
    return (sys.groups && sys.groups[name]) || null;
  }

  function userByName(sys, name) {
    return (sys.users && sys.users[name]) || null;
  }

  function aclAllows(sys, node, user, action) {
    var bit = action === 'r' ? 'r' : action === 'w' ? 'w' : action === 'x' ? 'x' : '';
    if (!bit || !node || !node.acl) return false;
    var gids = userGids(sys, user);
    for (var i = 0; i < node.acl.length; i++) {
      var entry = node.acl[i];
      if (entry.perms.indexOf(bit) === -1) continue;
      if (entry.type === 'user' && entry.name === user.name) return true;
      if (entry.type === 'group') {
        var group = groupByName(sys, entry.name);
        if (group && gids.indexOf(group.gid) !== -1) return true;
      }
    }
    return false;
  }

  function canAccessNode(sys, user, node, action) {
    if (!node || !user) return false;
    if (action === 'x' && user.name === 'root') {
      if (node.type === 'dir') return true;
      return (node.mode & 73) !== 0;
    }
    if (user.name === 'root') return true;

    var bit = action === 'r' ? 4 : action === 'w' ? 2 : action === 'x' ? 1 : 0;
    if (!bit) return true;
    var allowed = false;
    if (node.uid === user.uid) allowed = (node.mode & (bit << 6)) !== 0;
    else if (userGids(sys, user).indexOf(node.gid) !== -1) allowed = (node.mode & (bit << 3)) !== 0;
    else allowed = (node.mode & bit) !== 0;
    if (!allowed && aclAllows(sys, node, user, action)) allowed = true;
    return allowed;
  }

  function resolve(sys, rawPath, cwd, user, followFinal, depth) {
    depth = depth || 0;
    if (depth > 24) return { error: 'Too many levels of symbolic links', path: rawPath };
    var path = normalize(rawPath, cwd, user, sys);
    if (path === '/') return { path: '/', node: sys.fs['/'] };
    if (!sys.fs || !sys.fs[path] && path !== '/') {
      // Walk below so the error can identify the missing component.
    }
    var parts = path.split('/').filter(Boolean);
    var cur = '';
    for (var i = 0; i < parts.length; i++) {
      cur += '/' + parts[i];
      var node = sys.fs[cur];
      if (!node) return { error: 'No such file or directory', path: cur };
      if (node.type === 'link' && (followFinal || i < parts.length - 1)) {
        var target = normalize(node.target, dirname(cur), user, sys);
        var rest = parts.slice(i + 1).join('/');
        var combined = rest ? target + '/' + rest : target;
        return resolve(sys, combined, '/', user, followFinal, depth + 1);
      }
      if (i < parts.length - 1 && node.type !== 'dir') {
        return { error: 'Not a directory', path: cur, node: node };
      }
    }
    return { path: cur, node: sys.fs[cur] };
  }

  function access(sys, user, rawPath, cwd, action) {
    var found = resolve(sys, rawPath, cwd, user, true);
    if (found.error) {
      return { ok: false, message: found.error, path: found.path, node: found.node || null };
    }
    var parts = found.path.split('/').filter(Boolean);
    var cur = '';
    for (var i = 0; i < parts.length - 1; i++) {
      cur += '/' + parts[i];
      var parent = sys.fs[cur];
      if (parent && parent.type === 'dir' && !canAccessNode(sys, user, parent, 'x')) {
        return { ok: false, message: 'Permission denied', path: found.path, node: found.node };
      }
    }
    if (action) {
      if (action === 'r' && found.node.type === 'dir') {
        if (!canAccessNode(sys, user, found.node, 'r') || !canAccessNode(sys, user, found.node, 'x')) {
          return { ok: false, message: 'Permission denied', path: found.path, node: found.node };
        }
      } else if (!canAccessNode(sys, user, found.node, action)) {
        return { ok: false, message: 'Permission denied', path: found.path, node: found.node };
      }
    }
    return { ok: true, path: found.path, node: found.node };
  }

  function parentInfo(sys, user, rawPath, cwd, write) {
    var path = normalize(rawPath, cwd, user, sys);
    if (path === '/') return { ok: false, message: 'Cannot modify /', path: path };
    var parent = dirname(path);
    var resolved = access(sys, user, parent, '/', 'x');
    if (!resolved.ok) return resolved;
    if (write && !canAccessNode(sys, user, resolved.node, 'w')) {
      return { ok: false, message: 'Permission denied', path: path, parent: parent };
    }
    return {
      ok: true,
      path: path,
      parent: parent,
      name: basename(path),
      parentNode: resolved.node,
      existing: sys.fs[path] || null
    };
  }

  function contextType(sys, path) {
    var selinux = sys.selinux || {};
    if (selinux.mode === 'disabled') return 'default_t';
    var custom = selinux.fcontexts || [];
    for (var i = custom.length - 1; i >= 0; i--) {
      try {
        if (new RegExp('^' + custom[i].pattern + '$').test(path)) return custom[i].type;
      } catch (e) {}
    }
    var defaults = [
      [/^\/var\/www(\/.*)?$/, 'httpd_sys_content_t'],
      [/^\/etc\/httpd(\/.*)?$/, 'httpd_config_t'],
      [/^\/var\/log(\/.*)?$/, 'var_log_t'],
      [/^\/var\/lib(\/.*)?$/, 'var_lib_t'],
      [/^\/home(\/.*)?$/, 'user_home_t'],
      [/^\/root(\/.*)?$/, 'admin_home_t'],
      [/^\/etc(\/.*)?$/, 'etc_t'],
      [/^\/usr\/bin(\/.*)?$/, 'bin_t'],
      [/^\/usr\/sbin(\/.*)?$/, 'bin_t'],
      [/^\/usr(\/.*)?$/, 'usr_t'],
      [/^\/tmp(\/.*)?$/, 'tmp_t'],
      [/^\/dev(\/.*)?$/, 'device_t'],
      [/^\/mnt(\/.*)?$/, 'mnt_t'],
      [/^\/srv(\/.*)?$/, 'var_t'],
      [/^\/boot(\/.*)?$/, 'boot_t']
    ];
    for (var j = 0; j < defaults.length; j++) {
      if (defaults[j][0].test(path)) return defaults[j][1];
    }
    return 'default_t';
  }

  function contextString(node) {
    return 'system_u:object_r:' + ((node && node.context) || 'default_t') + ':s0';
  }

  function globToRegExp(pattern, ignoreCase) {
    var text = String(pattern || '');
    var re = '^';
    for (var i = 0; i < text.length; i++) {
      var ch = text.charAt(i);
      if (ch === '*') re += '.*';
      else if (ch === '?') re += '.';
      else if (ch === '[') {
        var close = text.indexOf(']', i + 1);
        if (close === -1) re += '\\[';
        else {
          re += text.slice(i, close + 1);
          i = close;
        }
      } else {
        re += ch.replace(/[.+^${}()|\\]/g, '\\$&');
      }
    }
    re += '$';
    try {
      return new RegExp(re, ignoreCase ? 'i' : '');
    } catch (e) {
      return new RegExp('^' + text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', ignoreCase ? 'i' : '');
    }
  }

  function sizeOf(node) {
    if (!node) return 0;
    if (node.type === 'dir') return 4096;
    if (node.size !== undefined && node.size !== null) return node.size;
    return node.content ? node.content.length : 0;
  }

  function childrenOf(sys, path) {
    var prefix = path === '/' ? '/' : path + '/';
    var names = [];
    Object.keys(sys.fs).forEach(function (candidate) {
      if (candidate === path) return;
      if (candidate.indexOf(prefix) !== 0) return;
      var rest = candidate.slice(prefix.length);
      if (rest && rest.indexOf('/') === -1) names.push(candidate);
    });
    names.sort();
    return names;
  }

  function ownerName(sys, uid) {
    var names = Object.keys(sys.users || {});
    for (var i = 0; i < names.length; i++) {
      if (sys.users[names[i]].uid === uid) return names[i];
    }
    return String(uid);
  }

  function groupName(sys, gid) {
    var names = Object.keys(sys.groups || {});
    for (var i = 0; i < names.length; i++) {
      if (sys.groups[names[i]].gid === gid) return names[i];
    }
    return String(gid);
  }

  function homeFor(sys, userName) {
    var user = userByName(sys, userName);
    return user ? user.home : '/';
  }

  VFS.now = now;
  VFS.clone = clone;
  VFS.normalize = normalize;
  VFS.dirname = dirname;
  VFS.basename = basename;
  VFS.typeChar = typeChar;
  VFS.modeString = modeString;
  VFS.octalString = octalString;
  VFS.parseOctal = parseOctal;
  VFS.parseSymbolic = parseSymbolic;
  VFS.parseMode = parseMode;
  VFS.userGids = userGids;
  VFS.userByName = userByName;
  VFS.groupByName = groupByName;
  VFS.canAccessNode = canAccessNode;
  VFS.resolve = resolve;
  VFS.access = access;
  VFS.parentInfo = parentInfo;
  VFS.contextType = contextType;
  VFS.contextString = contextString;
  VFS.globToRegExp = globToRegExp;
  VFS.sizeOf = sizeOf;
  VFS.childrenOf = childrenOf;
  VFS.ownerName = ownerName;
  VFS.groupName = groupName;
  VFS.homeFor = homeFor;
})(typeof window !== 'undefined' ? window : globalThis);
