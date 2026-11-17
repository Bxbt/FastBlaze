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
      $('saved').textContent = '';
      updateDupWarning();
      taTouched = false;
      $('try-pop').hidden = true;
      highlight();
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
    updateDupWarning();
    renderTree();
    schedulePersist();
  }

  function renderPreview() {
    const hit = findSnippet(selectedId);
    if (!hit) return;
    const lookup = (sc) => allSnippets().find((x) => x.s.shortcut === sc)?.s.text ?? null;
    const { actions, errors } = FB.compile(hit.s.text, { lookup });
    $('preview-list').replaceChildren(...actions.map((a) => {
      const detail = a.type === 'text' ? a.value : FB.describeAction(a).replace(/^\w+ /, '');
      const li = el('li', { title: 'Jump to this step in the template' }, [el('span', { className: `kind ${a.type}`, textContent: a.type }), el('span', { className: 'mono', textContent: detail })]);
      li.addEventListener('click', () => jumpTo(a.src));
      return li;
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
  for (const id of ['f-name', 'f-shortcut']) $(id).addEventListener('input', onEdit);
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
    if (lastPick) insertAtCursor(lastPick.command);
  });

  // ---------- code editor: highlight, insert, format, modes ----------
  const ta = $('f-text');
  let taTouched = false;

  function highlight() {
    const toks = FB.tokenizeTemplate(ta.value);
    $('code-hl').replaceChildren(
      ...toks.map((t) => (t.kind === 'text'
        ? document.createTextNode(t.text)
        : el('span', { className: `tok tok-${t.kind}`, textContent: t.text, title: t.kind === 'unknown' ? 'Unknown command' : '' }))),
      document.createTextNode('\n'),
    );
    autoGrow();
  }

  // The textarea grows with its content, so the highlight layer never has to scroll.
  function autoGrow() {
    if ($('edit-pane').hidden) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.max(360, ta.scrollHeight)}px`;
  }

  let previewDebounce = null;
  function afterTextChange() {
    onEdit();
    highlight();
    clearTimeout(previewDebounce);
    previewDebounce = setTimeout(renderPreview, 300);
  }

  /** Insert at the caret. One «…» marker in `text` is selected afterwards. */
  function insertAtCursor(text) {
    const m = text.indexOf('«');
    const n = text.indexOf('»');
    const clean = text.replace(/[«»]/g, '');
    setMode('edit');
    ta.focus();
    if (!taTouched) ta.setSelectionRange(ta.value.length, ta.value.length);
    const start = ta.selectionStart;
    if (!document.execCommand('insertText', false, clean)) {
      ta.setRangeText(clean, ta.selectionStart, ta.selectionEnd, 'end');
      afterTextChange();
    }
    if (m !== -1 && n > m) ta.setSelectionRange(start + m, start + n - 1);
    taTouched = true;
  }

  /** Replace the whole template, keeping undo history. */
  function replaceTemplate(text) {
    if (text === ta.value) return;
    ta.focus();
    ta.select();
    if (!document.execCommand('insertText', false, text)) {
      ta.value = text;
      afterTextChange();
    }
  }

  ta.addEventListener('input', () => { taTouched = true; afterTextChange(); updateAutocomplete(); });
  ta.addEventListener('click', () => { taTouched = true; updateAutocomplete(); });
  ta.addEventListener('keyup', (e) => { if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) updateAutocomplete(); });
  window.addEventListener('resize', autoGrow);
  $('fmt-format').addEventListener('click', () => replaceTemplate(FB.formatTemplate(ta.value)));
  $('fmt-compact').addEventListener('click', () => replaceTemplate(FB.compactTemplate(ta.value)));

  let mode = 'edit';
  function setMode(m) {
    mode = m;
    $('mode-edit').setAttribute('aria-pressed', String(m === 'edit'));
    $('mode-preview').setAttribute('aria-pressed', String(m === 'preview'));
    $('edit-pane').hidden = m !== 'edit';
    $('preview-pane').hidden = m !== 'preview';
    for (const id of ['fmt-format', 'fmt-compact']) $(id).disabled = m !== 'edit';
    closeAc();
    if (m === 'preview') renderPreview();
    else autoGrow();
  }
  $('mode-edit').addEventListener('click', () => setMode('edit'));
  $('mode-preview').addEventListener('click', () => setMode('preview'));

  // Screen rectangle of the character at `offset`, measured on the highlight layer
  // (it has exactly the same text and layout as the textarea).
  function charRect(offset) {
    const pre = $('code-hl');
    const walker = document.createTreeWalker(pre, NodeFilter.SHOW_TEXT);
    let pos = 0;
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const len = node.data.length;
      if (offset <= pos + len && len) {
        const o = Math.min(offset - pos, len - 1);
        const r = document.createRange();
        r.setStart(node, o);
        r.setEnd(node, o + 1);
        return r.getClientRects()[0] || r.getBoundingClientRect();
      }
      pos += len;
    }
    return pre.getBoundingClientRect();
  }

  /** Jump from a preview step to the template text that produced it. */
  function jumpTo(src) {
    if (!src) return;
    setMode('edit');
    ta.focus();
    ta.setSelectionRange(src.start, src.end);
    const r = charRect(src.start);
    if (r.top < 90 || r.bottom > innerHeight - 40) window.scrollBy({ top: r.top - innerHeight / 3, behavior: 'smooth' });
  }

  // ---------- import autocomplete ----------
  let ac = { open: false, items: [], index: 0, from: 0 };

  function closeAc() {
    ac.open = false;
    $('ac').hidden = true;
  }

  function updateAutocomplete() {
    const pos = ta.selectionStart;
    if (pos !== ta.selectionEnd) return closeAc();
    const m = ta.value.slice(0, pos).match(/\{import:\s*(\/?[^\s;{}]*)$/);
    if (!m) return closeAc();
    const q = m[1].toLowerCase().replace(/^\//, '');
    const items = allSnippets().map((x) => x.s)
      .filter((s) => s.shortcut && s.id !== selectedId)
      .filter((s) => !q || s.shortcut.toLowerCase().slice(1).startsWith(q) || (s.name || '').toLowerCase().includes(q))
      .slice(0, 8);
    if (!items.length) return closeAc();
    ac = { open: true, items, index: Math.min(ac.open ? ac.index : 0, items.length - 1), from: pos - m[1].length };
    renderAc();
  }

  function renderAc() {
    const box = $('ac');
    box.replaceChildren(...ac.items.map((s, i) => {
      const item = el('div', { className: `ac-item${i === ac.index ? ' active' : ''}`, role: 'option' }, [
        el('span', { className: 'chip', textContent: s.shortcut }),
        el('span', { className: 'name', textContent: s.name || '' }),
      ]);
      item.addEventListener('mousedown', (e) => { e.preventDefault(); acceptAc(i); });
      return item;
    }));
    const wrap = $('edit-pane').getBoundingClientRect();
    const r = charRect(Math.max(0, ta.selectionStart - 1));
    box.style.left = `${Math.min(r.left - wrap.left, wrap.width - 260)}px`;
    box.style.top = `${r.bottom - wrap.top + 6}px`;
    box.hidden = false;
  }

  function acceptAc(i) {
    const s = ac.items[i];
    if (!s) return;
    ta.setSelectionRange(ac.from, ta.selectionStart);
    const close = ta.value[ta.selectionEnd] === '}' ? '' : '}';
    closeAc();
    if (!document.execCommand('insertText', false, s.shortcut + close)) {
      ta.setRangeText(s.shortcut + close, ta.selectionStart, ta.selectionEnd, 'end');
      afterTextChange();
    }
  }

  ta.addEventListener('keydown', (e) => {
    if (!ac.open) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      ac.index = (ac.index + (e.key === 'ArrowDown' ? 1 : -1) + ac.items.length) % ac.items.length;
      renderAc();
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      acceptAc(ac.index);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closeAc();
    }
  });
  ta.addEventListener('blur', () => setTimeout(closeAc, 150));

  // ---------- Try it out popover ----------
  function closeTry() { $('try-pop').hidden = true; }
  $('try-btn').addEventListener('click', () => {
    const pop = $('try-pop');
    if (!pop.hidden) return closeTry();
    clearTimeout(saveTimer);
    persist(); // the expander reads saved snippets
    const sc = $('f-shortcut').value.trim();
    $('try-chip').textContent = sc || '(no shortcut yet)';
    $('try-box').value = '';
    pop.hidden = false;
    $('try-box').focus();
  });
  document.addEventListener('mousedown', (e) => {
    if (!$('try-pop').hidden && !e.target.closest('.shortcut-field')) closeTry();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('try-pop').hidden) closeTry(); });

  // ---------- dynamic commands ----------
  const tplArg = (s) => String(s).replace(/[\\{};]/g, '\\$&');
  const KEYS = [['enter', 'Enter'], ['tab', 'Tab'], ['escape', 'Escape'], ['up', 'Arrow up'], ['down', 'Arrow down'],
    ['left', 'Arrow left'], ['right', 'Arrow right'], ['space', 'Space'], ['backspace', 'Backspace']];
  const snippetOptions = () => allSnippets().map((x) => x.s).filter((s) => s.shortcut && s.id !== selectedId)
    .map((s) => [s.shortcut, `${s.shortcut}  ${s.name ? `— ${s.name}` : ''}`]);

  const COMMANDS = [
    {
      id: 'click', group: 'Automation', frequent: true, icon: 'mouse', title: 'Click element',
      desc: 'Click an element on the page, then type into it', keywords: 'button selector testid tap',
      fields: [
        { key: 'by', label: 'Find the element by', type: 'select', options: [['selector', 'CSS selector'], ['text', 'Visible text']], value: 'selector' },
        { key: 'value', label: (v) => (v.by === 'text' ? 'Text shown on the element' : 'CSS selector'), required: true, mono: true,
          hint: (v) => (v.by === 'text' ? 'Exact text, e.g. an option in a dropdown.' : 'Tip: Pick in the popup copies a reliable selector.') },
        { key: 'within', label: 'Only inside (CSS selector, optional)', mono: true, show: (v) => v.by === 'text' },
      ],
      build: (v) => (v.by === 'text'
        ? `{click: text=${tplArg(v.value)}${v.within ? `; selector=${tplArg(v.within)}` : ''}}`
        : `{click: selector=${tplArg(v.value)}}`),
    },
    {
      id: 'select', group: 'Automation', icon: 'list', title: 'Choose option',
      desc: 'Pick an option in a native dropdown (<select>)', keywords: 'dropdown select option',
      fields: [
        { key: 'selector', label: 'Dropdown (CSS selector)', required: true, mono: true },
        { key: 'by', label: 'Match option by', type: 'select', options: [['text', 'Option text'], ['value', 'Option value'], ['index', 'Position (0 = first)']], value: 'text' },
        { key: 'value', label: (v) => ({ text: 'Option text', value: 'Option value', index: 'Position' })[v.by], required: true,
          type: (v) => (v.by === 'index' ? 'number' : 'text') },
      ],
      build: (v) => `{select: selector=${tplArg(v.selector)}; ${v.by}=${tplArg(v.value)}}`,
    },
    {
      id: 'clear', group: 'Automation', icon: 'eraser', title: 'Clear field',
      desc: 'Empty a field before typing', keywords: 'erase reset empty',
      fields: [
        { key: 'target', label: 'Which field', type: 'select', options: [['focused', 'The focused field'], ['selector', 'Field matching a CSS selector']], value: 'focused' },
        { key: 'selector', label: 'CSS selector', required: true, mono: true, show: (v) => v.target === 'selector' },
      ],
      build: (v) => (v.target === 'selector' ? `{clear: selector=${tplArg(v.selector)}}` : '{clear}'),
    },
    {
      id: 'key', group: 'Automation', icon: 'keycap', title: 'Press key',
      desc: 'Enter, Tab, Escape, arrows…', keywords: 'keyboard enter tab escape',
      fields: [{ key: 'key', label: 'Key', type: 'select', options: KEYS, value: 'enter' }],
      build: (v) => `{key: ${v.key}}`,
    },
    {
      id: 'wait', group: 'Automation', icon: 'clock', title: 'Wait',
      desc: 'Pause before the next step', keywords: 'delay sleep pause',
      fields: [
        { key: 'amount', label: 'Duration', type: 'number', required: true, value: '500', row: 'dur' },
        { key: 'unit', label: 'Unit', type: 'select', options: [['ms', 'Milliseconds'], ['s', 'Seconds']], value: 'ms', row: 'dur' },
      ],
      build: (v) => `{wait: ${Number(v.amount)}${v.unit}}`,
    },
    {
      id: 'formtext', group: 'Forms', frequent: true, icon: 'textfield', title: 'Text field',
      desc: 'Ask for a value before inserting', keywords: 'form input ask prompt',
      fields: [
        { key: 'name', label: 'Field name', required: true },
        { key: 'default', label: 'Default value (optional)' },
        { key: 'cols', label: 'Max length (optional)', type: 'number' },
      ],
      build: (v) => `{formtext: name=${tplArg(v.name)}${v.default ? `; default=${tplArg(v.default)}` : ''}${v.cols ? `; cols=${Number(v.cols)}` : ''}}`,
    },
    {
      id: 'formmenu', group: 'Forms', icon: 'dropdown', title: 'Dropdown menu',
      desc: 'Ask the user to choose from a list', keywords: 'form menu choose options',
      fields: [
        { key: 'name', label: 'Field name', required: true },
        { key: 'options', label: 'Options (comma separated, first = default)', required: true },
      ],
      build: (v) => {
        const opts = v.options.split(',').map((o) => o.trim()).filter(Boolean).map(tplArg);
        return `{formmenu: name=${tplArg(v.name)}; default=${opts[0] || ''}${opts.slice(1).map((o) => `; ${o}`).join('')}}`;
      },
    },
    {
      id: 'formparagraph', group: 'Forms', icon: 'paragraph', title: 'Paragraph field',
      desc: 'Ask for multi-line text', keywords: 'form textarea multiline',
      fields: [
        { key: 'name', label: 'Field name', required: true },
        { key: 'default', label: 'Default value (optional)' },
      ],
      build: (v) => `{formparagraph: name=${tplArg(v.name)}${v.default ? `; default=${tplArg(v.default)}` : ''}}`,
    },
    {
      id: 'thaiid', group: 'Data', frequent: true, icon: 'idcard', title: 'Thai ID (test)',
      desc: 'Random 13-digit ID with a valid check digit', keywords: 'id card citizen number',
      fields: [
        { key: 'prefix', label: 'First digit', type: 'select', value: '8',
          options: [['', 'Any (1–8)'], ...[1, 2, 3, 4, 5, 6, 7, 8].map((d) => [String(d), String(d)])] },
        { key: 'format', label: 'Format', type: 'select', options: [['plain', '13 digits'], ['dash', 'With dashes (x-xxxx-xxxxx-xx-x)']], value: 'plain' },
      ],
      build: (v) => {
        const args = [v.prefix ? `prefix=${v.prefix}` : '', v.format === 'dash' ? 'format=dash' : ''].filter(Boolean);
        return args.length ? `{thaiid: ${args.join('; ')}}` : '{thaiid}';
      },
    },
    {
      id: 'random', group: 'Data', icon: 'dice', title: 'Random number',
      desc: 'A random number in a range', keywords: 'random number digit',
      fields: [
        { key: 'min', label: 'Min', type: 'number', required: true, value: '0', row: 'range' },
        { key: 'max', label: 'Max', type: 'number', required: true, value: '9', row: 'range' },
        { key: 'kind', label: 'Type', type: 'select', options: [['whole', 'Whole number'], ['decimal', 'Decimal']], value: 'whole' },
      ],
      build: (v) => `{random-number: min=${Number(v.min)}; max=${Number(v.max)}${v.kind === 'decimal' ? '; rounded=no' : ''}}`,
    },
    {
      id: 'import', group: 'Data', frequent: true, icon: 'fileplus', title: 'Import snippet',
      desc: 'Embed another snippet', keywords: 'include reuse embed',
      fields: [{ key: 'shortcut', label: 'Snippet', type: 'select', options: snippetOptions, required: true }],
      build: (v) => `{import: ${v.shortcut}}`,
    },
    {
      id: 'var', group: 'Logic', icon: 'variable', title: 'Set variable',
      desc: 'Store a value to reuse later', keywords: 'variable assign let',
      fields: [
        { key: 'name', label: 'Variable name', required: true, mono: true, pattern: /^[A-Za-z_]\w*$/, patternMsg: 'Letters, digits and _ only; cannot start with a digit.' },
        { key: 'value', label: 'Value or expression', required: true, mono: true, hint: 'e.g. 5, "text", a + 1, floor(x / 2)' },
      ],
      build: (v) => `{${v.name}=${v.value}}`,
    },
    {
      id: 'expr', group: 'Logic', icon: 'sigma', title: 'Show value',
      desc: 'Insert the result of an expression', keywords: 'calculate math expression formula',
      fields: [{ key: 'expr', label: 'Expression', required: true, mono: true, hint: 'Variables, + - * / %, & joins text, floor() round() …' }],
      build: (v) => `{=${v.expr}}`,
    },
  ];

  function renderCommands() {
    const q = $('cmd-q').value.trim().toLowerCase();
    const item = (c) => {
      const b = el('button', { type: 'button', className: 'cmd-item', title: c.desc }, [
        el('span', { className: 'cmd-icon' }, [FB.icon(c.icon)]),
        el('span', {}, [el('strong', { textContent: c.title }), el('span', { className: 'desc', textContent: c.desc })]),
      ]);
      b.addEventListener('click', () => openCommand(c));
      return b;
    };
    const nodes = [];
    if (q) {
      const hits = COMMANDS.filter((c) => `${c.title} ${c.desc} ${c.keywords} ${c.id}`.toLowerCase().includes(q));
      if (hits.length) nodes.push(...hits.map(item));
      else nodes.push(el('div', { className: 'cmd-empty', textContent: 'No matching command.' }));
    } else {
      nodes.push(el('div', { className: 'cmd-group', textContent: 'Frequently used' }), ...COMMANDS.filter((c) => c.frequent).map(item));
      for (const g of ['Automation', 'Forms', 'Data', 'Logic']) {
        nodes.push(el('div', { className: 'cmd-group', textContent: g }), ...COMMANDS.filter((c) => c.group === g).map(item));
      }
    }
    $('cmd-list').replaceChildren(...nodes);
  }
  $('cmd-q').addEventListener('input', renderCommands);

  // Config dialog for one command: fields (inputs + dropdowns) and a live preview.
  function openCommand(c) {
    const dlg = el('dialog', { className: 'fb-dialog cmd-dialog' });
    const form = el('form', { method: 'dialog' });
    const vals = {};
    const inputs = {};
    const val = (x, v) => (typeof x === 'function' ? x(v) : x);

    for (const f of c.fields) {
      const opts = val(f.options, vals);
      vals[f.key] = f.value ?? (opts && opts[0] ? opts[0][0] : '');
    }

    const out = el('code', { className: 'cmd-out' });
    const fieldWrap = el('div');
    const err = el('p', { className: 'warn', hidden: true });

    function renderFields() {
      const rows = new Map();
      const nodes = [];
      for (const f of c.fields) {
        if (f.show && !f.show(vals)) continue;
        const opts = val(f.options, vals);
        let input;
        if (f.type === 'select') {
          input = el('select', {}, (opts || []).map(([v, label]) => el('option', { value: v, textContent: label })));
          if (!opts || !opts.length) input.append(el('option', { value: '', textContent: '(nothing to choose)' }));
          input.value = vals[f.key];
          if (input.value !== vals[f.key]) vals[f.key] = input.value;
        } else {
          input = el('input', { type: val(f.type, vals) || 'text', value: vals[f.key] ?? '', className: f.mono ? 'mono' : '', spellcheck: false });
        }
        input.addEventListener(f.type === 'select' ? 'change' : 'input', () => {
          vals[f.key] = input.value;
          if (f.type === 'select') renderFields();
          else updateOut();
        });
        inputs[f.key] = input;
        const hint = val(f.hint, vals);
        const label = el('label', { className: 'cf' }, [val(f.label, vals), input, ...(hint ? [el('span', { className: 'hint muted', textContent: hint })] : [])]);
        if (f.row) {
          if (!rows.has(f.row)) { const r = el('div', { className: 'cf-row' }); rows.set(f.row, r); nodes.push(r); }
          rows.get(f.row).append(label);
        } else nodes.push(label);
      }
      fieldWrap.replaceChildren(...nodes);
      updateOut();
    }

    function missing() {
      for (const f of c.fields) {
        if (f.show && !f.show(vals)) continue;
        const v = String(vals[f.key] ?? '').trim();
        if (f.required && !v) return { f, msg: `${val(f.label, vals)} is required.` };
        if (v && f.pattern && !f.pattern.test(v)) return { f, msg: f.patternMsg };
        if (v && val(f.type, vals) === 'number' && Number.isNaN(Number(v))) return { f, msg: `${val(f.label, vals)} must be a number.` };
      }
      return null;
    }

    function updateOut() {
      const m = missing();
      out.textContent = m ? '…' : c.build(vals);
      err.hidden = true;
    }

    const cancel = el('button', { type: 'button', className: 'outline', textContent: 'Cancel' });
    const ok = el('button', { type: 'submit', className: 'primary' }, [FB.icon('plus'), 'Insert']);
    form.append(
      el('div', { className: 'cmd-dialog-head' }, [FB.icon(c.icon), el('div', {}, [el('h3', { textContent: c.title }), el('p', { textContent: c.desc })])]),
      fieldWrap,
      el('label', { className: 'cf', textContent: 'Will insert' }),
      out,
      err,
      el('div', { className: 'fb-dialog-actions' }, [cancel, ok]),
    );
    dlg.append(form);
    document.body.append(dlg);
    renderFields();

    cancel.addEventListener('click', () => dlg.close());
    dlg.addEventListener('mousedown', (e) => { if (e.target === dlg) dlg.close(); });
    dlg.addEventListener('close', () => dlg.remove());
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const m = missing();
      if (m) {
        err.textContent = m.msg;
        err.hidden = false;
        if (inputs[m.f.key]) inputs[m.f.key].focus();
        return;
      }
      const text = c.build(vals);
      dlg.close();
      insertAtCursor(text);
    });
    dlg.showModal();
    const first = fieldWrap.querySelector('input, select');
    if (first) first.focus();
  }

  renderCommands();

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
