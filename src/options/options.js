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
  // Collapsed folders are a per-viewer UI preference, kept in localStorage.
  const COLLAPSE_KEY = 'fastblaze.collapsed';
  let collapsed = new Set();
  try { collapsed = new Set(JSON.parse(localStorage.getItem(COLLAPSE_KEY) || '[]')); } catch { /* ignore */ }

  function setCollapsed(id, on) {
    if (on) collapsed.add(id);
    else collapsed.delete(id);
    try { localStorage.setItem(COLLAPSE_KEY, JSON.stringify([...collapsed])); } catch { /* ignore */ }
  }

  let dragId = null;

  function clearDropMarks() {
    document.querySelectorAll('.drop-before, .drop-after, .drop-into')
      .forEach((n) => n.classList.remove('drop-before', 'drop-after', 'drop-into'));
  }

  /** Move a snippet into `folder`, before snippet `beforeId` (null = end). */
  function moveSnippet(id, folder, beforeId) {
    const hit = findSnippet(id);
    if (!hit || beforeId === id) return;
    hit.f.snippets.splice(hit.f.snippets.indexOf(hit.s), 1);
    const idx = beforeId ? folder.snippets.findIndex((s) => s.id === beforeId) : -1;
    if (idx < 0) folder.snippets.push(hit.s);
    else folder.snippets.splice(idx, 0, hit.s);
    setCollapsed(folder.id, false);
    persist();
    if (selectedId) select(selectedId); // refresh folder dropdown too
    else renderTree();
  }

  function snippetRow(s, f, dups) {
    const isDup = dups.has(s.shortcut);
    const row = el('div', {
      className: `snip${s.id === selectedId ? ' selected' : ''}${isDup ? ' dup' : ''}`,
      title: isDup ? 'Duplicate shortcut' : 'Drag to reorder',
      draggable: true,
    }, [
      el('span', { className: 'grip', textContent: '\u22EE\u22EE', ariaHidden: 'true' }),
      el('span', { className: 'name', textContent: s.name || '(untitled)' }),
      ...(s.shortcut ? [el('span', { className: 'chip', textContent: s.shortcut })] : []),
    ]);
    row.addEventListener('click', () => select(s.id));
    row.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      openMenu(snippetMenu(s, f), e.clientX, e.clientY);
    });
    row.addEventListener('dragstart', (e) => {
      dragId = s.id;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', s.id);
      requestAnimationFrame(() => row.classList.add('dragging'));
    });
    row.addEventListener('dragend', () => {
      row.classList.remove('dragging');
      clearDropMarks();
      dragId = null;
    });
    row.addEventListener('dragover', (e) => {
      if (!dragId) return;
      e.preventDefault();
      const r = row.getBoundingClientRect();
      const after = e.clientY > r.top + r.height / 2;
      clearDropMarks();
      row.classList.add(after ? 'drop-after' : 'drop-before');
    });
    row.addEventListener('drop', (e) => {
      if (!dragId) return;
      e.preventDefault();
      const after = row.classList.contains('drop-after');
      const i = f.snippets.indexOf(s);
      const beforeId = after ? (f.snippets[i + 1]?.id ?? null) : s.id;
      const id = dragId;
      clearDropMarks();
      moveSnippet(id, f, beforeId);
    });
    return row;
  }

  const DISABLED_OPEN = '__disabled_open__'; // stored in `collapsed` set: disabled section expanded

  function renderTree() {
    const q = $('search').value.trim().toLowerCase();
    const dups = duplicateShortcuts();
    const enabled = data.folders.filter((f) => !f.disabled);
    const disabled = data.folders.filter((f) => f.disabled);
    const nodes = enabled.map((f) => folderNode(f, q, dups));
    if (disabled.length) {
      const open = collapsed.has(DISABLED_OPEN) || !!q;
      const head = el('button', { type: 'button', className: `disabled-head${open ? ' open' : ''}` }, [
        el('span', { textContent: '⊘' }),
        el('span', { className: 'folder-name', textContent: `Disabled folders (${disabled.length})` }),
        el('span', { className: 'spacer' }),
        el('span', { className: 'caret', textContent: '›' }),
      ]);
      head.addEventListener('click', () => {
        setCollapsed(DISABLED_OPEN, !collapsed.has(DISABLED_OPEN));
        renderTree();
      });
      const body = el('div', { className: 'disabled-body' }, disabled.map((f) => folderNode(f, q, dups)));
      body.hidden = !open;
      nodes.push(el('div', { className: 'disabled-section' }, [head, body]));
    }
    $('tree').replaceChildren(...nodes);
  }

  function folderNode(f, q, dups) {
    {
      const items = f.snippets.filter((s) => !q || `${s.name} ${s.shortcut} ${s.text}`.toLowerCase().includes(q));
      const isCollapsed = collapsed.has(f.id) && !q; // searching shows every match
      const more = el('button', { title: 'Folder actions', textContent: '⋯', type: 'button', className: 'more' });
      more.addEventListener('click', (e) => {
        e.stopPropagation();
        const r = more.getBoundingClientRect();
        openMenu(folderMenu(f), r.left, r.bottom + 4);
      });
      const head = el('div', { className: 'folder-head', title: isCollapsed ? 'Expand' : 'Collapse' }, [
        el('span', { className: 'caret', textContent: '▾' }),
        el('span', { className: 'folder-name', textContent: f.name }),
        el('span', { className: 'count muted', textContent: `(${f.snippets.length})` }),
        el('span', { className: 'spacer' }), more,
      ]);
      head.addEventListener('click', () => {
        setCollapsed(f.id, !collapsed.has(f.id));
        renderTree();
      });
      head.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        openMenu(folderMenu(f), e.clientX, e.clientY);
      });
      // Drop on the folder header = move to the end of that folder.
      head.addEventListener('dragover', (e) => {
        if (!dragId) return;
        e.preventDefault();
        clearDropMarks();
        head.classList.add('drop-into');
      });
      head.addEventListener('drop', (e) => {
        if (!dragId) return;
        e.preventDefault();
        const id = dragId;
        clearDropMarks();
        moveSnippet(id, f, null);
      });
      const body = el('div', { className: 'folder-body' }, items.map((s) => snippetRow(s, f, dups)));
      body.hidden = isCollapsed;
      return el('div', { className: `folder${isCollapsed ? ' collapsed' : ''}${f.disabled ? ' is-disabled' : ''}` }, [head, body]);
    }
  }

  // ---------- context menus ----------
  let menuEl = null;

  function closeMenu() {
    if (menuEl) menuEl.remove();
    menuEl = null;
  }

  function buildMenu(items) {
    const m = el('div', { className: 'menu', role: 'menu' });
    for (const it of items) {
      if (it === '-') { m.append(el('div', { className: 'menu-sep' })); continue; }
      const row = el('button', {
        type: 'button', role: 'menuitem', disabled: !!it.disabled,
        className: `menu-item${it.danger ? ' danger' : ''}${it.checked ? ' checked' : ''}`,
      }, [
        el('span', { className: 'menu-icon' }, it.icon ? [FB.icon(it.icon)] : []),
        el('span', { className: 'menu-label', textContent: it.label }),
        ...(it.sub ? [el('span', { className: 'menu-arrow', textContent: '›' })] : []),
      ]);
      if (it.sub) {
        const sub = buildMenu(it.sub);
        sub.classList.add('submenu');
        m.append(el('div', { className: 'menu-sub-wrap' }, [row, sub]));
        continue;
      }
      row.addEventListener('click', () => { closeMenu(); it.action(); });
      m.append(row);
    }
    return m;
  }

  function openMenu(items, x, y) {
    closeMenu();
    menuEl = buildMenu(items);
    document.body.append(menuEl);
    const r = menuEl.getBoundingClientRect();
    menuEl.style.left = `${Math.max(8, Math.min(x, innerWidth - r.width - 8))}px`;
    menuEl.style.top = `${Math.max(8, Math.min(y, innerHeight - r.height - 8))}px`;
    if (x + r.width * 2 > innerWidth) menuEl.classList.add('flip');
  }

  document.addEventListener('mousedown', (e) => { if (menuEl && !menuEl.contains(e.target)) closeMenu(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenu(); });
  window.addEventListener('blur', closeMenu);
  window.addEventListener('resize', closeMenu);
  $('tree').addEventListener('scroll', closeMenu);

  function folderMenu(f) {
    const sortBy = (cmp) => () => { f.snippets.sort(cmp); persist(); renderTree(); };
    const byName = (a, b) => (a.name || '').localeCompare(b.name || '', 'th');
    return [
      { icon: 'plus', label: 'New snippet', action: () => newSnippet(f) },
      { icon: 'pencil', label: 'Rename…', action: () => renameFolder(f) },
      {
        icon: 'sort', label: 'Sort by', sub: [
          { label: 'Name (A → Z)', action: sortBy(byName) },
          { label: 'Name (Z → A)', action: sortBy((a, b) => byName(b, a)) },
          { label: 'Shortcut', action: sortBy((a, b) => (a.shortcut || '￿').localeCompare(b.shortcut || '￿')) },
        ],
      },
      '-',
      f.disabled
        ? { icon: 'check', label: 'Enable folder', action: () => setFolderDisabled(f, false) }
        : { icon: 'ban', label: 'Disable folder', action: () => setFolderDisabled(f, true) },
      '-',
      { icon: 'trash', label: 'Delete folder…', danger: true, action: () => deleteFolder(f) },
    ];
  }

  function snippetMenu(s, f) {
    const others = data.folders.filter((x) => x !== f);
    return [
      { icon: 'copy', label: 'Duplicate snippet', action: () => duplicateSnippet(s) },
      {
        icon: 'move', label: 'Move to folder', disabled: !others.length,
        sub: others.map((x) => ({ label: x.name + (x.disabled ? ' (disabled)' : ''), action: () => moveSnippet(s.id, x, null) })),
      },
      { icon: 'pencil', label: 'Rename…', action: () => renameSnippet(s) },
      '-',
      { icon: 'trash', label: 'Delete snippet…', danger: true, action: () => deleteSnippet(s) },
    ];
  }

  // ---------- editor ----------
  function select(id) {
    selectedId = id;
    const hit = findSnippet(id);
    if (hit && collapsed.has(hit.f.id)) setCollapsed(hit.f.id, false);
    if (hit && hit.f.disabled) setCollapsed(DISABLED_OPEN, true);
    $('editor').hidden = !hit;
    $('empty').hidden = !!hit;
    if (!hit) renderWelcome();
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

  function renderWelcome() {
    const examples = data.folders.filter((f) => !f.disabled)
      .flatMap((f) => f.snippets).filter((s) => s.shortcut).slice(0, 3);
    const parts = [];
    examples.forEach((s, i) => {
      if (i) parts.push(i === examples.length - 1 ? ' หรือ ' : ', ');
      parts.push(el('span', { className: 'chip', textContent: s.shortcut, title: s.name }));
    });
    $('welcome-examples').replaceChildren(...(parts.length ? ['เช่น ', ...parts] : []));
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
      const detail = a.type === 'text' ? a.value : FB.describeAction(a).replace(/^\w+ /, '');
      return el('li', {}, [el('span', { className: `kind ${a.type}`, textContent: a.type }), el('span', { className: 'mono', textContent: detail })]);
    }));
    $('preview-errors').hidden = !errors.length;
    $('preview-errors').textContent = errors.join('\n');
  }

  // ---------- actions ----------
  function newSnippet(target) {
    if (!data.folders.length) data.folders.push({ id: FB.storage.uid(), name: 'My snippets', snippets: [] });
    const current = findSnippet(selectedId);
    const folder = target || (current ? current.f : data.folders.find((f) => !f.disabled) || data.folders[0]);
    const s = { id: FB.storage.uid(), name: 'New snippet', shortcut: '', text: '' };
    folder.snippets.push(s);
    persist();
    select(s.id);
    $('f-name').select();
  }

  async function newFolder() {
    const name = await FB.dialog.prompt({
      title: 'New folder', label: 'Folder name', placeholder: 'e.g. Ufriend', confirmLabel: 'Create', icon: 'folder',
    });
    if (!name) return;
    data.folders.push({ id: FB.storage.uid(), name, snippets: [] });
    persist();
    renderTree();
  }

  async function renameFolder(f) {
    const name = await FB.dialog.prompt({
      title: 'Rename folder', label: 'Folder name', value: f.name, confirmLabel: 'Rename', icon: 'pencil',
    });
    if (!name) return;
    f.name = name;
    persist();
    select(selectedId);
  }

  async function deleteFolder(f) {
    const n = f.snippets.length;
    const ok = await FB.dialog.confirm({
      title: 'Delete folder',
      message: n
        ? ['Delete the folder ', { b: f.name }, ` and its ${n} snippet${n > 1 ? 's' : ''}? This cannot be undone.`]
        : ['Delete the empty folder ', { b: f.name }, '?'],
      confirmLabel: 'Delete folder', danger: true, icon: 'trash',
    });
    if (!ok) return;
    data.folders = data.folders.filter((x) => x !== f);
    if (findSnippet(selectedId) === null) selectedId = null;
    persist();
    select(selectedId);
  }

  function setFolderDisabled(f, on) {
    if (on) f.disabled = true;
    else delete f.disabled;
    if (on) setCollapsed(DISABLED_OPEN, true);
    persist();
    renderTree();
  }

  async function renameSnippet(s) {
    const name = await FB.dialog.prompt({
      title: 'Rename snippet', label: 'Label', value: s.name, confirmLabel: 'Rename', icon: 'pencil',
    });
    if (name == null) return;
    s.name = name;
    persist();
    if (selectedId === s.id) select(s.id);
    else renderTree();
  }

  async function deleteSnippet(s) {
    const hit = findSnippet(s ? s.id : selectedId);
    if (!hit) return;
    const label = hit.s.name || hit.s.shortcut || '(untitled)';
    const ok = await FB.dialog.confirm({
      title: 'Delete snippet',
      message: ['Are you sure you want to delete the snippet ', { b: label }, '? This cannot be undone.'],
      confirmLabel: 'Delete snippet', danger: true, icon: 'trash',
    });
    if (!ok) return;
    hit.f.snippets = hit.f.snippets.filter((x) => x !== hit.s);
    persist();
    if (selectedId === hit.s.id) select(null);
    else renderTree();
  }

  function duplicateSnippet(s) {
    const hit = findSnippet(s ? s.id : selectedId);
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
      await FB.dialog.alert({
        title: 'Import complete',
        message: ['Imported ', { b: String(count) }, ` snippet${count === 1 ? '' : 's'} from `, { b: file.name }, '.'],
        icon: 'check',
      });
    } catch (err) {
      await FB.dialog.alert({
        title: 'Import failed',
        message: [{ b: file.name }, ` could not be imported: ${err.message}`],
      });
    }
  }

  function exportFile() {
    const blob = new Blob([JSON.stringify(FB.storage.toExportJson(data), null, 1)], { type: 'application/json' });
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
  $('new-snippet').addEventListener('click', () => newSnippet());
  $('welcome-new').addEventListener('click', () => newSnippet());
  $('new-folder').addEventListener('click', newFolder);
  $('delete').addEventListener('click', () => deleteSnippet());
  $('duplicate').addEventListener('click', () => duplicateSnippet());
  $('home').addEventListener('click', (e) => { e.preventDefault(); select(null); });
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

  // ---------- picked element (from the page picker) ----------
  const LAST_PICK_KEY = 'fastblaze.lastPick';
  let lastPick = null;

  function showPick(p) {
    lastPick = p || null;
    $('insert-pick').disabled = !lastPick;
    $('insert-pick').title = lastPick ? lastPick.command : 'Use Pick in the popup (Alt+Shift+P) on a page first';
  }
  chrome.storage.local.get(LAST_PICK_KEY).then((got) => showPick(got[LAST_PICK_KEY]));
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[LAST_PICK_KEY]) showPick(changes[LAST_PICK_KEY].newValue);
  });
  $('insert-pick').addEventListener('click', () => {
    if (!lastPick) return;
    const ta = $('f-text');
    ta.focus();
    ta.setRangeText(lastPick.command, ta.selectionStart, ta.selectionEnd, 'end');
    onEdit();
    renderPreview();
  });

  // ---------- settings ----------
  async function openSettings() {
    const s = await FB.storage.loadSettings();
    $('s-highlight').checked = s.highlight;
    $('s-step').value = s.stepDelay;
    $('s-timeout').value = s.timeout / 1000;
    $('s-volume').value = s.soundVolume;
    showVolume();
    $('settings').showModal();
  }
  function showVolume() {
    const v = Number($('s-volume').value);
    $('s-volume-value').textContent = v ? `${v}%` : 'off';
  }
  function saveSettingsFromForm() {
    FB.storage.saveSettings({
      highlight: $('s-highlight').checked,
      stepDelay: Number($('s-step').value),
      timeout: Number($('s-timeout').value) * 1000,
      soundVolume: Number($('s-volume').value),
    });
  }
  $('open-settings').addEventListener('click', openSettings);
  for (const id of ['s-highlight', 's-step', 's-timeout', 's-volume']) $(id).addEventListener('change', saveSettingsFromForm);
  $('s-volume').addEventListener('input', showVolume);
  $('s-volume').addEventListener('change', () => FB.sound.trigger($('s-volume').value));
  $('s-volume-test').addEventListener('click', () => FB.sound.trigger($('s-volume').value));

  FB.storage.load().then((d) => {
    data = d;
    select(null); // start on the welcome / try-out page
  });
})();
