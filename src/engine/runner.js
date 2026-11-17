// Compiles a template into a flat list of actions the page runner executes:
//   { type: 'text', value }  type text into the focused element
//   { type: 'click', selector }
//   { type: 'wait', ms }
//   { type: 'key', key }     enter | tab | escape | ...
// Pure (no DOM) so it can be unit tested in Node.
(function () {
  'use strict';
  const FB = (globalThis.FastBlaze = globalThis.FastBlaze || {});
  const MAX_IMPORT_DEPTH = 10;

  function isYes(v, fallback) {
    if (v == null || v === '') return fallback;
    return !['no', 'false', '0', 'off'].includes(String(v).trim().toLowerCase());
  }

  function parseDelay(v) {
    const m = String(v ?? '').trim().match(/^(\d+(?:\.\d+)?)\s*(ms|s)?$/i);
    if (!m) throw new Error(`Bad delay "${v}" (use 500ms or 1s)`);
    const n = Number(m[1]);
    return (m[2] || 'ms').toLowerCase() === 's' ? n * 1000 : n;
  }

  function fieldName(a, ctx) {
    return a.name || `Field ${++ctx.fieldCounter}`;
  }

  function formValue(a, ctx, kind) {
    const name = fieldName(a, ctx);
    const options = kind === 'menu' ? menuOptions(a) : null;
    const fallback = options ? options[0] ?? '' : a.default ?? '';
    const v = Object.prototype.hasOwnProperty.call(ctx.formValues, name) ? ctx.formValues[name] : fallback;
    if (ctx.fields) ctx.fields.push({ name, kind, default: fallback, options, cols: a.cols ? Number(a.cols) : null });
    ctx.vars[name] = v;
    return v;
  }

  function menuOptions(a) {
    const opts = [...a._];
    if (a.default != null && !opts.includes(a.default)) opts.unshift(a.default);
    return opts;
  }

  const COMMANDS = {
    'random-number'(a) {
      const min = Number(a.min ?? 0);
      const max = Number(a.max ?? 100);
      if (Number.isNaN(min) || Number.isNaN(max)) throw new Error('min/max must be numbers');
      if (isYes(a.rounded, true)) return String(Math.floor(Math.random() * (Math.floor(max) - Math.ceil(min) + 1)) + Math.ceil(min));
      return FB.formatValue(Math.random() * (max - min) + min);
    },
    thaiid(a) {
      return FB.generateThaiId({ prefix: a.prefix ?? a.first ?? a._[0], format: a.format });
    },
    formtext(a, ctx) { return formValue(a, ctx, 'text'); },
    formparagraph(a, ctx) { return formValue(a, ctx, 'paragraph'); },
    formmenu(a, ctx) { return formValue(a, ctx, 'menu'); },
    import(a, ctx, emit) {
      const shortcut = a.shortcut ?? a._[0];
      if (!shortcut) throw new Error('import needs a shortcut');
      const text = ctx.lookup(shortcut);
      if (text == null) throw new Error(`Snippet ${shortcut} not found`);
      if (ctx.depth >= MAX_IMPORT_DEPTH) throw new Error('Import nested too deep (loop?)');
      ctx.depth++;
      try {
        if (emit) {
          runTemplate(text, ctx);
          return '';
        }
        const sub = { ...ctx, actions: [] };
        runTemplate(text, sub);
        ctx.fieldCounter = sub.fieldCounter;
        return sub.actions.filter((x) => x.type === 'text').map((x) => x.value).join('');
      } finally {
        ctx.depth--;
      }
    },
    // {click: selector=CSS} or {click: text=Label} (optionally both: text inside selector scope)
    click(a, ctx, emit) {
      const selector = a.selector ?? a._[0] ?? null;
      const text = a.text ?? null;
      if (!selector && !text) throw new Error('click needs selector= or text=');
      if (emit) ctx.actions.push(text != null ? { type: 'click', selector, text } : { type: 'click', selector });
      return '';
    },
    wait(a, ctx, emit) {
      const ms = parseDelay(a.delay ?? a._[0] ?? '500ms');
      if (emit) ctx.actions.push({ type: 'wait', ms });
      return '';
    },
    key(a, ctx, emit) {
      const key = (a.key ?? a._[0] ?? '').toLowerCase();
      if (!key) throw new Error('key needs a key name');
      if (emit) ctx.actions.push({ type: 'key', key });
      return '';
    },
    // {clear} empties the focused field; {clear: selector=...} finds, focuses and empties a field.
    clear(a, ctx, emit) {
      if (emit) ctx.actions.push({ type: 'clear', selector: a.selector ?? a._[0] ?? null });
      return '';
    },
    // Native <select>: {select: selector=...; value=x | text=Label | index=2}
    select(a, ctx, emit) {
      const selector = a.selector;
      if (!selector) throw new Error('select needs selector=');
      const action = { type: 'select', selector };
      if (a.index != null) action.index = Number(a.index);
      else if (a.text != null) action.text = a.text;
      else if (a.value != null) action.value = a.value;
      else throw new Error('select needs value=, text= or index=');
      if (emit) ctx.actions.push(action);
      return '';
    },
  };

  function describeAction(a) {
    switch (a.type) {
      case 'text': return `type "${a.value.length > 40 ? `${a.value.slice(0, 40)}…` : a.value}"`;
      case 'click': return a.text != null ? `click "${a.text}"${a.selector ? ` in ${a.selector}` : ''}` : `click ${a.selector}`;
      case 'wait': return `wait ${a.ms} ms`;
      case 'key': return `key ${a.key}`;
      case 'clear': return `clear ${a.selector || 'focused field'}`;
      case 'select': {
        const what = a.index != null ? `#${a.index}` : `"${a.text ?? a.value}"`;
        return `select ${what} in ${a.selector}`;
      }
      default: return a.type;
    }
  }

  // Resolve {...} inside argument values, e.g. default={=a+1}.
  function resolveArgs(args, ctx) {
    const out = { _: [] };
    const res = (v) => (v.includes('{') ? textOf(v, ctx) : v);
    for (const [k, v] of Object.entries(args)) {
      if (k === '_') out._ = v.map(res);
      else out[k] = k === 'selector' ? v : res(v);
    }
    return out;
  }

  function textOf(template, ctx) {
    const sub = { ...ctx, actions: [], fields: null };
    runTemplate(template, sub);
    return sub.actions.filter((x) => x.type === 'text').map((x) => x.value).join('');
  }

  function runCommand(node, ctx, emit) {
    const fn = COMMANDS[node.name];
    if (!fn) {
      if (Object.prototype.hasOwnProperty.call(ctx.vars, node.name)) return FB.formatValue(ctx.vars[node.name]);
      throw new Error(`Unknown command "${node.name}"`);
    }
    return fn(resolveArgs(node.args, ctx), ctx, emit);
  }

  function valueOf(node, ctx) {
    if (node.type === 'expr') return FB.evaluate(node.expr, ctx.vars);
    if (node.type === 'cmd') return runCommand(node, ctx, false);
    if (node.type === 'text') return node.value;
    throw new Error('Unsupported value');
  }

  function emitText(ctx, s) {
    if (s) ctx.actions.push({ type: 'text', value: s });
  }

  function runTemplate(template, ctx) {
    for (const node of FB.parseTemplate(template)) {
      try {
        switch (node.type) {
          case 'text': emitText(ctx, node.value); break;
          case 'expr': emitText(ctx, FB.formatValue(FB.evaluate(node.expr, ctx.vars))); break;
          case 'assign': ctx.vars[node.name] = valueOf(node.value, ctx); break;
          case 'cmd': emitText(ctx, runCommand(node, ctx, true)); break;
        }
      } catch (err) {
        ctx.errors.push(`${node.raw || node.type}: ${err.message}`);
      }
    }
  }

  function mergeText(actions) {
    const out = [];
    for (const a of actions) {
      const last = out[out.length - 1];
      if (a.type === 'text' && last && last.type === 'text') last.value += a.value;
      else out.push({ ...a });
    }
    return out;
  }

  function makeCtx(opts) {
    return {
      vars: Object.create(null),
      formValues: opts.formValues || {},
      lookup: opts.lookup || (() => null),
      actions: [],
      errors: [],
      fields: opts.collect ? [] : null,
      fieldCounter: 0,
      depth: 0,
    };
  }

  /** compile(template, { lookup(shortcut) -> text|null, formValues }) */
  function compile(template, opts) {
    const ctx = makeCtx(opts || {});
    runTemplate(template, ctx);
    return { actions: mergeText(ctx.actions), errors: ctx.errors };
  }

  /** Form fields ({formtext}, {formmenu}, ...) the user must fill before running. */
  function collectFields(template, lookup) {
    const ctx = makeCtx({ lookup, collect: true });
    runTemplate(template, ctx);
    const seen = new Set();
    return ctx.fields.filter((f) => !seen.has(f.name) && seen.add(f.name));
  }

  FB.describeAction = describeAction;
  FB.compile = compile;
  FB.collectFields = collectFields;
  FB.COMMANDS = COMMANDS;
})();
