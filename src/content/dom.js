// DOM helpers: React-safe text insertion, realistic clicks, wait-for-element.
(function () {
  'use strict';
  const FB = (globalThis.FastBlaze = globalThis.FastBlaze || {});
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const TEXT_TYPES = new Set(['text', 'search', 'url', 'tel', 'password', 'email', 'number']);

  function isTextField(el) {
    if (!el) return false;
    if (el.tagName === 'TEXTAREA') return true;
    return el.tagName === 'INPUT' && TEXT_TYPES.has(el.type);
  }

  function isEditable(el) {
    return !!el && (isTextField(el) || el.isContentEditable);
  }

  function deepActiveElement() {
    let el = document.activeElement;
    while (el && el.shadowRoot && el.shadowRoot.activeElement) el = el.shadowRoot.activeElement;
    return el;
  }

  // email/number inputs throw on selectionStart access.
  function caret(el) {
    try {
      return el.selectionStart == null ? null : { start: el.selectionStart, end: el.selectionEnd };
    } catch {
      return null;
    }
  }

  function textBeforeCaret(el) {
    if (isTextField(el)) {
      const c = caret(el);
      return c ? el.value.slice(0, c.start) : null;
    }
    if (el && el.isContentEditable) {
      const sel = window.getSelection();
      if (!sel || !sel.rangeCount || !sel.isCollapsed) return null;
      const { startContainer, startOffset } = sel.getRangeAt(0);
      if (startContainer.nodeType !== Node.TEXT_NODE) return null;
      return startContainer.textContent.slice(0, startOffset);
    }
    return null;
  }

  // Bypass React's value tracker so onChange fires.
  function setNativeValue(el, value) {
    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
  }

  function fallbackReplace(el, start, end, text) {
    const v = el.value;
    setNativeValue(el, v.slice(0, start) + text + v.slice(end));
    try { el.setSelectionRange(start + text.length, start + text.length); } catch { /* not supported */ }
    el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: text ? 'insertText' : 'deleteContentBackward', data: text || null }));
  }

  function deleteBeforeCaret(el, count) {
    if (isTextField(el)) {
      const c = caret(el);
      if (!c) return;
      el.setSelectionRange(c.start - count, c.start);
      if (!document.execCommand('delete')) fallbackReplace(el, c.start - count, c.start, '');
      return;
    }
    const sel = window.getSelection();
    for (let i = 0; i < count; i++) sel.modify('extend', 'backward', 'character');
    document.execCommand('delete');
  }

  function insertText(text) {
    const el = deepActiveElement();
    if (!isEditable(el)) throw new Error(`No editable field focused to type "${text.slice(0, 30)}"`);
    // execCommand keeps undo history and fires native input events (works with React/Vue).
    if (document.execCommand('insertText', false, text)) return;
    if (isTextField(el)) {
      const c = caret(el) || { start: el.value.length, end: el.value.length };
      fallbackReplace(el, c.start, c.end, text);
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }

  // perChar: type one character at a time (helps masked inputs like dates).
  function typeText(text, perChar) {
    if (!perChar) return insertText(text);
    for (const ch of Array.from(text)) insertText(ch);
  }

  function isVisible(el) {
    if (!el.getClientRects().length) return false;
    const s = getComputedStyle(el);
    return s.visibility !== 'hidden' && s.display !== 'none';
  }

  function findElement(selector) {
    const all = document.querySelectorAll(selector); // throws SyntaxError on bad selector
    for (const el of all) if (isVisible(el)) return el;
    return null;
  }

  async function waitForElement(selector, timeout) {
    const until = Date.now() + timeout;
    for (;;) {
      const el = findElement(selector);
      if (el) return el;
      if (Date.now() > until) throw new Error(`Element not found: ${selector}`);
      await sleep(50);
    }
  }

  function simulateClick(el) {
    el.scrollIntoView({ block: 'center', inline: 'nearest' });
    const r = el.getBoundingClientRect();
    const base = {
      bubbles: true, cancelable: true, composed: true, view: window, button: 0,
      clientX: r.left + r.width / 2, clientY: r.top + r.height / 2,
    };
    const ptr = { ...base, pointerId: 1, pointerType: 'mouse', isPrimary: true };
    el.dispatchEvent(new PointerEvent('pointerdown', ptr));
    const notPrevented = el.dispatchEvent(new MouseEvent('mousedown', { ...base, buttons: 1 }));
    if (notPrevented && typeof el.focus === 'function') el.focus({ preventScroll: true });
    el.dispatchEvent(new PointerEvent('pointerup', ptr));
    el.dispatchEvent(new MouseEvent('mouseup', base));
    el.dispatchEvent(new MouseEvent('click', base));
  }

  const FOCUSABLE = 'a[href],button,input,select,textarea,[tabindex]:not([tabindex="-1"]),[contenteditable="true"]';

  function focusNext(backward) {
    const list = [...document.querySelectorAll(FOCUSABLE)].filter((e) => !e.disabled && isVisible(e));
    const i = list.indexOf(deepActiveElement());
    const next = list[(i + (backward ? -1 : 1) + list.length) % list.length];
    if (next) next.focus();
  }

  const KEYS = {
    enter: { key: 'Enter', code: 'Enter', keyCode: 13 },
    tab: { key: 'Tab', code: 'Tab', keyCode: 9 },
    escape: { key: 'Escape', code: 'Escape', keyCode: 27 },
    esc: { key: 'Escape', code: 'Escape', keyCode: 27 },
    space: { key: ' ', code: 'Space', keyCode: 32 },
    up: { key: 'ArrowUp', code: 'ArrowUp', keyCode: 38 },
    down: { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40 },
    left: { key: 'ArrowLeft', code: 'ArrowLeft', keyCode: 37 },
    right: { key: 'ArrowRight', code: 'ArrowRight', keyCode: 39 },
    backspace: { key: 'Backspace', code: 'Backspace', keyCode: 8 },
  };

  function pressKey(name) {
    const k = KEYS[name];
    if (!k) throw new Error(`Unknown key "${name}"`);
    const el = deepActiveElement() || document.body;
    const opts = { ...k, which: k.keyCode, bubbles: true, cancelable: true, composed: true };
    const ok = el.dispatchEvent(new KeyboardEvent('keydown', opts));
    if (name === 'enter') el.dispatchEvent(new KeyboardEvent('keypress', { ...opts, charCode: 13 }));
    el.dispatchEvent(new KeyboardEvent('keyup', opts));
    if (!ok) return;
    // Synthetic key events have no default action; emulate the useful ones.
    if (name === 'tab') focusNext(false);
    else if (name === 'enter' && el.tagName === 'INPUT' && el.form) el.form.requestSubmit();
    else if (name === 'backspace' && isEditable(el)) document.execCommand('delete');
  }

  function saveSelection(el) {
    if (isTextField(el)) return { el, caret: caret(el) };
    const sel = window.getSelection();
    return { el, range: sel && sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null };
  }

  function restoreSelection(saved) {
    if (!saved || !saved.el) return;
    saved.el.focus({ preventScroll: true });
    if (saved.caret) {
      try { saved.el.setSelectionRange(saved.caret.start, saved.caret.end); } catch { /* ignore */ }
    } else if (saved.range) {
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(saved.range);
    }
  }

  /** Run compiled actions. Text goes into whatever element has focus. */
  async function execute(actions, opts) {
    opts = opts || {};
    const timeout = opts.timeout ?? 5000;
    const stepDelay = opts.stepDelay ?? 60;
    const automation = actions.some((a) => a.type !== 'text');
    for (const a of actions) {
      if (a.type === 'text') typeText(a.value, automation);
      else if (a.type === 'click') {
        const el = await waitForElement(a.selector, timeout);
        el.scrollIntoView({ block: 'center', inline: 'nearest' });
        if (opts.highlight !== false && FB.ui) FB.ui.flash(el);
        simulateClick(el);
        await sleep(stepDelay);
      } else if (a.type === 'wait') await sleep(a.ms);
      else if (a.type === 'key') {
        pressKey(a.key);
        await sleep(stepDelay);
      }
    }
  }

  FB.dom = {
    isEditable, deepActiveElement, textBeforeCaret, deleteBeforeCaret,
    insertText, typeText, findElement, waitForElement, simulateClick, pressKey,
    saveSelection, restoreSelection, execute, sleep,
  };
})();
