// Minimal chrome.* mock so the content scripts can run on a plain web page for manual testing.
(function () {
  const store = {};
  const listeners = [];
  globalThis.chrome = {
    storage: {
      local: {
        async get(key) { return key in store ? { [key]: store[key] } : {}; },
        async set(obj) {
          Object.assign(store, obj);
          for (const [k, v] of Object.entries(obj)) listeners.forEach((l) => l({ [k]: { newValue: v } }, 'local'));
        },
      },
      onChanged: { addListener: (fn) => listeners.push(fn) },
    },
    runtime: { onMessage: { addListener() {} } },
  };
})();
