// Watches typing for snippet shortcuts and runs snippets requested by the popup.
(function () {
  'use strict';
  if (globalThis.__fastblazeLoaded) return;
  globalThis.__fastblazeLoaded = true;

  const FB = globalThis.FastBlaze;
  let snippets = [];
  let byShortcut = new Map();
  let shortcuts = [];
  let busy = false;
  let currentRun = null;
  let settings = FB.storage.normalizeSettings();

  function index(data) {
    snippets = FB.storage.flatten(data);
    byShortcut = new Map(snippets.filter((s) => s.shortcut).map((s) => [s.shortcut, s]));
    shortcuts = [...byShortcut.keys()].sort((a, b) => b.length - a.length);
  }

  FB.storage.load().then(index);
  FB.storage.loadSettings().then((s) => { settings = s; });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes[FB.storage.KEY]) index(changes[FB.storage.KEY].newValue);
    if (changes[FB.storage.SETTINGS_KEY]) settings = FB.storage.normalizeSettings(changes[FB.storage.SETTINGS_KEY].newValue);
  });

  // Real Esc key stops a running flow (synthetic {key: escape} is ignored).
  window.addEventListener('keydown', (e) => {
    if (currentRun && e.isTrusted && e.key === 'Escape') {
      currentRun.cancelled = true;
      e.preventDefault();
      e.stopPropagation();
    }
  }, true);

  const lookup = (shortcut) => byShortcut.get(shortcut)?.text ?? null;

  // ---- Shortcut detection -------------------------------------------------
  // We track the keys the user actually pressed instead of reading the field value,
  // because many fields reject "/" or letters (digit-only, masked, type=number).
  // Each typed key stores a snapshot of the field *before* that key, so when a
  // shortcut completes we can put the field back exactly as it was.
  const MAX_BUFFER = 40;
  const RESET_KEYS = new Set([
    'Enter', 'Tab', 'Escape', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown',
    'Home', 'End', 'PageUp', 'PageDown', 'Delete',
  ]);
  let typed = []; // [{ ch, snap }]
  let typedEl = null;

  const resetTyped = () => { typed = []; typedEl = null; };

  // Pages can restrict expansion to some fields, e.g. the Options page try-out box:
  // <html data-fastblaze-scope="[data-tryout]">
  const SCOPE = document.documentElement.dataset.fastblazeScope || null;
  const inScope = (el) => !SCOPE || !!el.closest(SCOPE);

  window.addEventListener('keydown', (e) => {
    if (busy || !e.isTrusted || e.isComposing) return;
    const el = FB.dom.deepActiveElement();
    if (!FB.dom.isEditable(el) || !inScope(el)) return resetTyped();
    if (el !== typedEl) { typed = []; typedEl = el; }

    if (e.key === 'Backspace') { typed.pop(); return; }
    if (RESET_KEYS.has(e.key) || e.ctrlKey || e.metaKey) return resetTyped();
    if (e.key.length !== 1) return; // Shift, CapsLock, F-keys...

    typed.push({ ch: e.key, snap: FB.dom.snapshot(el) });
    if (typed.length > MAX_BUFFER) typed.shift();
    // Let the page/framework finish handling this key first.
    setTimeout(() => checkShortcut(el), 0);
  }, true);

  window.addEventListener('mousedown', resetTyped, true);
  window.addEventListener('focusin', (e) => { if (e.target !== typedEl) resetTyped(); }, true);

  let lastTrigger = 0;

  function trigger(sc, el) {
    lastTrigger = Date.now();
    runSnippet(byShortcut.get(sc), el);
  }

  function checkShortcut(el) {
    if (busy || el !== typedEl || el !== FB.dom.deepActiveElement()) return;
    const text = typed.map((t) => t.ch).join('');
    const sc = shortcuts.find((s) => text.endsWith(s));
    if (!sc) return;
    const start = typed[typed.length - sc.length];
    resetTyped();

    const before = FB.dom.textBeforeCaret(el);
    if (before != null && before.endsWith(sc)) {
      FB.dom.deleteBeforeCaret(el, sc.length); // normal field: shortcut text is there
    } else if (start.snap) {
      FB.dom.restoreValue(el, start.snap); // field filtered some/all characters
    }
    trigger(sc, el);
  }

  // Fallback for text that arrives without key events (autofill, IME, voice, automation tools).
  document.addEventListener('input', (e) => {
    if (busy || e.isComposing) return;
    if (e.inputType && !e.inputType.startsWith('insert')) return;
    const el = FB.dom.deepActiveElement();
    if (!FB.dom.isEditable(el) || !inScope(el)) return;
    setTimeout(() => {
      if (busy || Date.now() - lastTrigger < 300) return; // keystroke path already handled it
      const before = FB.dom.textBeforeCaret(el);
      const sc = before && shortcuts.find((s) => before.endsWith(s));
      if (!sc) return;
      resetTyped();
      FB.dom.deleteBeforeCaret(el, sc.length);
      trigger(sc, el);
    }, 0);
  }, true);

  async function runSnippet(snippet, target) {
    if (busy) return;
    busy = true;
    try {
      const fields = FB.collectFields(snippet.text, lookup);
      let formValues = {};
      if (fields.length) {
        const saved = FB.dom.saveSelection(target);
        formValues = await FB.ui.showForm(fields, snippet.name || snippet.shortcut);
        FB.dom.restoreSelection(saved);
        if (!formValues) return;
      }
      const { actions, errors } = FB.compile(snippet.text, { lookup, formValues });
      if (errors.length) FB.ui.toast(`FastBlaze — template errors:\n${errors.join('\n')}`, 'error');

      const run = { cancelled: false };
      const isFlow = actions.length > 1 && actions.some((a) => a.type !== 'text');
      const panel = isFlow ? FB.ui.progress(snippet.name || snippet.shortcut, () => { run.cancelled = true; }) : null;
      currentRun = run;
      if (FB.sound) FB.sound.trigger(settings.soundVolume);
      try {
        await FB.dom.execute(actions, {
          ...settings,
          run,
          onStep: (i, n, a) => {
            if (panel) panel.update(i, n, FB.describeAction(a));
            if (FB.sound && i > 0 && a.type === 'click') FB.sound.step(settings.soundVolume);
          },
        });
        if (isFlow) FB.ui.toast(`Done: ${snippet.name || snippet.shortcut} (${actions.length} steps)`, '', 1800);
      } finally {
        currentRun = null;
        if (panel) panel.close();
      }
    } catch (err) {
      if (err.name === 'Cancelled') {
        FB.ui.toast('FastBlaze: stopped');
      } else {
        console.error('[FastBlaze]', err);
        if (err.element) FB.ui.flash(err.element, 2500, 'error');
        FB.ui.toast(`FastBlaze — ${snippet.name || snippet.shortcut}\n${err.message}`, 'error', 8000);
      }
    } finally {
      busy = false;
    }
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg || window !== window.top) return;
    if (msg.type === 'fastblaze:pick') {
      FB.picker.start();
      sendResponse({ ok: true });
      return;
    }
    if (msg.type !== 'fastblaze:run') return;
    const run = (list) => {
      const snip = list.find((s) => s.id === msg.id);
      if (!snip) return sendResponse({ ok: false, error: 'Snippet not found' });
      sendResponse({ ok: true });
      // Give the popup time to close so the page regains focus.
      setTimeout(() => runSnippet(snip, FB.dom.deepActiveElement()), msg.delay ?? 200);
    };
    if (snippets.length) run(snippets);
    else FB.storage.load().then((d) => { index(d); run(snippets); });
    return true;
  });

  FB.runSnippet = runSnippet;
})();
