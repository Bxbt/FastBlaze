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

  function matchShortcut(el) {
    const before = FB.dom.textBeforeCaret(el);
    return before ? shortcuts.find((s) => before.endsWith(s)) : undefined;
  }

  document.addEventListener('input', (e) => {
    if (busy || !e.isTrusted || e.isComposing) return;
    if (e.inputType && !e.inputType.startsWith('insert')) return;
    const el = FB.dom.deepActiveElement();
    if (!FB.dom.isEditable(el) || !matchShortcut(el)) return;
    // Let the framework finish handling this keystroke before we edit the field.
    setTimeout(() => {
      const sc = matchShortcut(el);
      if (!sc || busy) return;
      FB.dom.deleteBeforeCaret(el, sc.length);
      runSnippet(byShortcut.get(sc), el);
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
      try {
        await FB.dom.execute(actions, {
          ...settings,
          run,
          onStep: (i, n, a) => panel && panel.update(i, n, FB.describeAction(a)),
        });
        if (isFlow) FB.ui.toast(`✓ ${snippet.name || snippet.shortcut} — ${actions.length} steps`, '', 1800);
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
    if (!msg || msg.type !== 'fastblaze:run' || window !== window.top) return;
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
