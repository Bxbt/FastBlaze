// Parses snippet templates into nodes:
//   plain text           -> { type: 'text', value }
//   {=expr}              -> { type: 'expr', expr }
//   {name=expr|{cmd}}    -> { type: 'assign', name, value: node }
//   {cmd: a=1; b=2; pos} -> { type: 'cmd', name, args: { a, b, _: [pos] } }
// Backslash escapes the next character (\{ -> {, \\ -> \).
(function () {
  'use strict';
  const FB = (globalThis.FastBlaze = globalThis.FastBlaze || {});

  function unescape(s) {
    return s.replace(/\\([\s\S])/g, '$1');
  }

  function findClose(src, start) {
    let depth = 0;
    for (let i = start; i < src.length; i++) {
      const c = src[i];
      if (c === '\\') { i++; continue; }
      if (c === '{') depth++;
      else if (c === '}' && --depth === 0) return i;
    }
    return -1;
  }

  // Split "a=1; b=[x;y]; c" on ';' but not inside [] () {} groups.
  function splitArgs(str) {
    const parts = [];
    let buf = '';
    let depth = 0;
    for (let i = 0; i < str.length; i++) {
      const c = str[i];
      if (c === '\\' && i + 1 < str.length) { buf += c + str[i + 1]; i++; continue; }
      if (c === '[' || c === '(' || c === '{') depth++;
      else if ((c === ']' || c === ')' || c === '}') && depth > 0) depth--;
      if (c === ';' && depth === 0) { parts.push(buf); buf = ''; continue; }
      buf += c;
    }
    if (buf.trim()) parts.push(buf);
    return parts;
  }

  function parseArgs(str) {
    const args = { _: [] };
    for (const part of splitArgs(str || '')) {
      const m = part.match(/^\s*([A-Za-z][\w-]*)\s*=([\s\S]*)$/);
      if (m) args[m[1].toLowerCase()] = unescape(m[2].trim());
      else if (part.trim()) args._.push(unescape(part.trim()));
    }
    return args;
  }

  function parseBlock(inner, raw) {
    const t = inner.trim();
    if (t.startsWith('=')) return { type: 'expr', expr: unescape(t.slice(1)), raw };

    let m = t.match(/^([A-Za-z_]\w*)\s*=(?!=)([\s\S]*)$/);
    if (m) {
      const v = m[2].trim();
      const value = v.startsWith('{') && findClose(v, 0) === v.length - 1
        ? parseBlock(v.slice(1, -1), v)
        : { type: 'expr', expr: unescape(v), raw: v };
      return { type: 'assign', name: m[1], value, raw };
    }

    m = t.match(/^([A-Za-z][\w-]*)\s*(?::([\s\S]*))?$/);
    if (m) return { type: 'cmd', name: m[1].toLowerCase(), args: parseArgs(m[2]), raw };

    return { type: 'text', value: raw, raw };
  }

  function parseTemplate(src) {
    src = String(src ?? '');
    const nodes = [];
    let buf = '';
    let i = 0;
    const flush = () => {
      if (buf) nodes.push({ type: 'text', value: buf });
      buf = '';
    };
    while (i < src.length) {
      const c = src[i];
      if (c === '\\' && i + 1 < src.length) { buf += src[i + 1]; i += 2; continue; }
      if (c === '{') {
        const end = findClose(src, i);
        if (end !== -1) {
          flush();
          nodes.push(parseBlock(src.slice(i + 1, end), src.slice(i, end + 1)));
          i = end + 1;
          continue;
        }
      }
      buf += c;
      i++;
    }
    flush();
    return nodes;
  }

  FB.parseTemplate = parseTemplate;
  FB.parseArgs = parseArgs;
})();
