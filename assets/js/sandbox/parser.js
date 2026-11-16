/* ==========================================================================
   RHEL Fieldbook — small POSIX-ish shell parser
   Supports quotes, escapes, ; && || |, redirections, $VAR, $?, $(),
   brace expansion, and glob expansion through a caller-supplied resolver.
   Pure functions. No DOM. Safe to load in Node for tests.
   ========================================================================== */

(function (root) {
  'use strict';

  var SB = root.RHEL_SANDBOX = root.RHEL_SANDBOX || {};
  var Parser = SB.parser = {};

  function isSpace(ch) {
    return ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n';
  }

  function readCommandSub(text, start) {
    var i = start + 2;
    var depth = 1;
    var quote = null;
    while (i < text.length) {
      var ch = text.charAt(i);
      if (quote) {
        if (ch === '\\' && quote === '"' && i + 1 < text.length) { i += 2; continue; }
        if (ch === quote) quote = null;
        i += 1;
        continue;
      }
      if (ch === "'" || ch === '"') { quote = ch; i += 1; continue; }
      if (ch === '\\') { i += 2; continue; }
      if (ch === '$' && text.charAt(i + 1) === '(') { depth += 1; i += 2; continue; }
      if (ch === '(') { depth += 1; i += 1; continue; }
      if (ch === ')') {
        depth -= 1;
        if (depth === 0) {
          return { text: text.slice(start, i + 1), inner: text.slice(start + 2, i), end: i + 1 };
        }
        i += 1;
        continue;
      }
      i += 1;
    }
    return { text: text.slice(start), inner: text.slice(start + 2), end: text.length };
  }

  function readRedir(input, i) {
    var rest = input.slice(i);
    var match;
    if ((match = /^&>>/.exec(rest))) return { token: { type: 'redir', fd: 'both', op: '>>' }, end: i + match[0].length };
    if ((match = /^&>/.exec(rest))) return { token: { type: 'redir', fd: 'both', op: '>' }, end: i + match[0].length };
    if ((match = /^2>&1/.exec(rest))) return { token: { type: 'redir', fd: 2, op: 'dup', dup: 1 }, end: i + match[0].length };
    if ((match = /^1>&2/.exec(rest))) return { token: { type: 'redir', fd: 1, op: 'dup', dup: 2 }, end: i + match[0].length };
    if ((match = /^>&1/.exec(rest))) return { token: { type: 'redir', fd: 1, op: 'dup', dup: 1 }, end: i + match[0].length };
    if ((match = /^>&2/.exec(rest))) return { token: { type: 'redir', fd: 1, op: 'dup', dup: 2 }, end: i + match[0].length };
    if ((match = /^2>>/.exec(rest))) return { token: { type: 'redir', fd: 2, op: '>>' }, end: i + match[0].length };
    if ((match = /^2>/.exec(rest))) return { token: { type: 'redir', fd: 2, op: '>' }, end: i + match[0].length };
    if ((match = /^1>>/.exec(rest))) return { token: { type: 'redir', fd: 1, op: '>>' }, end: i + match[0].length };
    if ((match = /^1>/.exec(rest))) return { token: { type: 'redir', fd: 1, op: '>' }, end: i + match[0].length };
    if ((match = /^>>/.exec(rest))) return { token: { type: 'redir', fd: 1, op: '>>' }, end: i + match[0].length };
    if ((match = /^>/.exec(rest))) return { token: { type: 'redir', fd: 1, op: '>' }, end: i + match[0].length };
    return null;
  }

  function pushPart(parts, text, expand, glob) {
    if (!text) return;
    var last = parts[parts.length - 1];
    if (last && last.expand === expand && last.glob === glob) {
      last.text += text;
    } else {
      parts.push({ text: text, expand: expand, glob: glob });
    }
  }

  function readWord(input, start) {
    var parts = [];
    var buffer = '';
    var bufferExpand = true;
    var bufferGlob = true;
    var i = start;

    function flush() {
      if (buffer) {
        pushPart(parts, buffer, bufferExpand, bufferGlob);
        buffer = '';
      }
    }

    while (i < input.length) {
      var ch = input.charAt(i);
      if (isSpace(ch) || ch === ';' || ch === '|' || ch === '>') break;
      if (ch === '&' && (input.charAt(i + 1) === '&' || input.charAt(i + 1) === '>')) break;

      if (ch === "'") {
        flush();
        var singleEnd = input.indexOf("'", i + 1);
        if (singleEnd === -1) singleEnd = input.length;
        pushPart(parts, input.slice(i + 1, singleEnd), false, false);
        i = singleEnd + 1;
        continue;
      }

      if (ch === '"') {
        flush();
        i += 1;
        bufferExpand = true;
        bufferGlob = false;
        while (i < input.length) {
          var dq = input.charAt(i);
          if (dq === '"') { i += 1; break; }
          if (dq === '\\' && i + 1 < input.length) {
            var escaped = input.charAt(i + 1);
            if (escaped === '"' || escaped === '\\' || escaped === '$' || escaped === '`') {
              flush();
              pushPart(parts, escaped, false, false);
              i += 2;
              continue;
            }
            buffer += dq;
            i += 1;
            continue;
          }
          buffer += dq;
          i += 1;
        }
        flush();
        bufferExpand = true;
        bufferGlob = true;
        continue;
      }

      if (ch === '\\') {
        flush();
        if (i + 1 < input.length) {
          pushPart(parts, input.charAt(i + 1), false, false);
          i += 2;
        } else {
          i += 1;
        }
        continue;
      }

      if (ch === '$' && input.charAt(i + 1) === '(') {
        var sub = readCommandSub(input, i);
        buffer += sub.text;
        i = sub.end;
        continue;
      }

      buffer += ch;
      i += 1;
    }

    flush();
    return { token: { type: 'word', parts: parts }, end: i };
  }

  function lex(input) {
    input = String(input === undefined || input === null ? '' : input);
    var tokens = [];
    var i = 0;
    while (i < input.length) {
      var ch = input.charAt(i);
      if (isSpace(ch)) { i += 1; continue; }
      if (ch === '#') {
        while (i < input.length && input.charAt(i) !== '\n') i += 1;
        continue;
      }
      if (ch === '\n') { tokens.push({ type: ';' }); i += 1; continue; }
      if (ch === ';') { tokens.push({ type: ';' }); i += 1; continue; }
      if (ch === '&' && input.charAt(i + 1) === '&') { tokens.push({ type: '&&' }); i += 2; continue; }
      if (ch === '|' && input.charAt(i + 1) === '|') { tokens.push({ type: '||' }); i += 2; continue; }
      if (ch === '|') { tokens.push({ type: '|' }); i += 1; continue; }

      var redir = readRedir(input, i);
      if (redir) {
        tokens.push(redir.token);
        i = redir.end;
        continue;
      }

      if (ch === '&') {
        // A lone ampersand is not a supported background operator. Treat it
        // as a literal word so users get a normal "command not found" style
        // failure rather than a parser crash.
        tokens.push({ type: 'word', parts: [{ text: '&', expand: false, glob: false }] });
        i += 1;
        continue;
      }

      var word = readWord(input, i);
      if (word.token.parts.length) tokens.push(word.token);
      i = word.end;
      if (i === word.end && word.end === input.length) break;
    }
    return tokens;
  }

  function parse(tokens) {
    var list = [];
    var pipeline = [];
    var command = { words: [], redirects: [] };

    function finishCommand() {
      if (command.words.length || command.redirects.length) {
        pipeline.push(command);
        command = { words: [], redirects: [] };
      }
    }

    function finishPipeline(connector) {
      finishCommand();
      if (pipeline.length) {
        list.push({ pipeline: pipeline, connector: connector || null });
        pipeline = [];
      }
    }

    for (var i = 0; i < tokens.length; i++) {
      var token = tokens[i];
      if (token.type === 'word') {
        command.words.push(token);
      } else if (token.type === 'redir') {
        if (token.op === 'dup') {
          command.redirects.push(token);
        } else {
          var target = tokens[i + 1];
          if (!target || target.type !== 'word') {
            throw new Error('syntax error near unexpected token `newline`');
          }
          command.redirects.push({ type: 'redir', fd: token.fd, op: token.op, target: target });
          i += 1;
        }
      } else if (token.type === '|') {
        finishCommand();
      } else if (token.type === ';' || token.type === '&&' || token.type === '||') {
        finishPipeline(token.type);
      }
    }
    finishPipeline(null);
    return list;
  }

  function parseLine(input) {
    return parse(lex(input));
  }

  function stripTrailingNewlines(text) {
    return String(text === undefined || text === null ? '' : text).replace(/\n+$/, '');
  }

  function lookupEnv(env, name) {
    if (!env) return '';
    if (Object.prototype.hasOwnProperty.call(env, name)) return env[name];
    return '';
  }

  function expandText(text, env, options) {
    options = options || {};
    env = env || {};
    var out = '';
    var i = 0;
    while (i < text.length) {
      var ch = text.charAt(i);
      if (ch !== '$') { out += ch; i += 1; continue; }

      var next = text.charAt(i + 1);
      if (next === '(') {
        var sub = readCommandSub(text, i);
        out += stripTrailingNewlines(options.runSub ? options.runSub(sub.inner) : '');
        i = sub.end;
        continue;
      }
      if (next === '{') {
        var close = text.indexOf('}', i + 2);
        if (close === -1) { out += '$'; i += 1; continue; }
        var braceName = text.slice(i + 2, close);
        if (braceName.indexOf(':-') !== -1) {
          var bits = braceName.split(':-');
          var value = lookupEnv(env, bits[0]);
          out += value === '' || value === undefined || value === null ? bits.slice(1).join(':-') : value;
        } else {
          out += lookupEnv(env, braceName);
        }
        i = close + 1;
        continue;
      }
      if (next === '?') {
        var exitValue = options.lastExit;
        if (exitValue === undefined || exitValue === null) exitValue = lookupEnv(env, '?');
        out += exitValue === undefined || exitValue === null ? '0' : String(exitValue);
        i += 2;
        continue;
      }
      if (next === '$') {
        out += options.pid === undefined ? '1' : String(options.pid);
        i += 2;
        continue;
      }
      if (next === '#') {
        out += options.argCount === undefined ? '0' : String(options.argCount);
        i += 2;
        continue;
      }
      if (next === '0') {
        out += options.shellName || 'bash';
        i += 2;
        continue;
      }
      if (/[A-Za-z_]/.test(next)) {
        var j = i + 1;
        while (j < text.length && /[A-Za-z0-9_]/.test(text.charAt(j))) j += 1;
        out += lookupEnv(env, text.slice(i + 1, j));
        i = j;
        continue;
      }
      out += '$';
      i += 1;
    }
    return out;
  }

  function tildeExpand(parts, env, options) {
    if (!parts.length) return;
    var first = parts[0];
    if (!first.glob || first.text.charAt(0) !== '~') return;
    var slash = first.text.indexOf('/');
    var name = slash === -1 ? first.text.slice(1) : first.text.slice(1, slash);
    var rest = slash === -1 ? '' : first.text.slice(slash);
    var home = null;
    if (!name) home = (options && options.home) || lookupEnv(env, 'HOME') || '/home/student';
    else if (options && options.homes && options.homes[name]) home = options.homes[name];
    if (home) first.text = home + rest;
  }

  function braceExpand(text) {
    var open = -1;
    var depth = 0;
    for (var i = 0; i < text.length; i++) {
      var ch = text.charAt(i);
      if (ch === '\\') { i += 1; continue; }
      if (ch === '{') {
        if (depth === 0) open = i;
        depth += 1;
      } else if (ch === '}') {
        depth -= 1;
        if (depth === 0 && open !== -1) {
          var before = text.slice(0, open);
          var inside = text.slice(open + 1, i);
          var after = text.slice(i + 1);
          var values = null;
          var range = /^(-?\d+)\.\.(-?\d+)(?:\.\.(-?\d+))?$/.exec(inside);
          if (range) {
            values = [];
            var start = parseInt(range[1], 10);
            var end = parseInt(range[2], 10);
            var step = range[3] ? Math.abs(parseInt(range[3], 10)) : 1;
            if (start > end && !range[3]) step = -1;
            if (start > end) step = -Math.abs(step);
            for (var value = start; start < end ? value <= end : value >= end; value += step) {
              values.push(String(value));
            }
          } else {
            var pieces = [];
            var current = '';
            var innerDepth = 0;
            for (var k = 0; k < inside.length; k++) {
              var c = inside.charAt(k);
              if (c === '\\') { current += c + inside.charAt(k + 1); k += 1; continue; }
              if (c === '{') innerDepth += 1;
              if (c === '}') innerDepth -= 1;
              if (c === ',' && innerDepth === 0) {
                pieces.push(current);
                current = '';
              } else {
                current += c;
              }
            }
            pieces.push(current);
            if (pieces.length > 1) values = pieces;
          }
          if (!values) return [text];
          var expanded = [];
          values.forEach(function (piece) {
            braceExpand(before + piece + after).forEach(function (item) { expanded.push(item); });
          });
          return expanded;
        }
      }
    }
    return [text];
  }

  function expandWord(token, env, options) {
    options = options || {};
    env = env || {};
    var parts = token.parts.map(function (part) { return { text: part.text, expand: part.expand, glob: part.glob }; });
    tildeExpand(parts, env, options);

    var globEligible = parts.length > 0;
    var text = '';
    for (var i = 0; i < parts.length; i++) {
      var part = parts[i];
      if (!part.glob) globEligible = false;
      text += part.expand ? expandText(part.text, env, options) : part.text;
    }

    var values = globEligible ? braceExpand(text) : [text];
    return { values: values, glob: globEligible };
  }

  function expandWords(tokens, env, options) {
    options = options || {};
    var out = [];
    tokens.forEach(function (token) {
      if (token.type !== 'word') return;
      var expanded = expandWord(token, env, options);
      expanded.values.forEach(function (value) {
        if (expanded.glob && typeof options.glob === 'function') {
          var matches = options.glob(value);
          if (matches && matches.length) {
            for (var i = 0; i < matches.length; i++) out.push(matches[i]);
            return;
          }
        }
        out.push(value);
      });
    });
    return out;
  }

  function splitRawWords(input) {
    return expandWords(lex(input), {}, {});
  }

  Parser.lex = lex;
  Parser.parse = parse;
  Parser.parseLine = parseLine;
  Parser.expandText = expandText;
  Parser.expandWord = expandWord;
  Parser.expandWords = expandWords;
  Parser.braceExpand = braceExpand;
  Parser.readCommandSub = readCommandSub;
  Parser.splitRawWords = splitRawWords;
})(typeof window !== 'undefined' ? window : globalThis);
