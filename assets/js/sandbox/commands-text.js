/* ==========================================================================
   RHEL Fieldbook — text-processing and shell utility commands
   ========================================================================== */

(function (root) {
  'use strict';

  var SB = root.RHEL_SANDBOX;
  var C = SB.commands;
  var VFS = SB.vfs;
  var reg = C.register;

  function readInputs(ctx, files, stdin) {
    if (!files.length) return { ok: true, content: C.stdinText(stdin), name: '' };
    var out = '';
    for (var i = 0; i < files.length; i++) {
      var read = C.readFile(ctx, files[i]);
      if (!read.ok) return { ok: false, message: files[i] + ': ' + read.message };
      out += read.content;
    }
    return { ok: true, content: out, name: files.join(' ') };
  }

  function readLines(ctx, files, stdin) {
    var input = readInputs(ctx, files, stdin);
    if (!input.ok) return input;
    return { ok: true, lines: C.splitLines(input.content), content: input.content, name: input.name };
  }

  reg('echo', function (ctx, args) {
    var newline = true;
    var interpret = false;
    var start = 0;
    for (var i = 0; i < args.length; i++) {
      if (args[i] === '-n') { newline = false; start = i + 1; continue; }
      if (args[i] === '-e') { interpret = true; start = i + 1; continue; }
      if (args[i] === '-E') { interpret = false; start = i + 1; continue; }
      if (args[i].charAt(0) === '-' && args[i].length > 2 && /^-[neE]+$/.test(args[i])) {
        if (args[i].indexOf('n') !== -1) newline = false;
        if (args[i].indexOf('e') !== -1) interpret = true;
        if (args[i].indexOf('E') !== -1) interpret = false;
        start = i + 1;
        continue;
      }
      break;
    }
    var text = args.slice(start).join(' ');
    if (interpret) {
      text = text.replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\r/g, '\r').replace(/\\\\/g, '\\');
    }
    return C.ok(text + (newline ? '\n' : ''));
  });

  reg('printf', function (ctx, args) {
    if (!args.length) return C.ok('');
    var format = args.shift();
    var values = args;
    var index = 0;
    var out = '';
    function next() {
      if (index < values.length) return values[index++];
      return '';
    }
    for (var i = 0; i < format.length; i++) {
      var ch = format.charAt(i);
      if (ch === '\\') {
        var esc = format.charAt(i + 1);
        if (esc === 'n') { out += '\n'; i += 1; continue; }
        if (esc === 't') { out += '\t'; i += 1; continue; }
        if (esc === 'r') { out += '\r'; i += 1; continue; }
        if (esc === '\\') { out += '\\'; i += 1; continue; }
        out += ch;
        continue;
      }
      if (ch === '%' && i + 1 < format.length) {
        var spec = format.charAt(i + 1);
        if (spec === '%') { out += '%'; i += 1; continue; }
        if (spec === 's') { out += next(); i += 1; continue; }
        if (spec === 'd' || spec === 'i') { out += String(parseInt(next(), 10) || 0); i += 1; continue; }
        if (spec === 'f') { out += String(parseFloat(next()) || 0); i += 1; continue; }
        if (spec === 'b') {
          out += String(next()).replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\\\/g, '\\');
          i += 1;
          continue;
        }
        out += ch;
        continue;
      }
      out += ch;
    }
    return C.ok(out);
  });

  reg('cat', function (ctx, args, stdin) {
    var number = false;
    var files = [];
    for (var i = 0; i < args.length; i++) {
      if (args[i] === '-n') number = true;
      else if (args[i] === '-A' || args[i] === '-v') { /* accepted, minimally applied */ }
      else files.push(args[i]);
    }
    if (!files.length) return C.ok(C.stdinText(stdin));
    var out = '';
    for (var f = 0; f < files.length; f++) {
      var read = C.readFile(ctx, files[f]);
      if (!read.ok) return C.fail('cat: ' + files[f] + ': ' + read.message);
      out += read.content;
    }
    if (number) {
      var lines = C.splitLines(out);
      out = lines.map(function (line, index) {
        return String(index + 1).padStart(6, ' ') + '\t' + line;
      }).join('\n') + (lines.length ? '\n' : '');
    }
    return C.ok(out);
  });

  reg(['less', 'more'], function (ctx, args, stdin) {
    if (!args.length) return C.ok(C.stdinText(stdin));
    var read = C.readFile(ctx, args[0]);
    if (!read.ok) return C.fail(args[0] + ': ' + read.message);
    return C.ok(read.content);
  });

  reg('head', function (ctx, args, stdin) {
    var count = 10;
    var files = [];
    for (var i = 0; i < args.length; i++) {
      if (args[i] === '-n' && args[i + 1] !== undefined) { count = parseInt(args[++i], 10); continue; }
      if (/^-n\d+$/.test(args[i])) { count = parseInt(args[i].slice(2), 10); continue; }
      if (/^-\d+$/.test(args[i])) { count = parseInt(args[i].slice(1), 10); continue; }
      files.push(args[i]);
    }
    var input = readLines(ctx, files, stdin);
    if (!input.ok) return C.fail(input.message);
    return C.ok(input.lines.slice(0, count).join('\n') + (input.lines.length ? '\n' : ''));
  });

  reg('tail', function (ctx, args, stdin) {
    var count = 10;
    var fromPlus = false;
    var files = [];
    for (var i = 0; i < args.length; i++) {
      if (args[i] === '-n' && args[i + 1] !== undefined) {
        var value = args[++i];
        if (value.charAt(0) === '+') { fromPlus = true; value = value.slice(1); }
        count = parseInt(value, 10);
        continue;
      }
      if (/^-n\+\d+$/.test(args[i])) { fromPlus = true; count = parseInt(args[i].slice(3), 10); continue; }
      if (/^-n\d+$/.test(args[i])) { count = parseInt(args[i].slice(2), 10); continue; }
      if (/^-\d+$/.test(args[i])) { count = parseInt(args[i].slice(1), 10); continue; }
      files.push(args[i]);
    }
    var input = readLines(ctx, files, stdin);
    if (!input.ok) return C.fail(input.message);
    var lines = fromPlus ? input.lines.slice(Math.max(0, count - 1)) : input.lines.slice(-count);
    return C.ok(lines.join('\n') + (lines.length ? '\n' : ''));
  });

  reg('grep', function (ctx, args, stdin) {
    var opts = { ignoreCase: false, invert: false, number: false, count: false, recursive: false, extended: false, fixed: false, only: false };
    var pattern = null;
    var files = [];
    for (var i = 0; i < args.length; i++) {
      var arg = args[i];
      if (arg === '--') { pattern = args[++i]; continue; }
      if (arg.charAt(0) === '-' && arg.length > 1) {
        for (var j = 1; j < arg.length; j++) {
          var flag = arg.charAt(j);
          if (flag === 'i') opts.ignoreCase = true;
          else if (flag === 'v') opts.invert = true;
          else if (flag === 'n') opts.number = true;
          else if (flag === 'c') opts.count = true;
          else if (flag === 'r' || flag === 'R') opts.recursive = true;
          else if (flag === 'E') opts.extended = true;
          else if (flag === 'F') opts.fixed = true;
          else if (flag === 'o') opts.only = true;
        }
        continue;
      }
      if (pattern === null) pattern = arg;
      else files.push(arg);
    }
    if (pattern === null) return C.fail('Usage: grep [OPTION]... PATTERNS [FILE]...', 2);
    var source = pattern;
    if (opts.fixed) source = source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    var re;
    try { re = new RegExp(source, opts.ignoreCase ? 'i' : ''); }
    catch (e) { return C.fail('grep: Invalid regular expression'); }

    function processText(text, label) {
      var lines = C.splitLines(text);
      var matches = [];
      for (var n = 0; n < lines.length; n++) {
        var line = lines[n];
        var found = re.test(line);
        if (opts.invert) found = !found;
        if (!found) continue;
        var prefix = '';
        if (opts.number) prefix += (n + 1) + ':';
        if (label) prefix = label + ':' + prefix;
        matches.push(prefix + (opts.only ? (line.match(re) || [''])[0] : line));
      }
      return matches;
    }

    function walk(path, label) {
      var acc = VFS.access(ctx.sys, ctx.user, path, ctx.sys.cwd, 'r');
      if (!acc.ok) return { ok: false, message: path + ': ' + acc.message };
      if (acc.node.type === 'dir') {
        var out = [];
        var children = C.listChildren(ctx, acc.path);
        for (var c = 0; c < children.length; c++) {
          var result = walk(children[c].path, label ? label + '/' + children[c].name : children[c].name);
          if (!result.ok) return result;
          out = out.concat(result.matches);
        }
        return { ok: true, matches: out };
      }
      var read = C.readFile(ctx, acc.path);
      if (!read.ok) return { ok: false, message: acc.path + ': ' + read.message };
      return { ok: true, matches: processText(read.content, label || acc.path) };
    }

    var all = [];
    if (opts.recursive && files.length) {
      for (var f = 0; f < files.length; f++) {
        var result = walk(files[f], '');
        if (!result.ok) return C.fail('grep: ' + result.message);
        all = all.concat(result.matches);
      }
    } else {
      var input = readLines(ctx, files, stdin);
      if (!input.ok) return C.fail('grep: ' + input.message);
      all = processText(input.content, files.length > 1 ? '' : '');
      if (files.length > 1) {
        all = [];
        for (var ff = 0; ff < files.length; ff++) {
          var readOne = C.readFile(ctx, files[ff]);
          if (!readOne.ok) return C.fail('grep: ' + files[ff] + ': ' + readOne.message);
          all = all.concat(processText(readOne.content, files[ff]));
        }
      }
    }
    if (opts.count) {
      if (files.length > 1 && !opts.recursive) {
        var counts = files.map(function (file) {
          var read = C.readFile(ctx, file);
          if (!read.ok) return file + ':0';
          return file + ':' + processText(read.content, '').length;
        });
        return C.ok(counts.join('\n') + '\n');
      }
      return C.ok(String(all.length) + '\n');
    }
    return C.ok(all.length ? all.join('\n') + '\n' : '', all.length ? 0 : 1);
  });

  reg('cut', function (ctx, args, stdin) {
    var delimiter = '\t';
    var fields = [];
    var chars = null;
    var files = [];
    for (var i = 0; i < args.length; i++) {
      var arg = args[i];
      if (arg === '-d' || arg === '--delimiter') { delimiter = args[++i] || '\t'; continue; }
      if (arg === '-f' || arg === '--fields') { fields = String(args[++i] || '').split(',').map(function (v) { return parseInt(v, 10); }); continue; }
      if (arg === '-c' || arg === '--characters') { chars = String(args[++i] || ''); continue; }
      if (/^-d./.test(arg)) { delimiter = arg.slice(2); continue; }
      if (/^-f/.test(arg)) { fields = arg.slice(2).split(',').map(function (v) { return parseInt(v, 10); }); continue; }
      files.push(arg);
    }
    var input = readLines(ctx, files, stdin);
    if (!input.ok) return C.fail(input.message);
    var output = input.lines.map(function (line) {
      if (chars !== null) {
        var range = chars.split('-');
        var start = parseInt(range[0], 10) - 1;
        var end = range[1] === undefined ? start : parseInt(range[1], 10);
        return line.slice(Math.max(0, start), end);
      }
      var parts = line.split(delimiter);
      if (!fields.length) return line;
      return fields.filter(function (field) { return field > 0; }).map(function (field) { return parts[field - 1] === undefined ? '' : parts[field - 1]; }).join(delimiter);
    });
    return C.ok(output.length ? output.join('\n') + '\n' : '');
  });

  reg('sort', function (ctx, args, stdin) {
    var numeric = false;
    var reverse = false;
    var unique = false;
    var human = false;
    var ignoreCase = false;
    var files = [];
    for (var i = 0; i < args.length; i++) {
      var arg = args[i];
      if (arg.charAt(0) === '-' && arg.length > 1) {
        for (var j = 1; j < arg.length; j++) {
          var flag = arg.charAt(j);
          if (flag === 'n') numeric = true;
          else if (flag === 'r') reverse = true;
          else if (flag === 'u') unique = true;
          else if (flag === 'h') human = true;
          else if (flag === 'f') ignoreCase = true;
        }
        continue;
      }
      files.push(arg);
    }
    var input = readLines(ctx, files, stdin);
    if (!input.ok) return C.fail(input.message);
    var lines = input.lines.slice();
    function numValue(line) {
      var match = /^[ \t]*(-?[0-9]+(?:\.[0-9]+)?)/.exec(line);
      return match ? parseFloat(match[1]) : 0;
    }
    lines.sort(function (a, b) {
      var av = a;
      var bv = b;
      var result;
      if (numeric) result = numValue(a) - numValue(b);
      else if (human) result = C.parseSize(a) - C.parseSize(b);
      else {
        if (ignoreCase) { av = av.toLowerCase(); bv = bv.toLowerCase(); }
        result = av < bv ? -1 : av > bv ? 1 : 0;
      }
      return reverse ? -result : result;
    });
    if (unique) {
      lines = lines.filter(function (line, index) { return index === 0 || line !== lines[index - 1]; });
    }
    return C.ok(lines.length ? lines.join('\n') + '\n' : '');
  });

  reg('uniq', function (ctx, args, stdin) {
    var count = false;
    var onlyDup = false;
    var onlyUnique = false;
    var files = [];
    for (var i = 0; i < args.length; i++) {
      if (args[i] === '-c') count = true;
      else if (args[i] === '-d') onlyDup = true;
      else if (args[i] === '-u') onlyUnique = true;
      else files.push(args[i]);
    }
    var input = readLines(ctx, files, stdin);
    if (!input.ok) return C.fail(input.message);
    var groups = [];
    input.lines.forEach(function (line) {
      var last = groups[groups.length - 1];
      if (last && last.line === line) last.count += 1;
      else groups.push({ line: line, count: 1 });
    });
    var output = groups.filter(function (group) {
      if (onlyDup) return group.count > 1;
      if (onlyUnique) return group.count === 1;
      return true;
    }).map(function (group) {
      return count ? String(group.count).padStart(7, ' ') + ' ' + group.line : group.line;
    });
    return C.ok(output.length ? output.join('\n') + '\n' : '');
  });

  reg('wc', function (ctx, args, stdin) {
    var flags = { lines: false, words: false, chars: false };
    var files = [];
    for (var i = 0; i < args.length; i++) {
      var arg = args[i];
      if (arg.charAt(0) === '-' && arg.length > 1) {
        for (var j = 1; j < arg.length; j++) {
          if (arg.charAt(j) === 'l') flags.lines = true;
          if (arg.charAt(j) === 'w') flags.words = true;
          if (arg.charAt(j) === 'c') flags.chars = true;
        }
        continue;
      }
      files.push(arg);
    }
    var any = flags.lines || flags.words || flags.chars;
    if (!any) flags.lines = flags.words = flags.chars = true;

    function counts(text) {
      var lines = String(text).split('\n');
      var lineCount = lines.length;
      if (lines.length && lines[lines.length - 1] === '') lineCount -= 1;
      if (String(text).length === 0) lineCount = 0;
      return {
        lines: lineCount,
        words: (String(text).match(/\S+/g) || []).length,
        chars: String(text).length
      };
    }

    var sources = files.length ? files : [null];
    var rows = [];
    var totals = { lines: 0, words: 0, chars: 0 };
    for (var f = 0; f < sources.length; f++) {
      var text;
      if (sources[f] === null) text = C.stdinText(stdin);
      else {
        var read = C.readFile(ctx, sources[f]);
        if (!read.ok) return C.fail('wc: ' + sources[f] + ': ' + read.message);
        text = read.content;
      }
      var value = counts(text);
      totals.lines += value.lines;
      totals.words += value.words;
      totals.chars += value.chars;
      var parts = [];
      if (flags.lines) parts.push(String(value.lines).padStart(7, ' '));
      if (flags.words) parts.push(String(value.words).padStart(8, ' '));
      if (flags.chars) parts.push(String(value.chars).padStart(8, ' '));
      if (sources[f] !== null) parts.push(sources[f]);
      rows.push(parts.join(''));
    }
    if (sources.length > 1) {
      var totalParts = [];
      if (flags.lines) totalParts.push(String(totals.lines).padStart(7, ' '));
      if (flags.words) totalParts.push(String(totals.words).padStart(8, ' '));
      if (flags.chars) totalParts.push(String(totals.chars).padStart(8, ' '));
      totalParts.push('total');
      rows.push(totalParts.join(''));
    }
    return C.ok(rows.join('\n') + '\n');
  });

  reg('sed', function (ctx, args) {
    var quiet = false;
    var inPlace = false;
    var scripts = [];
    var files = [];
    for (var i = 0; i < args.length; i++) {
      var arg = args[i];
      if (arg === '-n') { quiet = true; continue; }
      if (arg === '-i' || arg === '--in-place') { inPlace = true; continue; }
      if (/^-i/.test(arg) && arg.length > 2) { inPlace = true; continue; }
      if (arg === '-e') { scripts.push(args[++i] || ''); continue; }
      if (!scripts.length) scripts.push(arg);
      else files.push(arg);
    }
    if (!scripts.length) return C.fail('sed: no script specified', 2);

    function substitute(line) {
      var changed = false;
      var printed = false;
      scripts.forEach(function (script) {
        var match = /^s(.)(.*?)\1(.*?)\1([gip]*)$/.exec(script);
        if (!match) {
          if (script === 'p') { printed = true; return; }
          if (script === 'd') { changed = true; line = null; return; }
          return;
        }
        var source = match[2];
        var replacement = match[3];
        var flags = match[4] || '';
        var re;
        try { re = new RegExp(source, flags.indexOf('g') !== -1 ? 'g' : ''); }
        catch (e) { return; }
        if (re.test(line)) {
          line = line.replace(re, function () {
            var values = arguments;
            return replacement.replace(/&/g, values[0]).replace(/\\([1-9])/g, function (all, number) {
              return values[parseInt(number, 10)] || '';
            });
          });
          changed = true;
          if (flags.indexOf('p') !== -1) printed = true;
        }
      });
      return { line: line, changed: changed, printed: printed };
    }

    var outputs = [];
    var inputFiles = files.length ? files : [null];
    for (var f = 0; f < inputFiles.length; f++) {
      var text;
      if (inputFiles[f] === null) text = C.stdinText(ctx.stdin);
      else {
        var read = C.readFile(ctx, inputFiles[f]);
        if (!read.ok) return C.fail('sed: ' + inputFiles[f] + ': ' + read.message);
        text = read.content;
      }
      var lines = C.splitLines(text);
      var resultLines = [];
      for (var l = 0; l < lines.length; l++) {
        var result = substitute(lines[l]);
        if (result.line === null) continue;
        if (!quiet || result.printed || result.changed && result.printed) resultLines.push(result.line);
      }
      if (inPlace && inputFiles[f] !== null) {
        var write = C.writeFile(ctx, inputFiles[f], resultLines.join('\n') + (resultLines.length ? '\n' : ''), false);
        if (!write.ok) return C.fail('sed: ' + inputFiles[f] + ': ' + write.message);
      } else {
        if (resultLines.length) outputs.push(resultLines.join('\n'));
      }
    }
    return C.ok(outputs.length ? outputs.join('\n') + '\n' : '');
  });

  reg('awk', function (ctx, args, stdin) {
    var fs = null;
    var script = null;
    var files = [];
    for (var i = 0; i < args.length; i++) {
      var arg = args[i];
      if (arg === '-F' && args[i + 1] !== undefined) { fs = args[++i]; continue; }
      if (/^-F./.test(arg)) { fs = arg.slice(2); continue; }
      if (arg === '-v') { i += 1; continue; }
      if (script === null) { script = arg; continue; }
      files.push(arg);
    }
    if (script === null) return C.fail('awk: no program supplied', 2);

    var action = '';
    var condition = script;
    var brace = script.indexOf('{');
    if (brace !== -1) {
      condition = script.slice(0, brace).trim();
      var close = script.lastIndexOf('}');
      action = script.slice(brace + 1, close === -1 ? script.length : close).trim();
    }
    if (!action) action = 'print $0';

    var input = readLines(ctx, files, stdin);
    if (!input.ok) return C.fail(input.message);
    var output = [];
    for (var lineIndex = 0; lineIndex < input.lines.length; lineIndex++) {
      var line = input.lines[lineIndex];
      var fields = fs === null ? line.trim().split(/\s+/) : line.split(fs);
      if (fs !== null && line === '') fields = [''];
      var values = [line].concat(fields);
      var argNames = [];
      var argValues = [];
      for (var n = 0; n < Math.max(10, values.length); n += 1) {
        argNames.push('$' + n);
        argValues.push(values[n] === undefined ? '' : values[n]);
      }
      argNames.push('NF');
      argValues.push(fields.length);
      argNames.push('NR');
      argValues.push(lineIndex + 1);
      var matches = true;
      if (condition) {
        try {
          var test = new Function(argNames.join(','), 'return (' + condition + ');');
          matches = !!test.apply(null, argValues);
        } catch (e) {
          return C.fail('awk: syntax error in pattern');
        }
      }
      if (!matches) continue;
      var rendered = action.replace(/\$(\d+)/g, function (all, number) {
        return values[parseInt(number, 10)] === undefined ? '' : values[parseInt(number, 10)];
      }).replace(/^print\s+/, '').replace(/\s*,\s*/g, ' ');
      output.push(rendered);
    }
    return C.ok(output.length ? output.join('\n') + '\n' : '');
  });

  reg('tr', function (ctx, args, stdin) {
    var set1 = args[0] || '';
    var set2 = args[1] || '';
    var deleteFlag = args.indexOf('-d') !== -1;
    if (deleteFlag) set1 = args[args.indexOf('-d') + 1] || '';
    var text = C.stdinText(stdin);
    var out = '';
    for (var i = 0; i < text.length; i++) {
      var index = set1.indexOf(text.charAt(i));
      if (deleteFlag) {
        if (index === -1) out += text.charAt(i);
      } else if (index !== -1 && set2) {
        out += set2.charAt(Math.min(index, set2.length - 1));
      } else {
        out += text.charAt(i);
      }
    }
    return C.ok(out);
  });

  reg('diff', function (ctx, args) {
    var recursive = args.indexOf('-r') !== -1 || args.indexOf('-R') !== -1;
    var files = args.filter(function (arg) { return arg.charAt(0) !== '-'; });
    if (files.length < 2) return C.fail('diff: missing operand', 2);
    var out = [];
    var errored = false;

    function compareFile(aPath, bPath, displayA, displayB) {
      var a = C.readFile(ctx, aPath);
      var b = C.readFile(ctx, bPath);
      if (!a.ok) { out.push('diff: ' + aPath + ': ' + a.message); errored = true; return; }
      if (!b.ok) { out.push('diff: ' + bPath + ': ' + b.message); errored = true; return; }
      if (a.content === b.content) return;
      var left = C.splitLines(a.content);
      var right = C.splitLines(b.content);
      var max = Math.max(left.length, right.length);
      for (var i = 0; i < max; i++) {
        if (left[i] === right[i]) continue;
        out.push((i + 1) + 'c' + (i + 1));
        out.push('< ' + (left[i] === undefined ? '' : left[i]));
        out.push('---');
        out.push('> ' + (right[i] === undefined ? '' : right[i]));
      }
    }

    function compare(aPath, bPath, displayA, displayB) {
      var aResolved = VFS.resolve(ctx.sys, aPath, ctx.sys.cwd, ctx.user, false);
      var bResolved = VFS.resolve(ctx.sys, bPath, ctx.sys.cwd, ctx.user, false);
      if (aResolved.error) { out.push('diff: ' + aPath + ': ' + aResolved.error); errored = true; return; }
      if (bResolved.error) { out.push('diff: ' + bPath + ': ' + bResolved.error); errored = true; return; }
      var aNode = aResolved.node;
      var bNode = bResolved.node;
      if (aNode.type === 'dir' && bNode.type === 'dir') {
        if (!recursive) { compareFile(aPath, bPath, displayA, displayB); return; }
        var aChildren = C.listChildren(ctx, aResolved.path);
        var bChildren = C.listChildren(ctx, bResolved.path);
        var names = {};
        aChildren.forEach(function (child) { names[child.name] = true; });
        bChildren.forEach(function (child) { names[child.name] = true; });
        Object.keys(names).sort().forEach(function (name) {
          var aChild = aResolved.path === '/' ? '/' + name : aResolved.path + '/' + name;
          var bChild = bResolved.path === '/' ? '/' + name : bResolved.path + '/' + name;
          if (!ctx.sys.fs[aChild]) { out.push('Only in ' + bResolved.path + ': ' + name); return; }
          if (!ctx.sys.fs[bChild]) { out.push('Only in ' + aResolved.path + ': ' + name); return; }
          compare(aChild, bChild, displayA + '/' + name, displayB + '/' + name);
        });
        return;
      }
      if (aNode.type === 'dir' || bNode.type === 'dir') {
        out.push('File ' + displayA + ' is a ' + (aNode.type === 'dir' ? 'directory' : 'regular file') + ' while ' + displayB + ' is a ' + (bNode.type === 'dir' ? 'directory' : 'regular file'));
        return;
      }
      compareFile(aResolved.path, bResolved.path, displayA, displayB);
    }

    compare(files[0], files[1], files[0], files[1]);
    return C.ok(out.length ? out.join('\n') + '\n' : '', errored ? 2 : out.length ? 1 : 0);
  });

  reg('man', function (ctx, args) {
    var name = args[0];
    if (!name) return C.fail('What manual page do you want?', 1);
    return C.ok([
      name.toUpperCase() + '(1)                    General Commands Manual                   ' + name.toUpperCase() + '(1)',
      '',
      'NAME',
      '       ' + name + ' - RHEL Fieldbook sandbox command',
      '',
      'SYNOPSIS',
      '       ' + name + ' [OPTIONS] [ARGUMENTS]',
      '',
      'DESCRIPTION',
      '       This is a simulated RHEL environment. The command follows the',
      '       real tool closely enough for practice, but changes only affect',
      '       this browser sandbox. Use help for a command overview.',
      ''
    ].join('\n'));
  });

  reg('history', function (ctx, args) {
    if (args.indexOf('-c') !== -1) {
      ctx.sys.history = [];
      return C.ok('');
    }
    return C.ok(ctx.sys.history.map(function (line, index) {
      return String(index + 1).padStart(4, ' ') + '  ' + line;
    }).join('\n') + (ctx.sys.history.length ? '\n' : ''));
  });

  reg('type', function (ctx, args) {
    if (!args.length) return C.fail('type: not enough arguments', 2);
    var out = [];
    args.forEach(function (name) {
      if (['cd', 'export', 'unset', 'history', 'umask', 'set', 'alias'].indexOf(name) !== -1) {
        out.push(name + ' is a shell builtin');
        return;
      }
      var path = C.commandPath(ctx.sys, name);
      if (path) out.push(name + ' is ' + path);
      else out.push('bash: type: ' + name + ': not found');
    });
    return C.ok(out.join('\n') + '\n');
  });

  reg(['command', 'which'], function (ctx, args) {
    var value = args.slice();
    var verbose = false;
    if (value[0] === '-v' || value[0] === '-V') { verbose = true; value.shift(); }
    if (!value.length) return C.fail('Usage: command -v COMMAND', 2);
    var out = [];
    value.forEach(function (name) {
      if (['cd', 'export', 'unset', 'history', 'umask', 'set'].indexOf(name) !== -1) {
        out.push(name);
        return;
      }
      var path = C.commandPath(ctx.sys, name);
      if (path) out.push(verbose ? name + ' is ' + path : path);
    });
    return C.ok(out.length ? out.join('\n') + '\n' : '', out.length ? 0 : 1);
  });

  reg('pwd', function (ctx) {
    return C.ok(ctx.sys.cwd + '\n');
  });

  reg(['env', 'printenv'], function (ctx, args) {
    if (args.length) return C.ok((ctx.env[args[0]] || '') + '\n');
    return C.ok(Object.keys(ctx.env).sort().map(function (key) { return key + '=' + ctx.env[key]; }).join('\n') + '\n');
  });

  reg('set', function (ctx) {
    var keys = Object.keys(ctx.env).sort();
    return C.ok(keys.map(function (key) {
      var value = String(ctx.env[key]).replace(/'/g, "'\\''");
      return key + "='" + value + "'";
    }).join('\n') + '\n');
  });

  reg('umask', function (ctx, args) {
    if (!args.length) {
      var value = (ctx.sys.umask || 18).toString(8);
      while (value.length < 4) value = '0' + value;
      return C.ok(value + '\n');
    }
    if (!/^[0-7]{1,4}$/.test(args[0])) return C.fail('umask: invalid octal number', 1);
    ctx.sys.umask = parseInt(args[0], 8);
    return C.ok('');
  });

  reg('basename', function (ctx, args) {
    if (!args.length) return C.fail('basename: missing operand', 1);
    var value = VFS.basename(args[0].replace(/\/+$/, ''));
    if (args[1]) {
      var suffix = args[1];
      if (value.slice(-suffix.length) === suffix) value = value.slice(0, -suffix.length);
    }
    return C.ok(value + '\n');
  });

  reg('dirname', function (ctx, args) {
    if (!args.length) return C.fail('dirname: missing operand', 1);
    return C.ok(VFS.dirname(args[0].replace(/\/+$/, '')) + '\n');
  });

  reg('true', function () { return C.ok(''); });
  reg('false', function () { return C.ok('', 1); });
  reg(':', function () { return C.ok(''); });
  reg('sleep', function (ctx, args) {
    var seconds = parseFloat(args[0] || '0') || 0;
    if (seconds > 5) return C.fail('sleep: sandbox limit is 5 seconds', 1);
    return C.ok('', 0);
  });

  reg('clear', function () { return { stdout: '', stderr: '', code: 0, action: 'clear' }; });
  reg(['exit', 'logout'], function () { return { stdout: '', stderr: '', code: 0, action: 'close' }; });

  reg('help', function () {
    return C.ok([
      'RHEL Fieldbook sandbox — stateful simulated RHEL 9.5',
      '',
      'Filesystem  ls, cd, pwd, cat, head, tail, grep, cut, sort, uniq, wc,',
      '            find, du, stat, file, touch, mkdir, rm, rmdir, cp, mv,',
      '            ln, chmod, chown, chgrp, tee, sed, getfacl, setfacl',
      'System      systemctl, journalctl, ps, top, dnf, rpm, firewall-cmd,',
      '            getenforce, sestatus, getsebool, setsebool, semanage,',
      '            restorecon, df, mount, umount, lsblk, findmnt',
      'Identity    id, groups, whoami, getent, useradd, usermod, groupadd,',
      '            passwd, chage, su, sudo',
      'Shell       echo, printf, history, type, command, which, export, set,',
      '            umask, clear, exit, help',
      '',
      'Pipes, ;, &&, ||, redirects (>, >>, 2>, 2>&1, 2>/dev/null),',
      '$VAR, $?, $(...), globs, brace expansion, and tab completion work.',
      'State is saved in this browser. Use Reset, Snapshot, and Restore in',
      'the panel header. Try: help, ls -la, cat /etc/os-release, sudo -l.',
      ''
    ].join('\n'));
  });
})(typeof window !== 'undefined' ? window : globalThis);
