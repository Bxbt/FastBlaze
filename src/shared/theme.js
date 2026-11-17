// Appearance (system / light / dark) shared by popup and options.
// Loaded in <head> so the saved theme applies before first paint.
(function () {
  'use strict';
  const KEY = 'fastblaze.appearance';
  const root = document.documentElement;

  function apply(mode) {
    if (mode === 'light' || mode === 'dark') root.dataset.theme = mode;
    else delete root.dataset.theme;
    document.querySelectorAll('.appearance button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === (mode || 'system'))));
  }

  // Fast path: last value cached per page origin (extension pages share one).
  try { apply(localStorage.getItem(KEY)); } catch { /* storage blocked */ }

  function set(mode) {
    apply(mode);
    try { localStorage.setItem(KEY, mode); } catch { /* ignore */ }
    chrome.storage.local.set({ [KEY]: mode });
  }

  chrome.storage.local.get(KEY).then((got) => apply(got[KEY]));
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[KEY]) apply(changes[KEY].newValue);
  });

  const ICONS = {
    system: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/></svg>',
    light: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
    dark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>',
  };

  /** Fill every .appearance container with the three-way switch. */
  function mountSwitches() {
    document.querySelectorAll('.appearance').forEach((box) => {
      box.setAttribute('role', 'group');
      box.setAttribute('aria-label', 'Appearance');
      box.innerHTML = '';
      for (const mode of ['system', 'light', 'dark']) {
        const b = document.createElement('button');
        b.type = 'button';
        b.dataset.mode = mode;
        b.title = mode[0].toUpperCase() + mode.slice(1);
        b.innerHTML = ICONS[mode];
        b.addEventListener('click', () => set(mode));
        box.appendChild(b);
      }
    });
    let current = null;
    try { current = localStorage.getItem(KEY); } catch { /* ignore */ }
    apply(current);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountSwitches);
  else mountSwitches();
})();
