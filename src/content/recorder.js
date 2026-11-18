// Record mode: watches real clicks / typing / dropdown changes / Enter and turns
// them into steps. Steps go to the background (so recording survives page loads);
// the background builds the snippet with FB.recording.buildRecordedTemplate.
(function () {
  'use strict';
  const FB = (globalThis.FastBlaze = globalThis.FastBlaze || {});
  const GEN = globalThis.__fastblazeGen;
  const alive = () => globalThis.__fastblazeGen === GEN;

  const CLICKABLE = 'a,button,input,select,textarea,label,summary,option,[role=button],[role=option],[role=menuitem],'
    + '[role=tab],[role=checkbox],[role=radio],[role=link],[role=switch],[onclick],[contenteditable=""],[contenteditable="true"],li';

  let rec = null;

  const hasRuntime = () => !!(globalThis.chrome && chrome.runtime && chrome.runtime.sendMessage);
  const send = (msg) => (hasRuntime() ? chrome.runtime.sendMessage(msg).catch(() => null) : Promise.resolve(null));

  const deepTarget = (e) => {
    const t = e.composedPath()[0];
    return t && t.nodeType === 1 ? t : e.target;
  };
  const isOurs = (e) => e.composedPath().some((n) => n && n.tagName === 'FASTBLAZE-UI');
  const parentAcross = (n) => n.parentElement || (n.getRootNode() instanceof ShadowRoot ? n.getRootNode().host : null);

  function clickTarget(el) {
    for (let n = el; n; n = parentAcross(n)) if (n.matches && n.matches(CLICKABLE)) return n;
    return el;
  }

  function editableOf(el) {
    if (!el) return null;
    if (FB.dom.isEditable(el)) return el.isContentEditable ? el.closest('[contenteditable=""],[contenteditable="true"]') || el : el;
    return null;
  }

  const valueOf = (el) => (el.isContentEditable ? el.innerText.replace(/\n$/, '') : el.value);

  function bestRef(el) {
    const c = FB.selector.candidates(el)[0];
    if (!c) return null;
    return c.selector ? { selector: c.selector } : { text: c.text };
  }

  // ---- step bookkeeping ----
  function push(step, label) {
    // The user waited while the page was busy loading (many DOM changes since the last
    // step): replay waits for the page to settle. Plain reading pauses are ignored.
    const now = Date.now();
    const busyPage = rec.mutations > 40;
    rec.mutations = 0;
    if (rec.lastStepAt && now - rec.lastStepAt > 3000 && busyPage && rec.count > 0 && step.type !== 'type') {
      rec.count++;
      rec.local.push({ type: 'idle' });
      send({ type: 'fastblaze:rec-step', step: { type: 'idle' } });
    }
    rec.lastStepAt = now;
    rec.count++;
    rec.local.push(step);
    send({ type: 'fastblaze:rec-step', step });
    updateBar(label);
  }

  const OPTION_ROLES = new Set(['option', 'menuitem', 'menuitemradio', 'menuitemcheckbox', 'treeitem']);

  /** Does this element open a dropdown / popup when clicked? */
  function isDropdownTrigger(el) {
    if (!el || el.nodeType !== 1) return false;
    if (el.hasAttribute('aria-haspopup') || el.hasAttribute('aria-expanded')) return true;
    const role = el.getAttribute('role');
    if (role === 'combobox' || role === 'listbox') return true;
    const hint = `${el.getAttribute('data-testid') || ''} ${el.id || ''} ${typeof el.className === 'string' ? el.className : ''}`;
    return /select|dropdown|picker|combo|menu/i.test(hint);
  }

  /**
   * Is this a choice inside a dropdown? Yes when it has an option / menu role, or when
   * the previous click opened something (a dropdown trigger) and the list appeared
   * after that click. A whole page re-rendered after "Next" does not count.
   */
  function dropdownList(el, prevEl, prevAt) {
    let popup = false;
    const opened = isDropdownTrigger(prevEl);
    for (let n = el; n && n !== document.body; n = parentAcross(n)) {
      const role = n.getAttribute && n.getAttribute('role');
      if (role && (OPTION_ROLES.has(role) || role === 'listbox' || role === 'menu')) { popup = true; break; }
      if (opened && (rec.addedAt.get(n) || 0) >= prevAt) { popup = true; break; }
    }
    if (!popup || isDropdownTrigger(el)) return null;
    const list = FB.selector.listSelector(el);
    return list && list.count >= 2 ? list.selector : null;
  }

  function recordClick(el) {
    // Double / triple clicks (e.g. to select text) are one step.
    if (rec.lastClickEl === el && Date.now() - rec.lastClickAt < 800) { rec.lastClickAt = Date.now(); return; }
    const ref = bestRef(el);
    if (!ref) {
      FB.ui.toast('FastBlaze: no reliable selector for that element (not recorded)', 'error');
      return;
    }
    const prevEl = rec.lastClickEl;
    const prevAt = rec.lastClickAt;
    rec.lastClickEl = el;
    rec.lastClickAt = Date.now();
    const list = FB.dom.isEditable(el) ? null : dropdownList(el, prevEl, prevAt);
    if (list) {
      push({ type: 'click', ...ref, list }, `option ${ref.text ? `"${ref.text}"` : ref.selector}`);
      return;
    }
    push({ type: 'click', ...ref }, `click ${ref.selector || `"${ref.text}"`}`);
  }

  function flushTyping() {
    const p = rec && rec.pending;
    if (!p) return;
    rec.pending = null;
    const value = valueOf(p.el);
    if (value === p.initial) return;
    const secret = p.el.type === 'password';
    const appended = p.initial && value.startsWith(p.initial);
    const step = {
      type: 'type',
      value: appended ? value.slice(p.initial.length) : value,
      clear: !!p.initial && !appended,
      secret,
      field: secret ? (p.el.name || p.el.getAttribute('aria-label') || 'Password') : undefined,
    };
    push(step, secret ? 'type (password, not stored)' : `type "${step.value.slice(0, 30)}"`);
  }

  // ---- event handlers (capture phase, real user events only) ----
  function onClick(e) {
    if (!alive() || !rec || !e.isTrusted || isOurs(e) || (FB.isBusy && FB.isBusy())) return;
    const raw = deepTarget(e);
    const el = clickTarget(raw);
    if (el.tagName === 'SELECT' || el.tagName === 'OPTION') return; // recorded on change
    // A click on a <label> also clicks its control: record only one of them.
    if (rec.labelClick && rec.labelClick.control === el && Date.now() - rec.labelClick.at < 400) return;
    if (el.tagName === 'LABEL' && el.control) rec.labelClick = { control: el.control, at: Date.now() };
    const edit = editableOf(el);
    if (rec.pending && rec.pending.el !== edit) flushTyping();
    if (edit && rec.pending && rec.pending.el === edit) return; // clicking inside the field being typed in
    recordClick(el);
  }

  function onFocusIn(e) {
    if (!alive() || !rec || isOurs(e)) return;
    const el = editableOf(deepTarget(e));
    if (el && !rec.initial.has(el)) rec.initial.set(el, valueOf(el));
  }

  function onInput(e) {
    if (!alive() || !rec || !e.isTrusted || isOurs(e)) return;
    const el = editableOf(FB.dom.deepActiveElement()) || editableOf(deepTarget(e));
    if (!el || el.tagName === 'SELECT') return;
    if (rec.pending && rec.pending.el === el) { updateBar('typing…'); return; }
    flushTyping();
    // Typing into a field reached by Tab / autofocus: click it first so replay focuses it.
    if (rec.lastClickEl !== el && !(rec.lastClickEl && rec.lastClickEl.contains && rec.lastClickEl.contains(el))) recordClick(el);
    const initial = rec.initial.has(el) ? rec.initial.get(el) : '';
    rec.pending = { el, initial };
    updateBar('typing…');
  }

  function onChange(e) {
    if (!alive() || !rec || !e.isTrusted || isOurs(e)) return;
    const el = deepTarget(e);
    if (el.tagName === 'SELECT') {
      flushTyping();
      const ref = bestRef(el);
      const opt = el.selectedOptions[0];
      if (ref && ref.selector && opt) push({ type: 'select', selector: ref.selector, text: opt.text.trim() }, `select "${opt.text.trim()}"`);
      return;
    }
    if (rec.pending && rec.pending.el === el) flushTyping();
  }

  function onKeyDown(e) {
    if (!alive() || !rec || !e.isTrusted || isOurs(e) || (FB.isBusy && FB.isBusy())) return;
    const el = FB.dom.deepActiveElement();
    if (e.key === 'Enter' && !(el && (el.tagName === 'TEXTAREA' || el.isContentEditable))) {
      flushTyping();
      push({ type: 'key', key: 'enter' }, 'key Enter');
    } else if (e.key === 'Escape') {
      flushTyping();
      push({ type: 'key', key: 'escape' }, 'key Escape');
    }
  }

  function onPageHide() { if (rec) flushTyping(); }

  const LISTENERS = [['click', onClick], ['focusin', onFocusIn], ['input', onInput], ['change', onChange], ['keydown', onKeyDown]];

  // ---- recording bar ----
  const STYLE = `
    .rec { position: fixed; top: 12px; left: 50%; transform: translateX(-50%); z-index: 2147483647;
      display: flex; align-items: center; gap: 10px; padding: 8px 10px 8px 14px; border-radius: 999px;
      background: #0f172a; color: #e2e8f0; font: 13px/1.3 -apple-system, "Noto Sans Thai", sans-serif;
      box-shadow: 0 10px 30px rgba(0,0,0,.35); max-width: calc(100vw - 24px); }
    .dot { width: 10px; height: 10px; border-radius: 50%; background: #ef4444; animation: pulse 1.2s infinite; flex: none; }
    @keyframes pulse { 50% { opacity: .35; } }
    .count { font-weight: 700; }
    .last { color: #94a3b8; font: 11.5px ui-monospace, Menlo, monospace; max-width: 260px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    label { display: flex; align-items: center; gap: 5px; color: #cbd5e1; font-size: 12px; cursor: pointer; white-space: nowrap; }
    .count { white-space: nowrap; }
    select { min-width: 118px; background: #1e293b; color: #e2e8f0; border: 1px solid #334155; border-radius: 6px; font-size: 12px; padding: 2px 4px; }
    button { white-space: nowrap; border: none; border-radius: 999px; padding: 5px 12px; font-size: 12.5px; font-weight: 600; cursor: pointer; }
    .stop { background: #f97316; color: #fff; }
    .cancel { background: #334155; color: #e2e8f0; }
  `;

  function showBar() {
    const { host, root } = FB.ui.mount();
    const style = document.createElement('style');
    style.textContent = STYLE;
    root.appendChild(style);
    const E = FB.ui.el;
    const count = E('span', { className: 'count' });
    const last = E('span', { className: 'last' });
    const convert = E('input', { type: 'checkbox', checked: true });
    const dropdowns = E('select', { title: 'How recorded dropdown options are replayed' }, [
      E('option', { value: 'fixed', textContent: 'Same option' }),
      E('option', { value: 'random', textContent: 'Random option' }),
      E('option', { value: 'next', textContent: 'Next each run' }),
    ]);
    const stop = E('button', { type: 'button', className: 'stop', textContent: 'Stop & save' });
    const cancel = E('button', { type: 'button', className: 'cancel', textContent: 'Cancel' });
    stop.addEventListener('click', () => finish(true, convert.checked, dropdowns.value));
    cancel.addEventListener('click', () => finish(false));
    root.appendChild(E('div', { className: 'rec' }, [
      E('span', { className: 'dot' }), E('span', { textContent: 'Recording' }), count, last,
      E('label', { title: 'Typed Thai IDs, phone numbers and emails become generators' }, [convert, 'Test data']),
      E('label', { title: 'Dropdown options' }, ['Dropdowns', dropdowns]),
      stop, cancel,
    ]));
    rec.bar = { host, count, last };
    updateBar('');
  }

  function updateBar(label) {
    if (!rec || !rec.bar) return;
    rec.bar.count.textContent = `${rec.count} step${rec.count === 1 ? '' : 's'}`;
    if (label) rec.bar.last.textContent = label;
  }

  // ---- lifecycle ----
  /** Start (or resume after a page load) recording in this tab. */
  function begin(opts) {
    if (rec) return;
    opts = opts || {};
    rec = { count: opts.count || 0, local: [], pending: null, initial: new WeakMap(), addedAt: new WeakMap(), observer: null, mutations: 0, lastClickEl: null, lastClickAt: 0, lastStepAt: 0, labelClick: null, bar: null };
    for (const [type, fn] of LISTENERS) window.addEventListener(type, fn, true);
    window.addEventListener('pagehide', onPageHide);
    rec.observer = new MutationObserver((records) => {
      for (const r of records) {
        if (r.target && r.target.nodeName === 'FASTBLAZE-UI') continue;
        rec.mutations += r.addedNodes.length + r.removedNodes.length;
        for (const n of r.addedNodes) if (n.nodeType === 1 && n.tagName !== 'FASTBLAZE-UI') rec.addedAt.set(n, Date.now());
      }
    });
    rec.observer.observe(document.documentElement, { childList: true, subtree: true });
    showBar();
  }

  /** Remove listeners and the bar (no save). */
  function end() {
    if (!rec) return;
    for (const [type, fn] of LISTENERS) window.removeEventListener(type, fn, true);
    window.removeEventListener('pagehide', onPageHide);
    if (rec.observer) rec.observer.disconnect();
    if (rec.bar) rec.bar.host.remove();
    rec = null;
  }

  async function finish(save, convert, dropdowns) {
    if (!rec) return;
    flushTyping();
    const steps = rec.local;
    const count = rec.count;
    end();
    if (!hasRuntime()) {
      // Test harness: build locally.
      FB.recorder.lastTemplate = save && FB.recording ? FB.recording.buildRecordedTemplate(steps, { convert, dropdowns }) : null;
      FB.ui.toast(save ? `Recorded ${count} steps` : 'Recording cancelled');
      return;
    }
    const res = await send({ type: 'fastblaze:rec-stop', save, convert, dropdowns, host: location.host, title: document.title });
    if (save) FB.ui.toast(res && res.ok ? `Saved ${res.count} steps` : `Not saved: ${(res && res.error) || 'no steps'}`, res && res.ok ? '' : 'error');
    else FB.ui.toast('Recording cancelled');
  }

  // Resume after navigation / reload if this tab is being recorded.
  if (hasRuntime() && window === window.top) {
    send({ type: 'fastblaze:rec-status' }).then((s) => { if (alive() && s && s.recording) begin({ count: s.count }); });
  }

  FB.recorder = { begin, end, finish, isRecording: () => !!rec, steps: () => (rec ? rec.local.slice() : []) };
})();
