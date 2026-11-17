// Element picker: hover to preview, click to get selector candidates for {click}/{select}.
(function () {
  'use strict';
  const FB = (globalThis.FastBlaze = globalThis.FastBlaze || {});
  const LAST_PICK_KEY = 'fastblaze.lastPick';

  const STYLE = `
    .pick-box { position: fixed; pointer-events: none; z-index: 2147483646; border-radius: 4px;
      background: rgba(250, 204, 21, .25); outline: 2px solid #facc15; transition: all .05s; }
    .pick-tip { position: fixed; pointer-events: none; z-index: 2147483647; max-width: 60vw;
      background: #0f172a; color: #fde68a; font: 11px/1.4 ui-monospace, Menlo, monospace;
      padding: 3px 7px; border-radius: 6px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .pick-bar { position: fixed; top: 12px; left: 50%; transform: translateX(-50%); z-index: 2147483647;
      background: #0f172a; color: #e2e8f0; padding: 8px 14px; border-radius: 999px; font-size: 13px;
      box-shadow: 0 10px 30px rgba(0,0,0,.3); white-space: nowrap; }
    .pick-bar kbd { background: #334155; border-radius: 4px; padding: 1px 5px; font-size: 11px; }
    .result { position: fixed; top: 16px; right: 16px; width: 460px; max-width: calc(100vw - 32px);
      max-height: calc(100vh - 32px); overflow: auto; background: #0f172a; color: #e2e8f0;
      border-radius: 12px; padding: 14px; z-index: 2147483647; box-shadow: 0 20px 50px rgba(0,0,0,.4); font-size: 12px; }
    .result h3 { margin: 0 0 4px; font-size: 14px; color: #fff; }
    .result .sub { color: #94a3b8; margin-bottom: 10px; font-family: ui-monospace, Menlo, monospace; font-size: 11px; }
    .cand { border: 1px solid #1e293b; border-radius: 8px; padding: 8px; margin-bottom: 8px; }
    .cand:hover { border-color: #facc15; }
    .cand .meta { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; color: #94a3b8; }
    .cand code { display: block; font: 12px/1.45 ui-monospace, Menlo, monospace; color: #fde68a; word-break: break-all; }
    .badge { font-size: 10px; font-weight: 700; text-transform: uppercase; padding: 1px 6px; border-radius: 4px; }
    .badge.stable { background: #14532d; color: #86efac; }
    .badge.ok { background: #713f12; color: #fde68a; }
    .badge.fragile { background: #7f1d1d; color: #fca5a5; }
    .cand button, .result .actions button { margin-left: auto; background: #334155; color: #fff; border: none;
      border-radius: 6px; padding: 3px 10px; font-size: 12px; cursor: pointer; }
    .cand button:hover, .result .actions button:hover { background: #f97316; }
    .result .actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 4px; }
    .result .warn { color: #fca5a5; margin: 0 0 10px; }
    .result .copied { color: #86efac; margin: 0 0 10px; }
  `;

  let session = null;

  function describeEl(el) {
    const tag = el.tagName.toLowerCase();
    const t = FB.selector.candidates(el)[0];
    return t ? (t.text != null ? `${tag} "${t.text}"` : t.selector) : tag;
  }

  function isOurs(e) {
    return session && e.composedPath().includes(session.host);
  }

  // opts.returnTo: picked for the Manage page; send the result back instead of showing the panel.
  function start(opts) {
    if (session) return;
    opts = opts || {};
    closeResult();
    const { host, root } = FB.ui.mount();
    const style = document.createElement('style');
    style.textContent = STYLE;
    root.appendChild(style);
    const box = FB.ui.el('div', { className: 'pick-box' });
    const tip = FB.ui.el('div', { className: 'pick-tip' });
    const bar = FB.ui.el('div', { className: 'pick-bar' });
    bar.innerHTML = 'Click an element &nbsp;·&nbsp; <kbd>↑</kbd> parent <kbd>↓</kbd> child &nbsp;·&nbsp; <kbd>Esc</kbd> cancel';
    box.hidden = tip.hidden = true;
    root.append(box, tip, bar);
    session = { host, box, tip, current: null, trail: [], returnTo: !!opts.returnTo };

    window.addEventListener('mousemove', onMove, true);
    window.addEventListener('keydown', onKey, true);
    for (const t of BLOCKED) window.addEventListener(t, onBlocked, true);
  }

  const BLOCKED = ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click', 'dblclick', 'contextmenu'];

  function stop() {
    if (!session) return;
    window.removeEventListener('mousemove', onMove, true);
    window.removeEventListener('keydown', onKey, true);
    for (const t of BLOCKED) window.removeEventListener(t, onBlocked, true);
    session.host.remove();
    session = null;
  }

  function setCurrent(el, keepTrail) {
    if (!el || el === document.documentElement || el === document.body) return;
    if (!keepTrail) session.trail = [];
    session.current = el;
    const r = el.getBoundingClientRect();
    Object.assign(session.box.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
    session.tip.textContent = describeEl(el);
    const below = r.bottom + 26 < window.innerHeight;
    Object.assign(session.tip.style, { left: `${Math.max(4, r.left)}px`, top: `${below ? r.bottom + 4 : Math.max(4, r.top - 24)}px` });
    session.box.hidden = session.tip.hidden = false;
  }

  // elementFromPoint stops at shadow hosts; keep descending into open shadow roots.
  function deepElementFromPoint(x, y) {
    let el = document.elementFromPoint(x, y);
    while (el && el.shadowRoot) {
      const inner = el.shadowRoot.elementFromPoint(x, y);
      if (!inner || inner === el) break;
      el = inner;
    }
    return el;
  }

  function onMove(e) {
    if (isOurs(e)) return;
    const el = deepElementFromPoint(e.clientX, e.clientY);
    if (el && el !== session.current && el !== session.host) setCurrent(el);
  }

  function onKey(e) {
    if (!e.isTrusted) return;
    const keys = { Escape: 1, ArrowUp: 1, ArrowDown: 1, Enter: 1 };
    if (!keys[e.key]) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    const cur = session.current;
    if (e.key === 'Escape') stop();
    else if (e.key === 'ArrowUp' && cur && cur.parentElement) {
      session.trail.push(cur);
      setCurrent(cur.parentElement, true);
    } else if (e.key === 'ArrowDown' && session.trail.length) setCurrent(session.trail.pop(), true);
    else if (e.key === 'Enter' && cur) pick(cur);
  }

  function onBlocked(e) {
    if (isOurs(e)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (e.type === 'click') pick(session.current || deepElementFromPoint(e.clientX, e.clientY) || e.target);
  }

  // ---- result panel ----
  let result = null;

  function closeResult() {
    if (result) result.host.remove();
    result = null;
  }

  async function pick(el) {
    const returnTo = session && session.returnTo;
    stop();
    const cands = FB.selector.candidates(el);
    const commands = cands.map((c) => FB.selector.toCommand(c, el));
    let copied = false;
    if (commands[0]) {
      try {
        await navigator.clipboard.writeText(commands[0]);
        copied = true;
      } catch { /* clipboard needs focus; the Copy buttons still work */ }
      chrome.storage.local.set({
        [LAST_PICK_KEY]: {
          command: commands[0], commands, url: location.href, at: Date.now(),
          candidates: cands.map((c) => ({ selector: c.selector ?? null, text: c.text ?? null, stability: c.stability, kind: c.kind })),
        },
      });
    }
    FB.ui.flash(el, 900);
    if (returnTo) {
      FB.ui.toast(cands.length ? 'Element sent to FastBlaze' : 'No reliable selector for this element', cands.length ? '' : 'error');
      return;
    }
    showResult(el, cands, commands, copied);
  }

  function showResult(el, cands, commands, copied) {
    closeResult();
    const { host, root } = FB.ui.mount();
    const style = document.createElement('style');
    style.textContent = STYLE;
    root.appendChild(style);
    const E = FB.ui.el;

    const rows = cands.map((c, i) => {
      const btn = E('button', { type: 'button', textContent: 'Copy' });
      btn.addEventListener('click', async () => {
        await navigator.clipboard.writeText(commands[i]);
        chrome.storage.local.set({ [LAST_PICK_KEY]: { command: commands[i], commands, url: location.href, at: Date.now() } });
        btn.textContent = 'Copied';
        setTimeout(() => { btn.textContent = 'Copy'; }, 1200);
      });
      const row = E('div', { className: 'cand' }, [
        E('div', { className: 'meta' }, [
          E('span', { className: `badge ${c.stability}`, textContent: c.stability }),
          E('span', { textContent: c.kind + (c.count > 1 ? ` · ${c.count} matches (first visible is used)` : '') }),
          btn,
        ]),
        E('code', { textContent: commands[i] }),
      ]);
      row.addEventListener('mouseenter', () => {
        const target = c.text != null ? FB.dom.findByText(c.text) : FB.dom.findElement(c.selector);
        if (target) FB.ui.flash(target, 500);
      });
      return row;
    });

    const again = E('button', { type: 'button', textContent: 'Pick another' });
    again.addEventListener('click', () => { closeResult(); start(); });
    const close = E('button', { type: 'button', textContent: 'Close' });
    close.addEventListener('click', closeResult);

    const notes = [];
    if (copied) notes.push(E('p', { className: 'copied', textContent: 'Best command copied — also available as "Insert picked" in the editor.' }));
    if (!cands.length) notes.push(E('p', { className: 'warn', textContent: 'No reliable selector found for this element.' }));
    else if (cands[0].stability === 'fragile') {
      notes.push(E('p', { className: 'warn', textContent: 'Only fragile selectors (layout/classes). Ask devs for a data-testid on this element.' }));
    }

    root.appendChild(E('div', { className: 'result' }, [
      E('h3', { textContent: 'Picked element' }),
      E('div', { className: 'sub', textContent: `<${el.tagName.toLowerCase()}> ${normText(el.textContent).slice(0, 60)}` }),
      ...notes,
      ...rows,
      E('div', { className: 'actions' }, [again, close]),
    ]));
    result = { host };
  }

  const normText = (s) => (s || '').replace(/\s+/g, ' ').trim();

  window.addEventListener('keydown', (e) => {
    if (result && !session && e.key === 'Escape' && e.isTrusted) closeResult();
  }, true);

  FB.picker = { start, stop, LAST_PICK_KEY };
})();
