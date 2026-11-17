// Styled replacements for confirm() / prompt() / alert() on extension pages.
// Messages accept an array of parts: strings, or { b: 'text' } for bold.
(function () {
  'use strict';
  const FB = (globalThis.FastBlaze = globalThis.FastBlaze || {});

  function el(tag, props, children) {
    const n = document.createElement(tag);
    Object.assign(n, props || {});
    for (const c of children || []) n.append(c);
    return n;
  }

  const render = (parts) => (Array.isArray(parts) ? parts : [parts])
    .map((p) => (typeof p === 'string' ? p : el('strong', { textContent: p.b })));

  function open(o) {
    return new Promise((resolve) => {
      const dlg = el('dialog', { className: `fb-dialog${o.danger ? ' is-danger' : ''}` });
      const form = el('form', { method: 'dialog' });
      if (o.title) form.append(el('h3', { textContent: o.title }));
      if (o.message) form.append(el('p', {}, render(o.message)));

      let field = null;
      if (o.input) {
        field = el('input', { type: 'text', value: o.input.value || '', placeholder: o.input.placeholder || '' });
        form.append(o.input.label ? el('label', { className: 'fb-dialog-label' }, [o.input.label, field]) : field);
      }

      const ok = el('button', { type: 'submit', className: o.danger ? 'danger-solid' : 'primary' },
        [...(o.icon && FB.icon ? [FB.icon(o.icon)] : []), o.confirmLabel || 'OK']);
      const cancel = el('button', { type: 'button', className: 'outline', textContent: o.cancelLabel || 'Cancel' });
      form.append(el('div', { className: 'fb-dialog-actions' }, [...(o.hideCancel ? [] : [cancel]), ok]));
      dlg.append(form);
      document.body.append(dlg);

      let result = null;
      cancel.addEventListener('click', () => dlg.close());
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        if (field && o.input.required && !field.value.trim()) {
          field.focus();
          return;
        }
        result = field ? field.value.trim() : true;
        dlg.close();
      });
      // Click on the dimmed backdrop = cancel.
      dlg.addEventListener('mousedown', (e) => { if (e.target === dlg) dlg.close(); });
      dlg.addEventListener('close', () => {
        dlg.remove();
        resolve(result ?? (field ? null : false));
      });

      dlg.showModal();
      if (field) {
        field.focus();
        field.select();
      } else (o.danger ? cancel : ok).focus(); // safe default for destructive actions
    });
  }

  FB.dialog = {
    /** Resolves true / false. */
    confirm: (o) => open(o),
    /** Resolves the trimmed text, or null when cancelled. */
    prompt: (o) => open({
      ...o,
      input: { value: o.value, placeholder: o.placeholder, label: o.label, required: o.required !== false },
    }),
    /** Resolves when closed. */
    alert: (o) => open({ ...o, hideCancel: true }),
  };
})();
