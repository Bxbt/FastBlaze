// In-page UI (form dialog + toast), isolated in a closed shadow root.
(function () {
  'use strict';
  const FB = (globalThis.FastBlaze = globalThis.FastBlaze || {});

  const STYLE = `
    :host { all: initial; }
    * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans Thai", sans-serif; }
    .backdrop { position: fixed; inset: 0; background: rgba(15, 23, 42, .35); display: flex;
      align-items: flex-start; justify-content: center; padding-top: 12vh; z-index: 2147483647; }
    form { background: #fff; color: #0f172a; width: min(420px, calc(100vw - 32px)); border-radius: 12px;
      box-shadow: 0 20px 50px rgba(0,0,0,.25); padding: 18px; }
    h2 { margin: 0 0 12px; font-size: 15px; font-weight: 600; }
    label { display: block; font-size: 12px; color: #475569; margin: 10px 0 4px; }
    input, select, textarea { width: 100%; font-size: 14px; padding: 8px 10px; border: 1px solid #cbd5e1;
      border-radius: 8px; color: #0f172a; background: #fff; }
    input:focus, select:focus, textarea:focus { outline: 2px solid #f97316; border-color: transparent; }
    .actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; }
    button { font-size: 13px; padding: 7px 14px; border-radius: 8px; border: 1px solid #cbd5e1;
      background: #fff; color: #0f172a; cursor: pointer; }
    button[type=submit] { background: #f97316; border-color: #f97316; color: #fff; font-weight: 600; }
    .toast { position: fixed; right: 16px; bottom: 16px; max-width: 420px; padding: 10px 14px; border-radius: 10px;
      background: #0f172a; color: #fff; font-size: 13px; white-space: pre-wrap; z-index: 2147483647;
      box-shadow: 0 10px 30px rgba(0,0,0,.25); }
    .toast.error { background: #b91c1c; }
    .flash { position: fixed; pointer-events: none; z-index: 2147483646; border-radius: 6px;
      background: rgba(250, 204, 21, .35); outline: 3px solid #facc15;
      box-shadow: 0 0 0 4px rgba(250, 204, 21, .35); transition: opacity .3s ease; }
    .flash.out { opacity: 0; }
  `;

  function mount() {
    const host = document.createElement('fastblaze-ui');
    const root = host.attachShadow({ mode: 'closed' });
    const style = document.createElement('style');
    style.textContent = STYLE;
    root.appendChild(style);
    // Keep page shortcuts from seeing keystrokes typed into our UI.
    for (const t of ['keydown', 'keyup', 'keypress', 'input']) host.addEventListener(t, (e) => e.stopPropagation());
    document.documentElement.appendChild(host);
    return { host, root };
  }

  function el(tag, props, children) {
    const n = document.createElement(tag);
    Object.assign(n, props || {});
    for (const c of children || []) n.append(c);
    return n;
  }

  /** Resolves to { name: value } or null when cancelled. */
  function showForm(fields, title) {
    return new Promise((resolve) => {
      const { host, root } = mount();
      const inputs = fields.map((f) => {
        let input;
        if (f.kind === 'menu') {
          input = el('select', {}, f.options.map((o) => el('option', { value: o, textContent: o })));
          input.value = f.default;
        } else if (f.kind === 'paragraph') {
          input = el('textarea', { rows: 3, value: f.default });
        } else {
          input = el('input', { type: 'text', value: f.default });
          if (f.cols) input.maxLength = f.cols;
        }
        return { f, input };
      });

      const cancel = el('button', { type: 'button', textContent: 'Cancel' });
      const form = el('form', {}, [
        el('h2', { textContent: title || 'FastBlaze' }),
        ...inputs.flatMap(({ f, input }) => [el('label', { textContent: f.name }), input]),
        el('div', { className: 'actions' }, [cancel, el('button', { type: 'submit', textContent: 'Insert' })]),
      ]);
      const backdrop = el('div', { className: 'backdrop' }, [form]);
      root.appendChild(backdrop);

      const done = (values) => {
        host.remove();
        resolve(values);
      };
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        done(Object.fromEntries(inputs.map(({ f, input }) => [f.name, input.value])));
      });
      cancel.addEventListener('click', () => done(null));
      backdrop.addEventListener('mousedown', (e) => { if (e.target === backdrop) done(null); });
      form.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') done(null);
        if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); form.requestSubmit(); }
      });

      const first = inputs[0]?.input;
      if (first) {
        first.focus();
        if (first.select) first.select();
      }
    });
  }

  /** Yellow overlay over an element (does not touch the page's own styles). */
  function flash(target, ms) {
    const r = target.getBoundingClientRect();
    if (!r.width && !r.height) return;
    const { host, root } = mount();
    const box = el('div', { className: 'flash' });
    Object.assign(box.style, {
      left: `${r.left - 3}px`, top: `${r.top - 3}px`, width: `${r.width + 6}px`, height: `${r.height + 6}px`,
    });
    root.appendChild(box);
    setTimeout(() => box.classList.add('out'), ms ?? 450);
    setTimeout(() => host.remove(), (ms ?? 450) + 300);
  }

  function toast(message, kind, ms) {
    const { host, root } = mount();
    root.appendChild(el('div', { className: `toast ${kind || ''}`, textContent: message }));
    setTimeout(() => host.remove(), ms ?? (kind === 'error' ? 6000 : 2500));
  }

  FB.ui = { showForm, toast, flash };
})();
