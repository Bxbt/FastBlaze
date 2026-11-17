// Minimal chrome.* mock so the content scripts / options page can run on a plain web page for manual testing.
// Data survives reloads within the tab (sessionStorage).
(function () {
  const SS_KEY = 'fastblaze.mock.storage';
  let store = {};
  try { store = JSON.parse(sessionStorage.getItem(SS_KEY) || '{}'); } catch { store = {}; }
  const listeners = [];
  const persist = () => { try { sessionStorage.setItem(SS_KEY, JSON.stringify(store)); } catch { /* ignore */ } };
  globalThis.chrome = {
    storage: {
      local: {
        async get(key) {
          if (key == null) return { ...store };
          const keys = Array.isArray(key) ? key : [key];
          return Object.fromEntries(keys.filter((k) => k in store).map((k) => [k, store[k]]));
        },
        async set(obj) {
          Object.assign(store, JSON.parse(JSON.stringify(obj)));
          persist();
          for (const [k, v] of Object.entries(obj)) listeners.forEach((l) => l({ [k]: { newValue: v } }, 'local'));
        },
      },
      onChanged: { addListener: (fn) => listeners.push(fn) },
    },
    runtime: { onMessage: { addListener() {} } },
  };
})();
