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

  /** Value + caret of a text field (null for contenteditable). */
  function snapshot(el) {
    return isTextField(el) ? { value: el.value, caret: caret(el) } : null;
  }

  /** Put a text field back to a snapshot, firing input events so frameworks see it. */
  function restoreValue(el, snap) {
    if (el.value !== snap.value) {
      el.focus({ preventScroll: true });
      el.select();
      const ok = snap.value ? document.execCommand('insertText', false, snap.value) : document.execCommand('delete');
      if (!ok || el.value !== snap.value) {
        setNativeValue(el, snap.value);
        el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'deleteContentBackward' }));
      }
    }
    if (snap.caret) {
      try { el.setSelectionRange(snap.caret.start, snap.caret.end); } catch { /* not supported */ }
    }
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

  /**
   * querySelectorAll that understands "|>" to step into an (open) shadow root:
   * "#editor |> .input" = ".input" inside the shadow DOM of "#editor". Chainable.
   */
  function queryAllDeep(selector) {
    const parts = String(selector).split('|>').map((x) => x.trim());
    if (parts.some((x) => !x)) throw new SyntaxError(`Bad selector "${selector}"`);
    let scopes = [document];
    for (let i = 0; i < parts.length; i++) {
      const found = [];
      for (const scope of scopes) for (const el of scope.querySelectorAll(parts[i])) found.push(el); // SyntaxError on bad CSS
      if (i === parts.length - 1) return found;
      scopes = found.map((el) => el.shadowRoot).filter(Boolean);
    }
    return [];
  }

  function findElement(selector) {
    for (const el of queryAllDeep(selector)) if (isVisible(el)) return el;
    return null;
  }

  const normText = (s) => (s || '').replace(/\s+/g, ' ').trim();

  /** First visible element whose whole text equals `text` (deepest match wins). */
  function findByText(text, scope) {
    const want = normText(text);
    let best = null;
    const pool = scope
      ? queryAllDeep(scope).flatMap((root) => [root, ...(root.shadowRoot || root).querySelectorAll('*')])
      : document.querySelectorAll('body *');
    for (const el of pool) {
      if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE') continue;
      if (best && !best.contains(el)) continue; // keep the first match; only go deeper
      if (normText(el.textContent) === want && isVisible(el)) best = el;
    }
    return best;
  }

  class Cancelled extends Error {
    constructor() {
      super('Stopped');
      this.name = 'Cancelled';
    }
  }

  // Sleep that wakes up early when the run is cancelled.
  async function pause(ms, run) {
    const until = Date.now() + ms;
    for (;;) {
      if (run && run.cancelled) throw new Cancelled();
      const left = until - Date.now();
      if (left <= 0) return;
      await sleep(Math.min(50, left));
    }
  }

  async function waitForElement(selector, timeout, run, text) {
    const until = Date.now() + timeout;
    const label = text != null ? `text "${text}"${selector ? ` in ${selector}` : ''}` : selector;
    for (;;) {
      if (run && run.cancelled) throw new Cancelled();
      const el = text != null ? findByText(text, selector) : findElement(selector);
      if (el) return el;
      if (Date.now() > until) throw new Error(`Element not found after ${timeout / 1000}s: ${label}`);
      await sleep(text != null ? 100 : 50);
    }
  }

  // ---- "really clickable" checks ----------------------------------------------
  const isOurUi = (n) => !!n && n.nodeType === 1 && n.closest && n.closest('fastblaze-ui');

  function deepElementAt(x, y) {
    let el = document.elementFromPoint(x, y);
    while (el && el.shadowRoot) {
      const inner = el.shadowRoot.elementFromPoint(x, y);
      if (!inner || inner === el) break;
      el = inner;
    }
    return el;
  }

  const containsDeep = (outer, inner) => {
    for (let n = inner; n; n = n.parentElement || (n.getRootNode() instanceof ShadowRoot ? n.getRootNode().host : null)) {
      if (n === outer) return true;
    }
    return false;
  };

  /** null when the element can be clicked now, otherwise a short reason. */
  function notClickableReason(el) {
    if (!el.isConnected) return 'it was replaced on the page';
    if (!isVisible(el)) return 'it is hidden';
    if (el.disabled || el.getAttribute('aria-disabled') === 'true' || el.closest('[inert], fieldset[disabled]')) return 'it is disabled';
    if (getComputedStyle(el).pointerEvents === 'none') return 'it does not accept clicks yet';
    const r = el.getBoundingClientRect();
    const x = r.left + Math.min(r.width / 2, Math.max(1, r.width - 1));
    const y = r.top + Math.min(r.height / 2, Math.max(1, r.height - 1));
    if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) return 'it is off screen';
    const hit = deepElementAt(x, y);
    if (hit && !isOurUi(hit) && hit !== el && !containsDeep(el, hit) && !containsDeep(hit, el)) {
      const who = hit.id ? `#${hit.id}` : `<${hit.tagName.toLowerCase()}${hit.classList[0] ? ` .${hit.classList[0]}` : ''}>`;
      return `it is covered by ${who}`;
    }
    return null;
  }

  /**
   * Wait until the element exists AND can be clicked: visible, enabled, not covered,
   * and not moving (same position on two checks in a row, so animations finish).
   */
  async function waitForClickable(selector, timeout, run, text) {
    const until = Date.now() + timeout;
    const label = text != null ? `text "${text}"${selector ? ` in ${selector}` : ''}` : selector;
    let lastRect = null;
    let scrolled = null;
    let reason = 'not found';
    for (;;) {
      if (run && run.cancelled) throw new Cancelled();
      const el = text != null ? findByText(text, selector) : findElement(selector);
      if (el) {
        if (scrolled !== el) { el.scrollIntoView({ block: 'center', inline: 'nearest' }); scrolled = el; lastRect = null; }
        const r = el.getBoundingClientRect();
        const still = lastRect && Math.abs(r.left - lastRect.left) < 1 && Math.abs(r.top - lastRect.top) < 1
          && Math.abs(r.width - lastRect.width) < 1 && Math.abs(r.height - lastRect.height) < 1;
        lastRect = r;
        reason = notClickableReason(el) || (still ? null : 'it is still moving');
        if (!reason) return el;
      } else reason = 'not found';
      if (Date.now() > until) {
        throw new Error(reason === 'not found'
          ? `Element not found after ${timeout / 1000}s: ${label}`
          : `Element found but not clickable after ${timeout / 1000}s (${reason}): ${label}`);
      }
      await sleep(text != null ? 100 : 50);
    }
  }

  /** {waitfor}: until something is visible (state=visible) or no longer visible (state=gone). */
  async function waitForState(a, timeout, run) {
    const until = Date.now() + timeout;
    const label = a.text != null ? `text "${a.text}"` : a.selector;
    for (;;) {
      if (run && run.cancelled) throw new Cancelled();
      const el = a.text != null ? findByText(a.text, a.selector) : findElement(a.selector);
      if (a.state === 'gone' ? !el : !!el) return el;
      if (Date.now() > until) {
        throw new Error(a.state === 'gone' ? `Still visible after ${timeout / 1000}s: ${label}` : `Did not appear within ${timeout / 1000}s: ${label}`);
      }
      await sleep(a.text != null ? 100 : 50);
    }
  }

  /** {wait: idle}: resolves once the page has had no DOM changes for `quiet` ms (gives up at `timeout`). */
  function waitForIdle(quiet, timeout, run) {
    return new Promise((resolve, reject) => {
      let last = Date.now();
      const start = last;
      const obs = new MutationObserver((records) => {
        // Our own UI (progress panel, highlights) does not count.
        if (records.some((r) => !isOurUi(r.target) && ![...r.addedNodes, ...r.removedNodes].every((n) => n.nodeName === 'FASTBLAZE-UI'))) last = Date.now();
      });
      obs.observe(document.documentElement, { subtree: true, childList: true, attributes: true, characterData: true });
      const timer = setInterval(() => {
        const now = Date.now();
        if (run && run.cancelled) { done(); reject(new Cancelled()); } else if (now - last >= quiet || now - start >= timeout) { done(); resolve(); }
      }, 50);
      function done() { clearInterval(timer); obs.disconnect(); }
    });
  }

  function clearField(el) {
    if (!isEditable(el)) throw new Error('Not a text field (nothing to clear)');
    el.focus({ preventScroll: true });
    if (isTextField(el)) {
      if (!el.value) return;
      el.select();
      if (!document.execCommand('delete') || el.value) {
        setNativeValue(el, '');
        el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'deleteContentBackward' }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }
      return;
    }
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    document.execCommand('delete');
  }

  function selectOption(el, a) {
    if (el.tagName !== 'SELECT') throw new Error(`Not a <select> (found <${el.tagName.toLowerCase()}>)`);
    const opts = [...el.options];
    let opt;
    if (a.index != null) opt = opts[a.index];
    else if (a.text != null) opt = opts.find((o) => o.text.trim() === a.text);
    else opt = opts.find((o) => o.value === a.value) || opts.find((o) => o.text.trim() === a.value);
    if (!opt) {
      const list = opts.slice(0, 8).map((o) => `"${o.text.trim()}"`).join(', ');
      throw new Error(`Option not found. Available: ${list}${opts.length > 8 ? ', …' : ''}`);
    }
    el.focus({ preventScroll: true });
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(el, opt.value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
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

  /**
   * Run compiled actions. Text goes into whatever element has focus.
   * opts: { run: { cancelled }, timeout, stepDelay, highlight, onStep(i, n, action) }
   * Failures throw an Error whose message names the step; err.element is the element involved (if any).
   */
  async function execute(actions, opts) {
    opts = opts || {};
    const run = opts.run || { cancelled: false };
    const timeout = opts.timeout ?? 5000;
    const stepDelay = opts.stepDelay ?? 60;
    const automation = actions.some((a) => a.type !== 'text');
    const mark = (el) => {
      el.scrollIntoView({ block: 'center', inline: 'nearest' });
      if (opts.highlight !== false && FB.ui) FB.ui.flash(el);
    };

    for (let i = 0; i < actions.length; i++) {
      const a = actions[i];
      if (run.cancelled) throw new Cancelled();
      if (opts.onStep) opts.onStep(i, actions.length, a);
      let el = null;
      try {
        switch (a.type) {
          case 'text':
            el = deepActiveElement();
            typeText(a.value, automation);
            break;
          case 'click': {
            // Wait until really clickable; if the page re-renders the element right
            // before the click, find it again (up to 3 tries).
            const wait = a.force ? waitForElement : waitForClickable;
            for (let attempt = 1; ; attempt++) {
              el = await wait(a.selector, a.timeout ?? timeout, run, a.text);
              mark(el);
              if (el.isConnected || attempt >= 3) break;
            }
            simulateClick(el);
            await pause(stepDelay, run);
            break;
          }
          case 'waitfor':
            el = await waitForState(a, a.timeout ?? timeout, run);
            if (el) mark(el);
            break;
          case 'idle':
            await waitForIdle(a.quiet, a.timeout, run);
            break;
          case 'wait':
            await pause(a.ms, run);
            break;
          case 'key':
            el = deepActiveElement();
            pressKey(a.key);
            await pause(stepDelay, run);
            break;
          case 'clear':
            if (a.selector) {
              el = await waitForElement(a.selector, timeout, run);
              mark(el);
            } else el = deepActiveElement();
            clearField(el);
            break;
          case 'select':
            el = await waitForElement(a.selector, timeout, run);
            mark(el);
            selectOption(el, a);
            await pause(stepDelay, run);
            break;
          default:
            throw new Error(`Unknown action "${a.type}"`);
        }
      } catch (err) {
        if (err instanceof Cancelled) throw err;
        const label = FB.describeAction ? FB.describeAction(a) : a.type;
        const wrapped = new Error(`Step ${i + 1}/${actions.length}: ${label}\n→ ${err.message}`);
        wrapped.step = i;
        wrapped.element = el && el !== document.body && isVisible(el) ? el : null;
        throw wrapped;
      }
    }
  }

  FB.dom = {
    isEditable, deepActiveElement, textBeforeCaret, deleteBeforeCaret, snapshot, restoreValue,
    insertText, typeText, findElement, findByText, queryAllDeep, isVisible, waitForElement, simulateClick, pressKey,
    clearField, selectOption, saveSelection, restoreSelection, execute, sleep, Cancelled,
  };
})();
