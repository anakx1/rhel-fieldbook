/* ==========================================================================
   RHEL Fieldbook — sandbox shell execution engine
   ========================================================================== */

(function (root) {
  'use strict';

  var SB = root.RHEL_SANDBOX;
  var Parser = SB.parser;
  var VFS = SB.vfs;
  var Machine = SB.machine;
  var C = SB.commands;
  var Shell = {};

  var BUILTINS = ['cd', 'export', 'unset', 'alias', 'source', '.', 'read', 'eval', 'exec'];

  function ShellInstance(sys) {
    this.sys = sys;
  }

  ShellInstance.prototype.context = function (userName) {
    var name = userName || this.sys.sessionUser;
    var user = this.sys.users[name];
    return {
      sys: this.sys,
      user: user,
      userName: name,
      cwd: this.sys.cwd,
      env: this.sys.env,
      shell: this,
      stdin: ''
    };
  };

  ShellInstance.prototype.homes = function () {
    var homes = {};
    var users = this.sys.users || {};
    Object.keys(users).forEach(function (name) { homes[name] = users[name].home; });
    return homes;
  };

  ShellInstance.prototype.expandOptions = function (ctx) {
    var self = this;
    return {
      env: ctx.env,
      lastExit: this.sys.lastExit,
      pid: 1,
      home: ctx.user.home,
      homes: this.homes(),
      runSub: function (line) { return self.runSub(line, ctx); },
      glob: function (pattern) { return C.glob(ctx, pattern); }
    };
  };

  ShellInstance.prototype.runSub = function (line, parentCtx) {
    try {
      var clone = Machine.clone(this.sys);
      var sub = new ShellInstance(clone);
      var result = sub.run(line, { history: false, capture: true });
      return result.stdout || '';
    } catch (e) {
      return '';
    }
  };

  ShellInstance.prototype.switchUser = function (name, login) {
    var user = this.sys.users[name];
    if (!user) return false;
    this.sys.sessionUser = name;
    this.sys.env.USER = name;
    this.sys.env.LOGNAME = name;
    this.sys.env.HOME = user.home;
    this.sys.env.SHELL = user.shell;
    if (login) {
      this.sys.oldCwd = this.sys.cwd;
      this.sys.cwd = user.home;
    }
    this.sys.env.OLDPWD = this.sys.oldCwd;
    this.sys.env.PWD = this.sys.cwd;
    return true;
  };

  ShellInstance.prototype.runAs = function (userName, argv, stdin, parentCtx) {
    var target = this.sys.users[userName];
    if (!target) return C.fail('sudo: unknown user ' + userName, 1);
    var child = {
      sys: this.sys,
      user: target,
      userName: userName,
      cwd: parentCtx ? parentCtx.cwd : this.sys.cwd,
      env: Object.assign({}, (parentCtx ? parentCtx.env : this.sys.env), {
        HOME: target.home,
        USER: userName,
        LOGNAME: userName,
        SHELL: target.shell
      }),
      shell: this,
      stdin: stdin || ''
    };
    if (!argv.length) return C.ok('');
    return this.executeSimple(argv, stdin || '', child);
  };

  ShellInstance.prototype.runAsLine = function (userName, line, stdin, parentCtx) {
    var target = this.sys.users[userName];
    if (!target) return C.fail('su: user ' + userName + ' does not exist', 1);
    var child = {
      sys: this.sys,
      user: target,
      userName: userName,
      cwd: parentCtx ? parentCtx.cwd : this.sys.cwd,
      env: Object.assign({}, (parentCtx ? parentCtx.env : this.sys.env), {
        HOME: target.home,
        USER: userName,
        LOGNAME: userName,
        SHELL: target.shell
      }),
      shell: this,
      stdin: stdin || ''
    };
    var oldExit = this.sys.lastExit;
    try {
      var ast = Parser.parseLine(line);
      var result = this.executeList(ast, child);
      this.sys.lastExit = result.code;
      return result;
    } catch (e) {
      return C.fail('bash: ' + (e && e.message ? e.message : 'syntax error'), 2);
    } finally {
      this.sys.lastExit = this.sys.lastExit === undefined ? oldExit : this.sys.lastExit;
    }
  };

  ShellInstance.prototype.run = function (line, options) {
    options = options || {};
    line = String(line === undefined || line === null ? '' : line);
    if (options.history !== false && line.trim()) {
      this.sys.history = this.sys.history || [];
      this.sys.history.push(line);
      if (this.sys.history.length > 200) this.sys.history.shift();
    }

    var tokens;
    var ast;
    try {
      tokens = Parser.lex(line);
      ast = Parser.parse(tokens);
    } catch (e) {
      var syntax = C.fail('bash: syntax error: ' + (e && e.message ? e.message : 'unexpected token'), 2);
      this.sys.lastExit = syntax.code;
      this.sys.env['?'] = String(syntax.code);
      return syntax;
    }

    var ctx = this.context();
    ctx.stdin = '';
    var result = this.executeList(ast, ctx);
    this.sys.lastExit = result.code;
    this.sys.env['?'] = String(result.code);
    if (options.capture) {
      // Keep only stdout for command substitution.
      return { stdout: result.stdout, stderr: '', code: result.code, action: result.action };
    }
    return result;
  };

  ShellInstance.prototype.executeList = function (list, ctx) {
    var stdout = '';
    var stderr = '';
    var code = 0;
    var action = null;
    for (var i = 0; i < list.length; i++) {
      var item = list[i];
      if (i > 0) {
        var previous = list[i - 1].connector;
        if (previous === '&&' && code !== 0) continue;
        if (previous === '||' && code === 0) continue;
      }
      var result = this.executePipeline(item.pipeline, ctx);
      stdout += result.stdout || '';
      stderr += result.stderr || '';
      code = result.code === undefined ? 0 : result.code;
      this.sys.lastExit = code;
      this.sys.env['?'] = String(code);
      if (result.action) {
        action = result.action;
        break;
      }
    }
    return { stdout: stdout, stderr: stderr, code: code, action: action };
  };

  function sameStream(a, b) {
    return a === b;
  }

  ShellInstance.prototype.openStream = function (ctx, fd, target, append, opts) {
    if (target === '/dev/null') return { type: 'null' };
    var write = C.writeFile(ctx, target, '', append);
    if (!write.ok) {
      return { error: 'bash: ' + target + ': ' + write.message };
    }
    return { type: 'file', path: write.path || target, append: true };
  };

  ShellInstance.prototype.setupStreams = function (ctx, redirects, opts) {
    var streams = { 1: { type: 'terminal', fd: 1 }, 2: { type: 'terminal', fd: 2 } };
    for (var i = 0; i < redirects.length; i++) {
      var redir = redirects[i];
      if (redir.op === 'dup') {
        streams[redir.fd] = streams[redir.dup] || { type: 'terminal', fd: redir.dup };
        continue;
      }
      var expanded = Parser.expandWords([redir.target], ctx.env, opts);
      var target = expanded[0] || '';
      if (!target) return { error: 'bash: ambiguous redirect' };
      var opened = this.openStream(ctx, redir.fd, target, redir.op === '>>', opts);
      if (opened.error) return { error: opened.error };
      if (redir.fd === 'both') {
        streams[1] = opened;
        streams[2] = opened;
      } else {
        streams[redir.fd] = opened;
      }
    }
    return { streams: streams };
  };

  ShellInstance.prototype.emitStream = function (ctx, stream, text) {
    if (!text) return { stdout: '', stderr: '' };
    if (stream.type === 'terminal') return stream === null ? { stdout: '', stderr: '' } : { stdout: text, stderr: '' };
    if (stream.type === 'null') return { stdout: '', stderr: '' };
    if (stream.type === 'file') {
      var write = C.writeFile(ctx, stream.path, text, true);
      if (!write.ok) return { stdout: '', stderr: 'bash: ' + stream.path + ': ' + write.message + '\n' };
      return { stdout: '', stderr: '' };
    }
    return { stdout: '', stderr: '' };
  };

  ShellInstance.prototype.executePipeline = function (pipeline, ctx) {
    var stdin = '';
    var stdout = '';
    var stderr = '';
    var code = 0;
    var action = null;
    for (var i = 0; i < pipeline.length; i++) {
      var command = pipeline[i];
      var isLast = i === pipeline.length - 1;
      var expanded = Parser.expandWords(command.words, ctx.env, this.expandOptions(ctx));
      var setup = this.setupStreams(ctx, command.redirects, this.expandOptions(ctx));
      if (setup.error) {
        return { stdout: '', stderr: setup.error + '\n', code: 1 };
      }
      ctx.stdin = stdin;
      var result = this.executeSimple(expanded, stdin, ctx);
      if (result.action) action = result.action;

      var outText = result.stdout || '';
      var errText = result.stderr || '';
      var outStream = setup.streams[1];
      var errStream = setup.streams[2];
      var merged = sameStream(outStream, errStream);

      if (merged && outStream.type === 'terminal') {
        if (isLast) {
          if (outStream.fd === 2) stderr += outText + errText;
          else stdout += outText + errText;
        }
      } else if (merged && outStream.type === 'file') {
        var mergedWrite = this.emitStream(ctx, outStream, outText + errText);
        stderr += mergedWrite.stderr;
      } else {
        if (outStream.type === 'terminal') {
          if (isLast) {
            if (outStream.fd === 2) stderr += outText;
            else stdout += outText;
          }
        } else {
          var outResult = this.emitStream(ctx, outStream, outText);
          stderr += outResult.stderr;
        }
        if (errStream.type === 'terminal') {
          if (errStream.fd === 2) stderr += errText;
          else if (isLast) stdout += errText;
        } else if (errText) {
          var errResult = this.emitStream(ctx, errStream, errText);
          stderr += errResult.stderr;
        }
      }
      code = result.code === undefined ? 0 : result.code;
      stdin = outText;
      if (action) break;
      if (merged && outStream.type === 'terminal') {
        stdin = outStream.fd === 2 ? '' : outText + errText;
      } else if (outStream.type === 'terminal' && outStream.fd === 2) {
        stdin = '';
      }
    }
    return { stdout: stdout, stderr: stderr, code: code, action: action };
  };

  function assignment(name, value, ctx) {
    ctx.env[name] = value;
    if (ctx.sys.env && ctx.sys.env !== ctx.env) ctx.sys.env[name] = value;
  }

  ShellInstance.prototype.executeSimple = function (argv, stdin, ctx) {
    if (!argv.length) return C.ok('');
    var assignments = {};
    var index = 0;
    while (index < argv.length) {
      var match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(argv[index]);
      if (!match) break;
      assignments[match[1]] = match[2];
      index += 1;
    }
    var command = argv[index];
    var args = argv.slice(index + 1);

    if (!command) {
      Object.keys(assignments).forEach(function (name) { assignment(name, assignments[name], ctx); });
      return C.ok('');
    }

    var previous = {};
    Object.keys(assignments).forEach(function (name) {
      previous[name] = ctx.env[name];
      assignment(name, assignments[name], ctx);
    });

    var result;
    try {
      if (command === 'cd') {
        result = this.cd(args, ctx);
      } else if (command === 'export') {
        result = this.exportCommand(args, ctx);
      } else if (command === 'unset') {
        result = this.unsetCommand(args, ctx);
      } else if (command === 'alias') {
        result = this.aliasCommand(args, ctx);
      } else if (command === 'source' || command === '.') {
        result = C.fail('bash: ' + command + ': source is not supported in the sandbox', 1);
      } else if (command === 'read' || command === 'eval' || command === 'exec') {
        result = C.fail('bash: ' + command + ': not supported in the sandbox', 1);
      } else {
        result = C.run(ctx, command, args, stdin);
      }
    } finally {
      Object.keys(assignments).forEach(function (name) {
        if (previous[name] === undefined) delete ctx.env[name];
        else ctx.env[name] = previous[name];
        if (ctx.sys.env && ctx.sys.env !== ctx.env) {
          if (previous[name] === undefined) delete ctx.sys.env[name];
          else ctx.sys.env[name] = previous[name];
        }
      });
    }
    return result;
  };

  ShellInstance.prototype.cd = function (args, ctx) {
    var target = args[0] || '~';
    var old = ctx.sys.cwd;
    if (target === '-') {
      target = ctx.sys.oldCwd || ctx.user.home;
    }
    var acc = VFS.access(ctx.sys, ctx.user, target, ctx.sys.cwd, 'x');
    if (!acc.ok) return C.fail('bash: cd: ' + (args[0] || target) + ': ' + acc.message, 1);
    if (acc.node.type !== 'dir') return C.fail('bash: cd: ' + (args[0] || target) + ': Not a directory', 1);
    ctx.sys.oldCwd = old;
    ctx.sys.cwd = acc.path;
    ctx.cwd = acc.path;
    ctx.env.OLDPWD = old;
    ctx.env.PWD = acc.path;
    return C.ok(target === '-' ? acc.path + '\n' : '');
  };

  ShellInstance.prototype.exportCommand = function (args, ctx) {
    if (!args.length || args[0] === '-p') {
      return C.ok(Object.keys(ctx.env).sort().map(function (name) {
        return 'declare -x ' + name + '="' + ctx.env[name] + '"';
      }).join('\n') + '\n');
    }
    args.forEach(function (arg) {
      var match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(arg);
      if (match) assignment(match[1], match[2], ctx);
      else if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(arg)) assignment(arg, ctx.env[arg] || '', ctx);
    });
    return C.ok('');
  };

  ShellInstance.prototype.unsetCommand = function (args, ctx) {
    args.forEach(function (name) { delete ctx.env[name]; if (ctx.sys.env !== ctx.env) delete ctx.sys.env[name]; });
    return C.ok('');
  };

  ShellInstance.prototype.aliasCommand = function (args, ctx) {
    ctx.sys.aliases = ctx.sys.aliases || {};
    if (!args.length) {
      return C.ok(Object.keys(ctx.sys.aliases).sort().map(function (name) {
        return "alias " + name + "='" + ctx.sys.aliases[name] + "'";
      }).join('\n') + (Object.keys(ctx.sys.aliases).length ? '\n' : ''));
    }
    args.forEach(function (arg) {
      var match = /^([^=]+)=(.*)$/.exec(arg);
      if (match) ctx.sys.aliases[match[1]] = match[2].replace(/^'|'$/g, '');
    });
    return C.ok('');
  };

  ShellInstance.prototype.completion = function (line, cursor) {
    if (cursor === undefined) cursor = line.length;
    var before = line.slice(0, cursor);
    var tokenMatch = /([^\s|;&<>]*)$/.exec(before);
    var prefix = tokenMatch ? tokenMatch[1] : '';
    var start = before.length - prefix.length;
    var prior = before.slice(0, start).trim();
    var commandPosition = !prior || /[|;&]$/.test(prior) || /(?:^|\s)(?:sudo|command|type|which|nohup|time|exec)(?:\s+-u\s+\S+)?$/.test(prior);

    var builtins = BUILTINS.concat(['help', 'history', 'clear', 'exit', 'pwd']);
    var candidates = [];

    if (commandPosition && prefix.indexOf('/') === -1 && prefix.charAt(0) !== '~' && prefix.charAt(0) !== '.') {
      var names = C.names().concat(builtins);
      var seen = {};
      names.forEach(function (name) {
        if (seen[name]) return;
        seen[name] = true;
        if (name.indexOf(prefix) === 0) candidates.push(name);
      });
      candidates.sort();
      return completionResult(start, cursor, prefix, candidates);
    }

    var slash = prefix.lastIndexOf('/');
    var dirPart = slash === -1 ? '' : prefix.slice(0, slash + 1);
    var base = slash === -1 ? prefix : prefix.slice(slash + 1);
    var rawDir = dirPart || '.';
    var relative = true;
    var tilde = '';
    if (rawDir.charAt(0) === '~') {
      tilde = rawDir;
      relative = false;
    }
    var dirPath = VFS.normalize(rawDir || '.', this.sys.cwd, this.context().user, this.sys);
    var acc = VFS.access(this.sys, this.context().user, dirPath, '/', 'r');
    if (!acc.ok) return completionResult(start, cursor, prefix, []);
    var children = VFS.childrenOf(this.sys, acc.path);
    children.forEach(function (child) {
      var name = VFS.basename(child);
      if (name.charAt(0) === '.' && base.charAt(0) !== '.') return;
      if (name.indexOf(base) !== 0) return;
      var node = this.sys.fs[child];
      var text = (tilde ? tilde : dirPart) + name + (node && node.type === 'dir' ? '/' : '');
      candidates.push(text);
    }, this);
    candidates.sort();
    return completionResult(start, cursor, prefix, candidates);
  };

  function completionResult(start, end, prefix, candidates) {
    var common = candidates.length ? candidates[0] : '';
    for (var i = 1; i < candidates.length; i++) {
      while (common && candidates[i].indexOf(common) !== 0) common = common.slice(0, -1);
    }
    return { start: start, end: end, prefix: prefix, candidates: candidates, common: common };
  }

  Shell.ShellInstance = ShellInstance;
  Shell.create = function (sys) { return new ShellInstance(sys); };
  Shell.BUILTINS = BUILTINS;

  SB.shell = Shell;
})(typeof window !== 'undefined' ? window : globalThis);
