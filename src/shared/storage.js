// Snippet storage in chrome.storage.local + Text Blaze JSON import/export.
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

  function flatten(data) {
    return normalize(data).folders.flatMap((f) => f.snippets.map((s) => ({ ...s, folderId: f.id, folder: f.name })));
  }

  /** Merge an imported file (Text Blaze export or FastBlaze export). Same folder name + same shortcut = replace. */
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

  /** Export in Text Blaze v7 shape so the file still imports into Text Blaze. */
  function toTextBlaze(data) {
    return {
      version: 7,
      folders: normalize(data).folders.map((f) => ({
        name: f.name,
        info: '',
        app: 'TEXT',
        snippets: f.snippets.map((s) => ({
          name: s.name, shortcut: s.shortcut, type: 'text', text: s.text, html: escapeHtml(s.text),
        })),
      })),
    };
  }

  FB.storage = { KEY, uid, normalize, load, save, flatten, mergeImport, toTextBlaze };
})();
