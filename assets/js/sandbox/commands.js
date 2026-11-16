/* ==========================================================================
   RHEL Fieldbook — sandbox command registry and shared helpers
   ========================================================================== */

(function (root) {
  'use strict';

  var SB = root.RHEL_SANDBOX = root.RHEL_SANDBOX || {};
  var VFS = SB.vfs;
  var Machine = SB.machine;
  var C = SB.commands = SB.commands || {};

  var registry = {};

  function ok(stdout, code) {
    return { stdout: stdout || '', stderr: '', code: code === undefined ? 0 : code };
  }

  function fail(message, code) {
    return { stdout: '', stderr: message ? String(message).replace(/\n?$/, '\n') : '', code: code === undefined ? 1 : code };
  }

  function both(stdout, stderr, code) {
    return { stdout: stdout || '', stderr: stderr || '', code: code === undefined ? 0 : code };
  }

  function register(names, fn) {
    names = Array.isArray(names) ? names : [names];
    names.forEach(function (name) { registry[name] = fn; });
  }

  function run(ctx, name, args, stdin) {
    if (!Object.prototype.hasOwnProperty.call(registry, name)) {
      return fail('bash: ' + name + ': command not found', 127);
    }
    try {
      return registry[name](ctx, args || [], stdin || '');
    } catch (e) {
      return fail(name + ': ' + (e && e.message ? e.message : 'unexpected error'), 1);
    }
  }

  function names() {
    return Object.keys(registry).sort();
  }

  function isRoot(ctx) {
    return ctx.userName === 'root' || (ctx.user && ctx.user.uid === 0);
  }

  function requireRoot(ctx, message) {
    if (isRoot(ctx)) return null;
    return fail(message || 'Permission denied', 1);
  }

  function nextInode(sys) {
    sys.nextInode = (sys.nextInode || 1000) + 1;
    if (sys.nextInode < 1001) sys.nextInode = 1001;
    return sys.nextInode;
  }

  function newFileNode(sys, ctx, path, content, mode) {
    var now = new Date().toISOString();
    return {
      type: 'file',
      mode: mode === undefined ? (438 & ~(sys.umask || 18)) : mode,
      uid: ctx.user.uid,
      gid: ctx.user.gid,
      context: VFS.contextType(sys, path),
      inode: nextInode(sys),
      mtime: now,
      atime: now,
      ctime: now,
      content: content || ''
    };
  }

  function newDirNode(sys, ctx, path, mode) {
    var now = new Date().toISOString();
    return {
      type: 'dir',
      mode: mode === undefined ? 493 : mode,
      uid: ctx.user.uid,
      gid: ctx.user.gid,
      context: VFS.contextType(sys, path),
      inode: nextInode(sys),
      mtime: now,
      atime: now,
      ctime: now
    };
  }

  function readFile(ctx, rawPath) {
    var sys = ctx.sys;
    var acc = VFS.access(sys, ctx.user, rawPath, sys.cwd, 'r');
    if (!acc.ok) return { ok: false, message: acc.message, path: acc.path };
    if (acc.node.type === 'dir') return { ok: false, message: 'Is a directory', path: acc.path, node: acc.node };
    if (acc.path === '/dev/null' || acc.path === '/dev/zero') return { ok: true, content: '', path: acc.path, node: acc.node };
    return { ok: true, content: acc.node.content || '', path: acc.path, node: acc.node };
  }

  function writeFile(ctx, rawPath, data, append, mode) {
    var sys = ctx.sys;
    var resolved = VFS.resolve(sys, rawPath, sys.cwd, ctx.user, true);
    var path;
    var existing = null;

    if (!resolved.error) {
      path = resolved.path;
      existing = resolved.node;
      if (path === '/dev/null' || path === '/dev/zero') return { ok: true, path: path, node: existing };
      if (existing.type === 'dir') return { ok: false, message: 'Is a directory', path: path };
      if (!VFS.canAccessNode(sys, ctx.user, existing, 'w')) {
        return { ok: false, message: 'Permission denied', path: path };
      }
      var oldSize = VFS.sizeOf(existing);
      existing.content = append ? (existing.content || '') + String(data) : String(data);
      if (existing.size !== undefined) delete existing.size;
      existing.mtime = new Date().toISOString();
      adjustMountUsage(sys, path, VFS.sizeOf(existing) - oldSize);
      return { ok: true, path: path, node: existing };
    }

    if (resolved.message && resolved.message.indexOf('No such file') === -1) {
      return { ok: false, message: resolved.message, path: resolved.path };
    }

    var info = VFS.parentInfo(sys, ctx.user, rawPath, sys.cwd, true);
    if (!info.ok) return { ok: false, message: info.message, path: info.path };
    path = info.path;
    if (info.existing) {
      existing = info.existing;
      if (existing.type === 'dir') return { ok: false, message: 'Is a directory', path: path };
      if (!VFS.canAccessNode(sys, ctx.user, existing, 'w')) return { ok: false, message: 'Permission denied', path: path };
      var oldSize2 = VFS.sizeOf(existing);
      existing.content = append ? (existing.content || '') + String(data) : String(data);
      if (existing.size !== undefined) delete existing.size;
      existing.mtime = new Date().toISOString();
      adjustMountUsage(sys, path, VFS.sizeOf(existing) - oldSize2);
      return { ok: true, path: path, node: existing };
    }

    var node = newFileNode(sys, ctx, path, append ? String(data) : String(data), mode);
    if (info.parentNode && (info.parentNode.mode & 1024)) node.gid = info.parentNode.gid;
    sys.fs[path] = node;
    adjustMountUsage(sys, path, VFS.sizeOf(node));
    trackMountPath(sys, path);
    return { ok: true, path: path, node: node };
  }

  function removeNode(ctx, rawPath, recursive, force) {
    var sys = ctx.sys;
    var resolved = VFS.resolve(sys, rawPath, sys.cwd, ctx.user, false);
    if (resolved.error) {
      if (force) return { ok: true, missing: true };
      return { ok: false, message: resolved.message, path: resolved.path };
    }
    var path = resolved.path;
    var node = resolved.node;
    if (path === '/') return { ok: false, message: 'Cannot remove /', path: path };
    var info = VFS.parentInfo(sys, ctx.user, path, sys.cwd, true);
    if (!info.ok) return { ok: false, message: info.message, path: path };
    if (info.parentNode && (info.parentNode.mode & 512) && !isRoot(ctx) && node.uid !== ctx.user.uid) {
      return { ok: false, message: 'Operation not permitted', path: path };
    }
    if (node.type === 'dir') {
      var kids = VFS.childrenOf(sys, path);
      if (kids.length && !recursive) return { ok: false, message: 'Is a directory', path: path };
      if (kids.length) {
        for (var i = 0; i < kids.length; i++) {
          var child = removeNode(ctx, kids[i], true, force);
          if (!child.ok) return child;
        }
      }
    }
    if (node.type !== 'dir') adjustMountUsage(sys, path, -VFS.sizeOf(node));
    delete sys.fs[path];
    return { ok: true, path: path };
  }

  function copyNodeData(source) {
    var node = VFS.clone(source);
    delete node.inode;
    return node;
  }

  function copyTree(ctx, sourcePath, destPath, options) {
    var sys = ctx.sys;
    var source = VFS.resolve(sys, sourcePath, sys.cwd, ctx.user, false);
    if (source.error) return { ok: false, message: source.error, path: source.path };
    if (source.node.type === 'dir' && !options.recursive) {
      return { ok: false, message: 'omitting directory', path: source.path };
    }
    var destInfo = VFS.resolve(sys, destPath, sys.cwd, ctx.user, false);
    var finalPath = destPath;
    if (!destInfo.error && destInfo.node.type === 'dir') {
      finalPath = (destPath === '/' ? '' : destPath) + '/' + VFS.basename(source.path);
    }
    var parent = VFS.parentInfo(sys, ctx.user, finalPath, sys.cwd, true);
    if (!parent.ok) return { ok: false, message: parent.message, path: finalPath };
    if (parent.existing) {
      if (parent.existing.type === 'dir' && source.node.type !== 'dir') {
        return { ok: false, message: 'cannot overwrite directory with non-directory', path: finalPath };
      }
      if (parent.existing.type !== 'dir' && source.node.type === 'dir') {
        return { ok: false, message: 'cannot overwrite non-directory with directory', path: finalPath };
      }
    }

    var clone = copyNodeData(source.node);
    clone.inode = nextInode(sys);
    clone.mtime = new Date().toISOString();
    clone.ctime = clone.mtime;
    if (!options.preserve) {
      clone.uid = ctx.user.uid;
      clone.gid = parent.parentNode && (parent.parentNode.mode & 1024) ? parent.parentNode.gid : ctx.user.gid;
    }
    if (source.node.type === 'link') {
      clone.target = source.node.target;
    }
    var previous = sys.fs[finalPath];
    sys.fs[finalPath] = clone;
    if (source.node.type !== 'dir') {
      adjustMountUsage(sys, finalPath, VFS.sizeOf(clone) - (previous ? VFS.sizeOf(previous) : 0));
    }

    if (source.node.type === 'dir') {
      var children = VFS.childrenOf(sys, source.path);
      for (var i = 0; i < children.length; i++) {
        var childDest = (finalPath === '/' ? '' : finalPath) + '/' + VFS.basename(children[i]);
        var result = copyTree(ctx, children[i], childDest, options);
        if (!result.ok) return result;
      }
    }
    return { ok: true, path: finalPath, node: clone };
  }

  function moveTree(ctx, sourcePath, destPath) {
    var sys = ctx.sys;
    var source = VFS.resolve(sys, sourcePath, sys.cwd, ctx.user, false);
    if (source.error) return { ok: false, message: source.error, path: source.path };
    var destInfo = VFS.resolve(sys, destPath, sys.cwd, ctx.user, false);
    var finalPath = destPath;
    if (!destInfo.error && destInfo.node.type === 'dir') {
      finalPath = (destPath === '/' ? '' : destPath) + '/' + VFS.basename(source.path);
    }
    if (finalPath === source.path) return { ok: true, path: finalPath };
    if (finalPath.indexOf(source.path + '/') === 0) return { ok: false, message: 'cannot move a directory into itself', path: finalPath };
    var parent = VFS.parentInfo(sys, ctx.user, finalPath, sys.cwd, true);
    if (!parent.ok) return { ok: false, message: parent.message, path: finalPath };
    if (parent.existing) {
      if (parent.existing.type === 'dir') {
        var existingChildren = VFS.childrenOf(sys, finalPath);
        if (existingChildren.length) return { ok: false, message: 'Directory not empty', path: finalPath };
        delete sys.fs[finalPath];
      } else {
        delete sys.fs[finalPath];
      }
    }
    var node = source.node;
    var suffix = source.path === '/' ? '' : source.path;
    var keys = Object.keys(sys.fs).filter(function (key) { return key === suffix || key.indexOf(suffix + '/') === 0; });
    var moved = [];
    keys.forEach(function (key) {
      moved.push({ key: key, node: sys.fs[key] });
    });
    moved.sort(function (a, b) { return a.key.length - b.key.length; });
    moved.forEach(function (item) {
      var next = finalPath + item.key.slice(suffix.length);
      sys.fs[next] = item.node;
      delete sys.fs[item.key];
    });
    node.mtime = new Date().toISOString();
    return { ok: true, path: finalPath };
  }

  function listChildren(ctx, path) {
    var sys = ctx.sys;
    return VFS.childrenOf(sys, path).map(function (child) {
      return { path: child, name: VFS.basename(child), node: sys.fs[child] };
    });
  }

  function glob(ctx, pattern) {
    var sys = ctx.sys;
    var raw = String(pattern || '');
    var absolute = raw.charAt(0) === '/' || raw.charAt(0) === '~';
    var cwd = sys.cwd;
    var normalized = VFS.normalize(raw, cwd, ctx.user, sys);
    var segments = normalized.split('/').filter(Boolean);
    var start = '/';
    var results = ['/'];

    for (var i = 0; i < segments.length; i++) {
      var segment = segments[i];
      var hasMagic = /[*?[]/.test(segment);
      var nextResults = [];
      results.forEach(function (base) {
        if (!hasMagic) {
          nextResults.push(base === '/' ? '/' + segment : base + '/' + segment);
          return;
        }
        var acc = VFS.access(sys, ctx.user, base, '/', 'r');
        if (!acc.ok) return;
        var re = VFS.globToRegExp(segment);
        VFS.childrenOf(sys, base).forEach(function (child) {
          var name = VFS.basename(child);
          if (name.charAt(0) === '.' && segment.charAt(0) !== '.') return;
          if (re.test(name)) nextResults.push(child);
        });
      });
      results = nextResults;
      if (!results.length) break;
    }

    results = results.filter(function (path) {
      var check = VFS.resolve(sys, path, '/', ctx.user, false);
      return !check.error;
    }).sort();

    if (!absolute) {
      results = results.map(function (path) {
        if (path.indexOf(cwd + '/') === 0) return path.slice(cwd.length + 1);
        return path;
      });
    }
    return results;
  }

  function humanSize(value) {
    value = Number(value) || 0;
    var units = ['B', 'K', 'M', 'G', 'T', 'P'];
    var index = 0;
    while (value >= 1024 && index < units.length - 1) { value /= 1024; index += 1; }
    if (index === 0) return String(Math.round(value)) + 'B';
    return (value >= 10 ? value.toFixed(0) : value.toFixed(1)) + units[index];
  }

  function parseSize(text) {
    var match = /^([0-9]+(?:\.[0-9]+)?)([kKmMgGtT]?)[bB]?$/.exec(String(text || ''));
    if (!match) return null;
    var value = parseFloat(match[1]);
    var unit = match[2].toLowerCase();
    var factor = unit === 'k' ? 1024 : unit === 'm' ? 1048576 : unit === 'g' ? 1073741824 : unit === 't' ? 1099511627776 : 1;
    return Math.round(value * factor);
  }

  function formatDate(value) {
    var date = value ? new Date(value) : new Date();
    if (isNaN(date.getTime())) return 'Jan  1 00:00';
    var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    function two(n) { return n < 10 ? '0' + n : String(n); }
    return months[date.getMonth()] + ' ' + (date.getDate() < 10 ? ' ' : '') + date.getDate() + ' ' + two(date.getHours()) + ':' + two(date.getMinutes());
  }

  function splitLines(text) {
    text = String(text === undefined || text === null ? '' : text);
    if (!text) return [];
    var lines = text.split('\n');
    if (lines.length && lines[lines.length - 1] === '') lines.pop();
    return lines;
  }

  function stdinText(stdin) {
    return String(stdin === undefined || stdin === null ? '' : stdin);
  }

  function modeBits(mode) {
    return (mode || 0) & 4095;
  }

  function commandPath(sys, name) {
    if (sys.commandPaths && sys.commandPaths[name]) return sys.commandPaths[name];
    var installed = (sys.packages && sys.packages.installed) || {};
    var keys = Object.keys(installed);
    for (var i = 0; i < keys.length; i++) {
      var files = installed[keys[i]].files || [];
      for (var j = 0; j < files.length; j++) {
        if (VFS.basename(files[j]) === name) return files[j];
      }
    }
    return null;
  }

  function mountForPath(sys, path) {
    var best = null;
    (sys.mounts || []).forEach(function (mount) {
      if (!mount.target) return;
      if (path === mount.target || path.indexOf(mount.target === '/' ? '/' : mount.target + '/') === 0) {
        if (!best || mount.target.length > best.target.length) best = mount;
      }
    });
    return best;
  }

  function adjustMountUsage(sys, path, delta) {
    if (!delta) return;
    var mount = mountForPath(sys, path);
    if (!mount) return;
    mount.used = Math.max(0, (mount.used || 0) + delta);
    if (mount.size && mount.used > mount.size) mount.used = mount.size;
  }

  function trackMountPath(sys, path) {
    var mount = mountForPath(sys, path);
    if (!mount || mount.target === path) return;
    mount.created = mount.created || [];
    if (mount.created.indexOf(path) === -1) mount.created.push(path);
  }

  C.ok = ok;
  C.fail = fail;
  C.both = both;
  C.register = register;
  C.run = run;
  C.names = names;
  C.isRoot = isRoot;
  C.requireRoot = requireRoot;
  C.nextInode = nextInode;
  C.newFileNode = newFileNode;
  C.newDirNode = newDirNode;
  C.readFile = readFile;
  C.writeFile = writeFile;
  C.removeNode = removeNode;
  C.copyTree = copyTree;
  C.moveTree = moveTree;
  C.listChildren = listChildren;
  C.glob = glob;
  C.humanSize = humanSize;
  C.parseSize = parseSize;
  C.formatDate = formatDate;
  C.splitLines = splitLines;
  C.stdinText = stdinText;
  C.modeBits = modeBits;
  C.commandPath = commandPath;
  C.mountForPath = mountForPath;
  C.adjustMountUsage = adjustMountUsage;
  C.trackMountPath = trackMountPath;
})(typeof window !== 'undefined' ? window : globalThis);
