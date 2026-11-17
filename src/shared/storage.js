// Snippet storage in chrome.storage.local + JSON import/export (v7 folders/snippets format).
(function () {
  'use strict';
  const FB = (globalThis.FastBlaze = globalThis.FastBlaze || {});
  const KEY = 'fastblaze.data';

  const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

  function normalize(data) {
    const folders = Array.isArray(data && data.folders) ? data.folders : [];
    return {
      version: 1,
      folders: folders.map((f) => ({
        id: f.id || uid(),
        name: String(f.name || 'Untitled'),
        ...(f.disabled ? { disabled: true } : {}),
        snippets: (Array.isArray(f.snippets) ? f.snippets : []).map((s) => ({
          id: s.id || uid(),
          name: String(s.name ?? ''),
          shortcut: String(s.shortcut ?? '').trim(),
          text: String(s.text ?? ''),
        })),
      })),
    };
  }

  async function load() {
    const got = await chrome.storage.local.get(KEY);
    return normalize(got[KEY] || FB.DEFAULT_DATA);
  }

  async function save(data) {
    await chrome.storage.local.set({ [KEY]: normalize(data) });
  }

  /** All snippets with their folder info. Disabled folders are skipped unless includeDisabled. */
  function flatten(data, includeDisabled) {
    return normalize(data).folders
      .filter((f) => includeDisabled || !f.disabled)
      .flatMap((f) => f.snippets.map((s) => ({ ...s, folderId: f.id, folder: f.name })));
  }

  /** Merge an imported file (v7 JSON export). Same folder name + same shortcut = replace. */
  function mergeImport(current, imported) {
    const data = normalize(current);
    const incoming = normalize(imported);
    let count = 0;
    for (const inf of incoming.folders) {
      let folder = data.folders.find((f) => f.name === inf.name);
      if (!folder) {
        folder = { id: uid(), name: inf.name, snippets: [] };
        data.folders.push(folder);
      }
      for (const s of inf.snippets) {
        const fresh = { ...s, id: uid() };
        const i = s.shortcut ? folder.snippets.findIndex((x) => x.shortcut === s.shortcut) : -1;
        if (i >= 0) folder.snippets[i] = { ...fresh, id: folder.snippets[i].id };
        else folder.snippets.push(fresh);
        count++;
      }
    }
    return { data, count };
  }

  const escapeHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  /** Export as v7 JSON (folders → snippets with text + html), same shape as the import format. */
  function toExportJson(data) {
    return {
      version: 7,
      folders: normalize(data).folders.map((f) => ({
        name: f.name,
        info: '',
        app: 'TEXT',
        ...(f.disabled ? { disabled: true } : {}),
        snippets: f.snippets.map((s) => ({
          name: s.name, shortcut: s.shortcut, type: 'text', text: s.text, html: escapeHtml(s.text),
        })),
      })),
    };
  }

  const SETTINGS_KEY = 'fastblaze.settings';

  function normalizeSettings(s) {
    const d = FB.DEFAULT_SETTINGS;
    const num = (v, def, min, max) => {
      const n = Number(v);
      return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
    };
    s = s || {};
    return {
      highlight: s.highlight ?? d.highlight,
      stepDelay: num(s.stepDelay, d.stepDelay, 0, 5000),
      timeout: num(s.timeout, d.timeout, 500, 60000),
      soundVolume: num(s.soundVolume, d.soundVolume, 0, 100),
    };
  }

  async function loadSettings() {
    const got = await chrome.storage.local.get(SETTINGS_KEY);
    return normalizeSettings(got[SETTINGS_KEY]);
  }

  async function saveSettings(s) {
    await chrome.storage.local.set({ [SETTINGS_KEY]: normalizeSettings(s) });
  }

  FB.storage = {
    KEY, SETTINGS_KEY, uid, normalize, load, save, flatten, mergeImport, toExportJson,
    normalizeSettings, loadSettings, saveSettings,
  };
})();
