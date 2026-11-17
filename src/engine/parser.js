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

  // "\" at the end of a line (plus the next line's indentation) is a line
  // continuation: it lets long templates show one command per line without
  // typing any newline. Returns the end index of the continuation, or -1.
  function continuationEnd(src, i) {
    if (src[i] !== '\\') return -1;
    let j = i + 1;
    if (src[j] === '\r') j++;
    if (src[j] !== '\n') return -1;
    j++;
    while (src[j] === ' ' || src[j] === '\t') j++;
    return j;
  }

  /** Nodes carry start/end offsets into the source (for editor navigation). */
  function parseTemplate(src) {
    src = String(src ?? '');
    const nodes = [];
    let buf = '';
    let bufStart = 0;
    let i = 0;
    const flush = (end) => {
      if (buf) nodes.push({ type: 'text', value: buf, start: bufStart, end });
      buf = '';
    };
    while (i < src.length) {
      const c = src[i];
      const cont = continuationEnd(src, i);
      if (cont !== -1) {
        flush(i);
        i = cont;
        bufStart = i;
        continue;
      }
      if (!buf) bufStart = i;
      if (c === '\\' && i + 1 < src.length) { buf += src[i + 1]; i += 2; continue; }
      if (c === '{') {
        const end = findClose(src, i);
        if (end !== -1) {
          flush(i);
          const node = parseBlock(src.slice(i + 1, end), src.slice(i, end + 1));
          node.start = i;
          node.end = end + 1;
          nodes.push(node);
          i = end + 1;
          continue;
        }
      }
      buf += c;
      i++;
    }
    flush(i);
    return nodes;
  }

  const ACTION_CMDS = new Set(['click', 'select', 'clear', 'wait', 'key']);
  const FORM_CMDS = new Set(['formtext', 'formmenu', 'formparagraph']);
  const DATA_CMDS = new Set(['thaiid', 'random-number', 'thaiphone', 'thainame', 'email', 'date', 'zipcode', 'bankaccount', 'randomtext']);

  /** Highlight category for a parsed block node. */
  function blockKind(node, known) {
    if (node.type === 'expr' || node.type === 'assign') return 'expr';
    if (node.type !== 'cmd') return 'text';
    if (ACTION_CMDS.has(node.name)) return 'action';
    if (FORM_CMDS.has(node.name)) return 'form';
    if (DATA_CMDS.has(node.name)) return 'data';
    if (node.name === 'import') return 'import';
    return known(node.name) ? 'expr' : 'unknown';
  }

  /**
   * Split a template into display tokens that cover the source exactly
   * (concatenating every token.text gives back the source).
   * kinds: text, escape, cont, action, form, data, import, expr, unknown
   * Block tokens also have `name` (command name, if any) and `node`.
   */
  function tokenizeTemplate(src) {
    src = String(src ?? '');
    const tokens = [];
    const assigned = new Set();
    let text = '';
    const flushText = () => {
      if (text) tokens.push({ kind: 'text', text });
      text = '';
    };
    for (let i = 0; i < src.length;) {
      const cont = continuationEnd(src, i);
      if (cont !== -1) {
        flushText();
        tokens.push({ kind: 'cont', text: src.slice(i, cont) });
        i = cont;
        continue;
      }
      if (src[i] === '\\' && i + 1 < src.length) {
        flushText();
        tokens.push({ kind: 'escape', text: src.slice(i, i + 2) });
        i += 2;
        continue;
      }
      if (src[i] === '{') {
        const end = findClose(src, i);
        if (end !== -1) {
          flushText();
          const raw = src.slice(i, end + 1);
          const node = parseBlock(src.slice(i + 1, end), raw);
          if (node.type === 'assign') assigned.add(node.name);
          tokens.push({ kind: 'block', text: raw, node, name: node.type === 'cmd' ? node.name : null });
          i = end + 1;
          continue;
        }
      }
      text += src[i];
      i++;
    }
    flushText();
    const commands = FB.COMMANDS || {};
    const known = (name) => Object.prototype.hasOwnProperty.call(commands, name) || assigned.has(name);
    for (const t of tokens) if (t.kind === 'block') t.kind = blockKind(t.node, known);
    return tokens;
  }

  const isBlockToken = (t) => t && !['text', 'escape', 'cont'].includes(t.kind);

  /**
   * One command per line using "\" continuations. Breaks before a block that
   * directly follows another block, and before every action command, except
   * {wait} / {key}, which stay next to the step before them.
   * Running the result gives exactly the same output as the input.
   */
  function formatTemplate(src) {
    const tokens = tokenizeTemplate(compactTemplate(src));
    let out = '';
    tokens.forEach((t, i) => {
      const prev = tokens[i - 1];
      // {wait} / {key} stay on the line of the step they belong to.
      const trailing = t.name === 'wait' || t.name === 'key';
      if (i > 0 && isBlockToken(t) && !trailing && (isBlockToken(prev) || t.kind === 'action')) out += '\\\n';
      out += t.text;
    });
    return out;
  }

  /** Remove every line continuation (back to a single line). */
  function compactTemplate(src) {
    return tokenizeTemplate(src).filter((t) => t.kind !== 'cont').map((t) => t.text).join('');
  }

  FB.parseTemplate = parseTemplate;
  FB.parseArgs = parseArgs;
  FB.tokenizeTemplate = tokenizeTemplate;
  FB.formatTemplate = formatTemplate;
  FB.compactTemplate = compactTemplate;
})();
