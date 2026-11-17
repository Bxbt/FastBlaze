(function () {
  'use strict';
  const FB = globalThis.FastBlaze;
  const $ = (id) => document.getElementById(id);

  let data = { folders: [] };
  let selectedId = null;
  let saveTimer = null;

  const allSnippets = () => data.folders.flatMap((f) => f.snippets.map((s) => ({ s, f })));
  const findSnippet = (id) => allSnippets().find((x) => x.s.id === id) || null;

  function duplicateShortcuts() {
    const counts = new Map();
    for (const { s } of allSnippets()) if (s.shortcut) counts.set(s.shortcut, (counts.get(s.shortcut) || 0) + 1);
    return new Set([...counts].filter(([, n]) => n > 1).map(([k]) => k));
  }

  function el(tag, props, children) {
    const n = document.createElement(tag);
    Object.assign(n, props || {});
    for (const c of children || []) n.append(c);
    return n;
  }

  async function persist() {
    await FB.storage.save(data);
    $('saved').textContent = 'Saved ' + new Date().toLocaleTimeString();
  }

  function schedulePersist() {
    $('saved').textContent = 'Saving…';
    clearTimeout(saveTimer);
    saveTimer = setTimeout(persist, 400);
  }

  // ---------- sidebar ----------
  function renderTree() {
    const q = $('search').value.trim().toLowerCase();
    const dups = duplicateShortcuts();
    const tree = $('tree');
    tree.replaceChildren(...data.folders.map((f) => {
      const items = f.snippets.filter((s) => !q || `${s.name} ${s.shortcut} ${s.text}`.toLowerCase().includes(q));
      const rename = el('button', { title: 'Rename folder', textContent: '✎', type: 'button' });
      rename.addEventListener('click', () => renameFolder(f));
      const del = el('button', { title: 'Delete folder', textContent: '×', type: 'button' });
      del.addEventListener('click', () => deleteFolder(f));
      const head = el('div', { className: 'folder-head' }, [
        el('span', { textContent: f.name }),
        el('span', { className: 'count muted', textContent: `(${f.snippets.length})` }),
        el('span', { className: 'spacer' }), rename, del,
      ]);
      return el('div', { className: 'folder' }, [head, ...items.map((s) => {
        const row = el('div', {
          className: `snip${s.id === selectedId ? ' selected' : ''}${dups.has(s.shortcut) ? ' dup' : ''}`,
          title: dups.has(s.shortcut) ? 'Duplicate shortcut' : '',
        }, [
          el('span', { className: 'name', textContent: s.name || '(untitled)' }),
          el('span', { className: 'chip', textContent: s.shortcut }),
        ]);
        row.addEventListener('click', () => select(s.id));
        return row;
      })]);
    }));
  }

  // ---------- editor ----------
  function select(id) {
    selectedId = id;
    const hit = findSnippet(id);
    $('editor').hidden = !hit;
    $('empty').hidden = !!hit;
    if (hit) {
      $('f-name').value = hit.s.name;
      $('f-shortcut').value = hit.s.shortcut;
      $('f-text').value = hit.s.text;
      $('f-folder').replaceChildren(...data.folders.map((f) => el('option', { value: f.id, textContent: f.name })));
      $('f-folder').value = hit.f.id;
      $('saved').textContent = '';
      updateDupWarning();
      renderPreview();
    }
    renderTree();
  }

  function updateDupWarning() {
    const hit = findSnippet(selectedId);
    const isDup = hit && hit.s.shortcut && duplicateShortcuts().has(hit.s.shortcut);
    $('dup-warning').hidden = !isDup;
    $('dup-warning').textContent = isDup ? `Shortcut ${hit.s.shortcut} is used by more than one snippet.` : '';
  }

  function onEdit() {
    const hit = findSnippet(selectedId);
    if (!hit) return;
    hit.s.name = $('f-name').value;
    hit.s.shortcut = $('f-shortcut').value.trim();
    hit.s.text = $('f-text').value;
    const target = $('f-folder').value;
    if (target !== hit.f.id) {
      hit.f.snippets = hit.f.snippets.filter((s) => s !== hit.s);
      data.folders.find((f) => f.id === target).snippets.push(hit.s);
    }
    updateDupWarning();
    renderTree();
    schedulePersist();
  }

  let previewTimer = null;
  function renderPreview() {
    const hit = findSnippet(selectedId);
    if (!hit) return;
    const lookup = (sc) => allSnippets().find((x) => x.s.shortcut === sc)?.s.text ?? null;
    const { actions, errors } = FB.compile(hit.s.text, { lookup });
    $('preview-list').replaceChildren(...actions.map((a) => {
      const detail = a.type === 'text' ? a.value : a.type === 'click' ? a.selector : a.type === 'wait' ? `${a.ms} ms` : a.key;
      return el('li', {}, [el('span', { className: `kind ${a.type}`, textContent: a.type }), el('span', { className: 'mono', textContent: detail })]);
    }));
    $('preview-errors').hidden = !errors.length;
    $('preview-errors').textContent = errors.join('\n');
  }

  // ---------- actions ----------
  function newSnippet() {
    if (!data.folders.length) data.folders.push({ id: FB.storage.uid(), name: 'My snippets', snippets: [] });
    const current = findSnippet(selectedId);
    const folder = current ? current.f : data.folders[0];
    const s = { id: FB.storage.uid(), name: 'New snippet', shortcut: '', text: '' };
    folder.snippets.push(s);
    persist();
    select(s.id);
    $('f-name').select();
  }

  function newFolder() {
    const name = prompt('Folder name');
    if (!name) return;
    data.folders.push({ id: FB.storage.uid(), name: name.trim(), snippets: [] });
    persist();
    renderTree();
  }

  function renameFolder(f) {
    const name = prompt('Rename folder', f.name);
    if (!name) return;
    f.name = name.trim();
    persist();
    select(selectedId);
  }

  function deleteFolder(f) {
    if (f.snippets.length && !confirm(`Delete folder "${f.name}" and its ${f.snippets.length} snippets?`)) return;
    data.folders = data.folders.filter((x) => x !== f);
    if (findSnippet(selectedId) === null) selectedId = null;
    persist();
    select(selectedId);
  }

  function deleteSnippet() {
    const hit = findSnippet(selectedId);
    if (!hit || !confirm(`Delete "${hit.s.name || hit.s.shortcut}"?`)) return;
    hit.f.snippets = hit.f.snippets.filter((s) => s !== hit.s);
    persist();
    select(null);
  }

  function duplicateSnippet() {
    const hit = findSnippet(selectedId);
    if (!hit) return;
    const copy = { ...hit.s, id: FB.storage.uid(), name: `${hit.s.name} (copy)`, shortcut: '' };
    hit.f.snippets.splice(hit.f.snippets.indexOf(hit.s) + 1, 0, copy);
    persist();
    select(copy.id);
  }

  async function importFile(file) {
    try {
      const json = JSON.parse(await file.text());
      const { data: merged, count } = FB.storage.mergeImport(data, json);
      data = merged;
      await persist();
      select(selectedId);
      alert(`Imported ${count} snippets.`);
    } catch (err) {
      alert(`Import failed: ${err.message}`);
    }
  }

  function exportFile() {
    const blob = new Blob([JSON.stringify(FB.storage.toTextBlaze(data), null, 1)], { type: 'application/json' });
    const a = el('a', { href: URL.createObjectURL(blob), download: `fastblaze-export-${new Date().toISOString().slice(0, 10)}.json` });
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  // ---------- wiring ----------
  for (const id of ['f-name', 'f-shortcut', 'f-folder']) $(id).addEventListener('input', onEdit);
  $('f-text').addEventListener('input', () => {
    onEdit();
    clearTimeout(previewTimer);
    previewTimer = setTimeout(renderPreview, 300);
  });
  $('editor').addEventListener('submit', (e) => e.preventDefault());
  $('search').addEventListener('input', renderTree);
  $('new-snippet').addEventListener('click', newSnippet);
  $('new-folder').addEventListener('click', newFolder);
  $('delete').addEventListener('click', deleteSnippet);
  $('duplicate').addEventListener('click', duplicateSnippet);
  $('refresh-preview').addEventListener('click', renderPreview);
  $('import').addEventListener('click', () => $('import-file').click());
  $('import-file').addEventListener('change', (e) => {
    if (e.target.files[0]) importFile(e.target.files[0]);
    e.target.value = '';
  });
  $('export').addEventListener('click', exportFile);
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 's') {
      e.preventDefault();
      clearTimeout(saveTimer);
      persist();
    }
  });

  FB.storage.load().then((d) => {
    data = d;
    const first = data.folders[0]?.snippets[0];
    select(first ? first.id : null);
  });
})();
