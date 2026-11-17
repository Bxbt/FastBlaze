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
    document.querySelector('main').classList.toggle('editing', !!hit);
    if (!hit) renderWelcome();
    if (hit) {
      $('f-name').value = hit.s.name;
      $('f-shortcut').value = hit.s.shortcut;
      $('f-text').value = hit.s.text;
      $('saved').textContent = '';
      updateDupWarning();
      taTouched = false;
      $('try-pop').hidden = true;
      selectedItem = -1;
      highlight();
      setView(view);
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
    const testData = { phones: currentSettings.phoneAllow, banks: currentSettings.bankAllow };
    const { actions, errors } = FB.compile(hit.s.text, { lookup, testData });
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

  // ---------- blocks view: inline editor (type text, commands are chips) ----------
  // The textarea (#f-text) stays the source of truth; this view converts both ways:
  //   template -> DOM: text nodes, <br> (real newline), <br class="cont"> (visual
  //   line continuation), chip <span contenteditable=false data-src="{...}">
  //   DOM -> template: serializeRich()
  let view = 'blocks';
  try { view = localStorage.getItem('fastblaze.editorView') || 'blocks'; } catch { /* ignore */ }
  let selectedItem = -1; // kept for compatibility with select()
  let dragChip = null;
  let lastRange = null;
  let syncingFromRich = false;
  const rich = $('blocks');
  const ZW = /[​﻿]/g;

  const CMD_ICON = {
    click: 'mouse', select: 'list', clear: 'eraser', key: 'keycap', wait: 'clock', waitfor: 'hourglass',
    formtext: 'textfield', formmenu: 'dropdown', formparagraph: 'paragraph',
    thaiid: 'idcard', 'random-number': 'dice', import: 'fileplus', thaiphone: 'phone', thainame: 'user',
    email: 'mail', date: 'calendar', zipcode: 'pin', bankaccount: 'bank', randomtext: 'text',
  };
  const escapeText = (s) => s.replace(/[\\{}]/g, '\\$&');

  /** Muted keyword + bold value pairs shown on a chip. */
  function chipParts(t) {
    const n = t.node;
    if (n.type === 'assign') return { icon: 'variable', parts: [[n.name, `= ${n.value.raw ?? ''}`]] };
    if (n.type === 'expr') return { icon: 'sigma', parts: [['=', n.expr]] };
    if (n.type !== 'cmd') return { icon: 'help', parts: [['?', t.text]] };
    const a = n.args;
    const P = (k, v) => (v == null || v === '' ? null : [k, String(v)]);
    let parts;
    switch (n.name) {
      case 'click':
        parts = a.pick
          ? [P('options', a.selector), ['pick', a.pick === 'next' ? 'next each run' : a.pick], P('max', a.maxdelay)]
          : [a.text != null ? P('text', a.text) : P('selector', a.selector ?? a._[0]), P('max', a.maxdelay)];
        break;
      case 'wait': {
        const v = a.delay ?? a._[0] ?? '500ms';
        parts = /^idle$/i.test(String(v).trim()) ? [['wait', 'until idle']] : [P('delay', `+${v}`)];
        break;
      }
      case 'waitfor': parts = [[a.state === 'gone' ? 'until gone' : 'wait for', a.text ?? a.selector ?? a._[0] ?? ''], a.text != null ? P('in', a.selector) : null, P('max', a.maxdelay)]; break;
      case 'key': parts = [P('key', a.key ?? a._[0])]; break;
      case 'select': parts = [P('select', a.text ?? a.value ?? (a.index != null ? `#${a.index}` : '')), P('in', a.selector)]; break;
      case 'clear': parts = [P('clear', a.selector ?? a._[0] ?? 'focused field')]; break;
      case 'formtext': case 'formparagraph': parts = [P('field', a.name), P('default', a.default)]; break;
      case 'formmenu': parts = [P('menu', a.name)]; break;
      case 'thaiid': parts = [['Thai ID', a.prefix ? `${a.prefix}…` : ''], P('format', a.format)]; break;
      case 'random-number': parts = [P('random', `${a.min ?? 0}–${a.max ?? 100}`)]; break;
      case 'import': parts = [P('import', a.shortcut ?? a._[0])]; break;
      case 'thaiphone': parts = [['phone', a.source === 'random' ? 'random' : 'allow list'], P('type', a.type)]; break;
      case 'thainame': parts = [['name', [a.part ?? a._[0], a.gender, a.lang === 'en' ? 'EN' : '', a.title === 'yes' ? 'title' : ''].filter(Boolean).join(' · ') || 'full']]; break;
      case 'email': parts = [['email', a.domain ?? 'example.com']]; break;
      case 'date': parts = [['date', a.age ? `age ${a.age}` : a.shift ? a.shift : 'today'], P('format', a.format ?? a._[0])]; break;
      case 'zipcode': parts = [['zip code', '']]; break;
      case 'bankaccount': parts = [['bank account', a.source === 'random' ? 'random' : 'allow list']]; break;
      case 'randomtext': parts = [['text', `${a.length ?? a._[0] ?? 8} ${a.type ?? 'alnum'}`]]; break;
      default: parts = [[n.name, Object.entries(a).filter(([k]) => k !== '_').map(([k, v]) => `${k}=${v}`).join('; ')]];
    }
    return { icon: CMD_ICON[n.name] || 'help', parts: parts.filter(Boolean) };
  }

  /** A non-editable, draggable chip for one command. */
  function makeChip(raw) {
    const t = FB.tokenizeTemplate(raw)[0];
    const { icon, parts } = chipParts(t);
    const x = el('span', { className: 'blk-x', title: 'Remove', textContent: '×' });
    const chip = el('span', {
      className: `blk blk-cmd blk-${t.kind}`,
      contentEditable: 'false',
      draggable: true,
      title: t.kind === 'unknown' ? `Unknown command: ${raw}` : `${raw}\nClick to edit · drag to move`,
    }, [
      FB.icon(icon),
      ...parts.flatMap(([k, v]) => [el('span', { className: 'blk-k', textContent: k }), ...(v ? [el('span', { className: 'blk-v', textContent: v })] : [])]),
      x,
    ]);
    chip.dataset.src = raw;
    return chip;
  }

  /** Template text -> DOM nodes (used for rendering and for paste). */
  function templateNodes(src) {
    const nodes = [];
    let pos = 0;
    for (const t of FB.tokenizeTemplate(src)) {
      const start = pos;
      pos += t.text.length;
      if (t.kind === 'text') {
        t.text.split('\n').forEach((line, i) => {
          if (i) nodes.push(document.createElement('br'));
          if (line) nodes.push(document.createTextNode(line));
        });
      } else if (t.kind === 'escape') nodes.push(document.createTextNode(t.text.slice(1)));
      else if (t.kind === 'cont') nodes.push(el('br', { className: 'cont' }));
      else {
        const chip = makeChip(t.text);
        chip.dataset.start = String(start);
        nodes.push(chip);
      }
    }
    return nodes;
  }

  /** DOM -> template text. */
  function serializeRich(root) {
    let out = '';
    const walk = (node) => {
      for (const n of node.childNodes) {
        if (n.nodeType === Node.TEXT_NODE) out += escapeText(n.data.replace(ZW, ''));
        else if (n.nodeType !== Node.ELEMENT_NODE) continue;
        else if (n.classList.contains('drop-caret')) continue;
        else if (n.dataset && n.dataset.src != null) out += n.dataset.src;
        else if (n.tagName === 'BR') {
          // Chrome adds a trailing <br> so an empty last line stays visible; ignore it.
          if (!n.nextSibling && n.parentNode === root && !n.classList.contains('cont') && out.endsWith('\n')) continue;
          out += n.classList.contains('cont') ? '\\\n' : '\n';
        } else if (n.tagName === 'DIV' || n.tagName === 'P') {
          if (out && !out.endsWith('\n')) out += '\n';
          walk(n);
        } else walk(n);
      }
    };
    walk(root);
    // An "empty" editor in Chrome is just a placeholder <br>.
    if (out === '\n' && root.childNodes.length === 1) return '';
    return out;
  }

  function renderBlocks() {
    if (view !== 'blocks' || syncingFromRich) return;
    const nodes = templateNodes(ta.value);
    // A trailing <br> needs a second one so the empty last line is visible.
    if (nodes.length && nodes[nodes.length - 1].tagName === 'BR') nodes.push(document.createElement('br'));
    rich.replaceChildren(...nodes);
    rich.classList.toggle('empty', !ta.value);
    lastRange = null;
  }

  /** Push the editor content back into the template. */
  function syncFromRich() {
    const src = serializeRich(rich);
    rich.classList.toggle('empty', !src);
    if (src === ta.value) return;
    ta.value = src;
    syncingFromRich = true;
    try { afterTextChange(); } finally { syncingFromRich = false; }
  }

  function saveRange() {
    const sel = window.getSelection();
    if (sel.rangeCount && rich.contains(sel.getRangeAt(0).startContainer)) lastRange = sel.getRangeAt(0).cloneRange();
  }

  function placeCaretAfter(node) {
    const r = document.createRange();
    r.setStartAfter(node);
    r.collapse(true);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(r);
    lastRange = r.cloneRange();
  }

  /** Insert template text (commands become chips) at the caret, or at the end. */
  function blocksInsert(text) {
    rich.focus();
    let range = lastRange;
    if (!range || !rich.contains(range.startContainer)) {
      range = document.createRange();
      range.selectNodeContents(rich);
      range.collapse(false);
    }
    range.deleteContents();
    const nodes = templateNodes(text);
    const frag = document.createDocumentFragment();
    nodes.forEach((n) => frag.append(n));
    const last = nodes[nodes.length - 1];
    range.insertNode(frag);
    if (last) placeCaretAfter(last);
    syncFromRich();
  }

  // Typing, deleting, Enter, paste
  rich.addEventListener('input', syncFromRich);
  rich.addEventListener('keyup', saveRange);
  rich.addEventListener('mouseup', saveRange);
  rich.addEventListener('blur', saveRange);
  rich.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      document.execCommand('insertLineBreak');
    }
  });
  rich.addEventListener('paste', (e) => {
    const text = e.clipboardData.getData('text/plain');
    if (!text) return;
    e.preventDefault();
    saveRange();
    blocksInsert(text);
  });
  rich.addEventListener('drop', (e) => { if (!dragChip) e.preventDefault(); }, true); // no foreign drops

  // Chip clicks: × removes, otherwise edit in the side panel
  rich.addEventListener('mousedown', (e) => {
    if (e.target.closest('.blk-x')) e.preventDefault();
  });
  rich.addEventListener('click', (e) => {
    const chip = e.target.closest('.blk-cmd');
    if (!chip) return;
    if (e.target.closest('.blk-x')) {
      chip.remove();
      syncFromRich();
      return;
    }
    rich.querySelectorAll('.blk.selected').forEach((c) => c.classList.remove('selected'));
    chip.classList.add('selected');
    placeCaretAfter(chip);
    editCommand(chip);
  });

  // Drag a chip to any caret position in the text
  let dropMarker = null;
  function clearDrop() {
    if (dropMarker) dropMarker.remove();
    dropMarker = null;
  }
  rich.addEventListener('dragstart', (e) => {
    const chip = e.target.closest && e.target.closest('.blk-cmd');
    if (!chip) { e.preventDefault(); return; }
    dragChip = chip;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', chip.dataset.src);
    requestAnimationFrame(() => chip.classList.add('dragging'));
  });
  rich.addEventListener('dragend', () => {
    if (dragChip) dragChip.classList.remove('dragging');
    dragChip = null;
    clearDrop();
  });
  rich.addEventListener('dragover', (e) => {
    if (!dragChip) return;
    e.preventDefault();
    const r = document.caretRangeFromPoint(e.clientX, e.clientY);
    if (!r || !rich.contains(r.startContainer) || dragChip.contains(r.startContainer)) return;
    if (!dropMarker) dropMarker = el('span', { className: 'drop-caret', contentEditable: 'false' });
    r.insertNode(dropMarker);
  });
  rich.addEventListener('drop', (e) => {
    if (!dragChip) return;
    e.preventDefault();
    const chip = dragChip;
    dragChip = null;
    chip.classList.remove('dragging');
    if (dropMarker && dropMarker.parentNode) {
      dropMarker.replaceWith(chip);
      dropMarker = null;
    } else clearDrop();
    placeCaretAfter(chip);
    syncFromRich();
  });

  function setView(v) {
    view = v;
    try { localStorage.setItem('fastblaze.editorView', v); } catch { /* ignore */ }
    $('view-blocks').setAttribute('aria-pressed', String(v === 'blocks'));
    $('view-code').setAttribute('aria-pressed', String(v === 'code'));
    rich.hidden = v !== 'blocks';
    $('code-wrap').hidden = v !== 'code';
    closeAc();
    if (v === 'blocks') renderBlocks();
    else { highlight(); autoGrow(); }
  }
  $('view-blocks').addEventListener('click', () => setView('blocks'));
  $('view-code').addEventListener('click', () => setView('code'));



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
    if ($('edit-pane').hidden || view !== 'code') return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.max($('edit-pane').clientHeight, ta.scrollHeight)}px`;
  }

  let previewDebounce = null;
  function afterTextChange() {
    onEdit();
    highlight();
    renderBlocks();
    clearTimeout(previewDebounce);
    previewDebounce = setTimeout(renderPreview, 300);
  }

  /** Insert at the caret. One «…» marker in `text` is selected afterwards. */
  function insertAtCursor(text) {
    const m = text.indexOf('«');
    const n = text.indexOf('»');
    const clean = text.replace(/[«»]/g, '');
    setMode('edit');
    if (view === 'blocks') {
      blocksInsert(clean);
      return;
    }
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
    if (view === 'blocks') {
      ta.value = text;
      afterTextChange();
      return;
    }
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
    else setView(view);
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
    if (view === 'blocks') {
      renderBlocks();
      const chips = [...rich.querySelectorAll('.blk-cmd')];
      const chip = chips.find((c) => Number(c.dataset.start) === src.start)
        || chips.find((c) => Number(c.dataset.start) <= src.start && src.start < Number(c.dataset.start) + c.dataset.src.length);
      if (chip) {
        chip.classList.add('selected', 'flash');
        chip.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        placeCaretAfter(chip);
      }
      return;
    }
    ta.focus();
    ta.setSelectionRange(src.start, src.end);
    const pane = $('edit-pane');
    const r = charRect(src.start);
    const pr = pane.getBoundingClientRect();
    if (r.top < pr.top || r.bottom > pr.bottom) pane.scrollBy({ top: r.top - pr.top - pane.clientHeight / 3, behavior: 'smooth' });
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
    const wrap = $('code-wrap').getBoundingClientRect();
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
      id: 'record', group: 'Automation', frequent: true, icon: 'record', title: 'Record from website',
      desc: 'Record clicks and typing on a page into steps', keywords: 'record macro capture flow',
      special: 'record', fields: [], build: () => '',
    },
    {
      id: 'click', group: 'Automation', frequent: true, icon: 'mouse', title: 'Click element',
      desc: 'Click an element on the page, then type into it', keywords: 'button selector testid tap pick',
      fields: [
        { key: 'pick', label: 'Which one', type: 'select', value: 'one',
          options: [['one', 'This element'], ['random', 'A random option from the list'], ['next', 'The next option on every run'],
            ['first', 'The first option'], ['last', 'The last option'], ['nth', 'Option number\u2026']],
          desc: (v) => (v.pick === 'one'
            ? 'For dropdown lists you can choose a random option, or go through the options one by one on each run.'
            : 'Open the dropdown first (click its trigger), then this step picks from all options of the list. Select one option on the web page and the list is found for you.'),
          onChange: (v) => { if (v.pick !== 'one' && v._list) { v.by = 'selector'; v.value = v._list; } } },
        { key: 'nth', label: 'Option number', type: 'number', value: '1', required: true, show: (v) => v.pick === 'nth', desc: '1 = first option of the list.' },
        { key: 'value', type: 'element', label: 'Element', required: true,
          desc: (v) => (v.pick === 'one'
            ? 'The element to click. Select it on a web page, or type a CSS selector.'
            : 'All options of the list. Select any one option on the web page.') },
        { key: 'exclude', label: 'Skip options', advanced: true, show: (v) => v.pick !== 'one',
          desc: 'Option texts to never choose, separated by | (e.g. — เลือก —|ไม่ระบุ). Disabled options are always skipped.' },
        { key: 'maxdelay', label: 'Max delay', short: 'Time', type: 'number', row: 'md',
          desc: () => `The element is clicked as soon as it becomes clickable. If it does not appear within this time, the snippet stops and shows an error. Leave empty to use Settings (${Math.round(currentSettings.timeout / 100) / 10}s).` },
        { key: 'unit', label: 'Unit', type: 'select', options: [['s', 'Seconds'], ['ms', 'Milliseconds']], value: 's', row: 'md' },
        { key: 'by', label: 'Find the element by', type: 'select', advanced: true, show: (v) => v.pick === 'one',
          options: [['selector', 'CSS selector'], ['text', 'Visible text']], value: 'selector',
          desc: 'Visible text works well for dropdown options that have no test id.' },
        { key: 'within', label: 'Only inside (CSS selector)', mono: true, advanced: true, show: (v) => v.by === 'text' && v.pick === 'one',
          desc: 'Optional. Limits the text search to this part of the page.' },
      ],
      build: (v) => {
        const delay = v.maxdelay !== '' && v.maxdelay != null ? `; maxdelay=${Number(v.maxdelay)}${v.unit}` : '';
        if (v.pick && v.pick !== 'one') {
          const pick = v.pick === 'nth' ? String(Math.max(1, Number(v.nth) || 1)) : v.pick;
          const exclude = v.exclude ? `; exclude=${tplArg(v.exclude)}` : '';
          return `{click: selector=${tplArg(v.value)}; pick=${pick}${exclude}${delay}}`;
        }
        return v.by === 'text'
          ? `{click: text=${tplArg(v.value)}${v.within ? `; selector=${tplArg(v.within)}` : ''}${delay}}`
          : `{click: selector=${tplArg(v.value)}${delay}}`;
      },
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
      desc: 'Pause, or wait until the page stops changing', keywords: 'delay sleep pause idle',
      fields: [
        { key: 'mode', label: 'Wait', type: 'select', value: 'idle',
          options: [['idle', 'Until the page stops changing (recommended)'], ['time', 'A fixed time']],
          desc: (v) => (v.mode === 'idle'
            ? 'Continues as soon as nothing on the page has changed for a short moment (gives up after 10 s). No guessing a delay.'
            : 'Always waits this long, even when the page is ready sooner.') },
        { key: 'amount', label: 'Duration', short: 'Amount', type: 'number', required: true, value: '500', row: 'dur', show: (v) => v.mode === 'time' },
        { key: 'unit', label: 'Unit', type: 'select', options: [['ms', 'Milliseconds'], ['s', 'Seconds']], value: 'ms', row: 'dur', show: (v) => v.mode === 'time' },
      ],
      build: (v) => (v.mode === 'idle' ? '{wait: idle}' : `{wait: ${Number(v.amount)}${v.unit}}`),
    },
    {
      id: 'waitfor', group: 'Automation', frequent: false, icon: 'hourglass', title: 'Wait for element',
      desc: 'Wait until something appears or disappears', keywords: 'wait load loading spinner appear disappear until',
      fields: [
        { key: 'value', type: 'element', label: 'Element', required: true,
          desc: 'What to wait for. Select it on a web page, or type a CSS selector.' },
        { key: 'state', label: 'Wait until it', type: 'select', value: 'visible',
          options: [['visible', 'Appears'], ['gone', 'Disappears (e.g. a loading spinner)']] },
        { key: 'maxdelay', label: 'Max delay', short: 'Time', type: 'number', row: 'md',
          desc: () => `Stops with an error if it takes longer. Leave empty to use Settings (${Math.round(currentSettings.timeout / 100) / 10}s).` },
        { key: 'unit', label: 'Unit', type: 'select', options: [['s', 'Seconds'], ['ms', 'Milliseconds']], value: 's', row: 'md' },
        { key: 'by', label: 'Find the element by', type: 'select', advanced: true,
          options: [['selector', 'CSS selector'], ['text', 'Visible text']], value: 'selector',
          desc: 'Visible text is handy for messages like "บันทึกสำเร็จ".' },
        { key: 'within', label: 'Only inside (CSS selector)', mono: true, advanced: true, show: (v) => v.by === 'text' },
      ],
      build: (v) => {
        const target = v.by === 'text'
          ? `text=${tplArg(v.value)}${v.within ? `; selector=${tplArg(v.within)}` : ''}`
          : `selector=${tplArg(v.value)}`;
        const state = v.state === 'gone' ? '; state=gone' : '';
        const delay = v.maxdelay !== '' && v.maxdelay != null ? `; maxdelay=${Number(v.maxdelay)}${v.unit}` : '';
        return `{waitfor: ${target}${state}${delay}}`;
      },
    },
    {
      id: 'formtext', group: 'Forms', icon: 'textfield', title: 'Text field',
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
      id: 'thaiid', group: 'Test data', frequent: true, icon: 'idcard', title: 'Thai ID (test)',
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
      id: 'thaiphone', group: 'Test data', icon: 'phone', title: 'Phone number',
      desc: 'Thai mobile (06/08/09) or landline number', keywords: 'phone mobile tel เบอร์',
      fields: [
        { key: 'type', label: 'Type', type: 'select', options: [['mobile', 'Mobile (10 digits)'], ['landline', 'Landline (9 digits)']], value: 'mobile' },
        { key: 'format', label: 'Format', type: 'select', options: [['plain', '0812345678'], ['dash', '081-234-5678']], value: 'plain' },
        { key: 'source', label: 'Source', type: 'select', value: 'list',
          options: () => [['list', `Allow list in Settings (${currentSettings.phoneAllow.length} numbers)`], ['random', 'Random number (may belong to a real person)']],
          desc: (v) => (v.source === 'random'
            ? 'Warning: random numbers are real-looking and are probably assigned to someone. Do not use where SMS or calls are sent.'
            : currentSettings.phoneAllow.length ? 'Picks one of the team numbers from Settings.' : 'The allow list is empty, so a random number is used until you add numbers in Settings.') },
        { key: 'prefix', label: 'Starts with (optional)', mono: true, desc: 'Digits to keep at the start, e.g. 064.' },
      ],
      build: (v) => {
        const args = [v.type === 'landline' ? 'type=landline' : '', v.format === 'dash' ? 'format=dash' : '', v.source === 'random' ? 'source=random' : '', v.prefix ? `prefix=${v.prefix.replace(/\D/g, '')}` : ''].filter(Boolean);
        return args.length ? `{thaiphone: ${args.join('; ')}}` : '{thaiphone}';
      },
    },
    {
      id: 'thainame', group: 'Test data', frequent: true, icon: 'user', title: 'Thai name',
      desc: 'Random first name, last name or full name', keywords: 'name person ชื่อ นามสกุล',
      fields: [
        { key: 'part', label: 'Part', type: 'select', options: [['full', 'Full name'], ['first', 'First name'], ['last', 'Last name']], value: 'full' },
        { key: 'gender', label: 'Gender', type: 'select', options: [['any', 'Any'], ['male', 'Male'], ['female', 'Female']], value: 'any', show: (v) => v.part !== 'last' },
        { key: 'lang', label: 'Language', type: 'select', options: [['th', 'Thai (สมชาย)'], ['en', 'English (Somchai)']], value: 'th' },
        { key: 'title', label: 'Title', type: 'select', options: [['no', 'No title'], ['yes', 'With title (นาย / นางสาว)']], value: 'no', show: (v) => v.part !== 'last' },
      ],
      build: (v) => {
        const args = [v.part !== 'full' ? `part=${v.part}` : '', v.part !== 'last' && v.gender !== 'any' ? `gender=${v.gender}` : '',
          v.lang === 'en' ? 'lang=en' : '', v.part !== 'last' && v.title === 'yes' ? 'title=yes' : ''].filter(Boolean);
        return args.length ? `{thainame: ${args.join('; ')}}` : '{thainame}';
      },
    },
    {
      id: 'email', group: 'Test data', icon: 'mail', title: 'Email',
      desc: 'Unique test address on a test domain', keywords: 'email mail address',
      fields: [
        { key: 'base', label: 'Name part', value: 'test', mono: true, desc: 'Result looks like test.abcdef12@example.com' },
        { key: 'domain', label: 'Domain', value: 'example.com', mono: true, desc: 'example.com never delivers mail, so it is safe for tests.' },
      ],
      build: (v) => {
        const args = [v.base && v.base !== 'test' ? `base=${tplArg(v.base)}` : '', v.domain && v.domain !== 'example.com' ? `domain=${tplArg(v.domain)}` : ''].filter(Boolean);
        return args.length ? `{email: ${args.join('; ')}}` : '{email}';
      },
    },
    {
      id: 'date', group: 'Test data', frequent: true, icon: 'calendar', title: 'Date',
      desc: 'Today, a shifted date, or a birthday for an age range', keywords: 'date birthday วันเกิด วันที่ พ.ศ.',
      fields: [
        { key: 'mode', label: 'Which date', type: 'select', value: 'age',
          options: [['today', 'Today'], ['shift', 'Before / after today'], ['age', 'Birthday for an age range']] },
        { key: 'amount', label: 'Shift', short: 'Amount', type: 'number', value: '1', row: 'shift', show: (v) => v.mode === 'shift' },
        { key: 'unit', label: 'Unit', type: 'select', row: 'shift', show: (v) => v.mode === 'shift', value: 'd',
          options: [['d', 'Days'], ['w', 'Weeks'], ['m', 'Months'], ['y', 'Years']] },
        { key: 'dir', label: 'Direction', type: 'select', show: (v) => v.mode === 'shift', value: '-',
          options: [['-', 'Ago (in the past)'], ['+', 'From now (in the future)']] },
        { key: 'ageMin', label: 'Age', short: 'From', type: 'number', value: '20', row: 'age', show: (v) => v.mode === 'age', required: true,
          desc: 'A random birthday so the person is between these ages today.' },
        { key: 'ageMax', label: 'To', type: 'number', value: '40', row: 'age', show: (v) => v.mode === 'age', required: true },
        { key: 'format', label: 'Format', type: 'select', value: 'DDMMBBBB',
          options: [['DDMMBBBB', '24052545 (DDMMBBBB, พ.ศ.)'], ['DD/MM/BBBB', '24/05/2545 (พ.ศ.)'], ['DD/MM/YYYY', '24/05/2002 (ค.ศ.)'],
            ['YYYY-MM-DD', '2002-05-24 (ISO)'], ['D MMMM BBBB', '24 พฤษภาคม 2545'], ['D MMM BB', '24 พ.ค. 45'], ['custom', 'Custom…']] },
        { key: 'custom', label: 'Custom format', mono: true, required: true, show: (v) => v.format === 'custom', value: 'DD/MM/BBBB',
          desc: 'BBBB/BB = Buddhist year, YYYY/YY = AD year, MMMM/MMM = Thai month, MM/M = month, DD/D = day.' },
      ],
      build: (v) => {
        const fmt = v.format === 'custom' ? v.custom : v.format;
        const args = [];
        if (v.mode === 'shift') args.push(`shift=${v.dir}${Math.abs(Number(v.amount) || 0)}${v.unit}`);
        if (v.mode === 'age') args.push(`age=${Number(v.ageMin)}${Number(v.ageMax) !== Number(v.ageMin) ? `-${Number(v.ageMax)}` : ''}`);
        if (fmt && fmt !== 'DD/MM/BBBB') args.push(`format=${tplArg(fmt)}`);
        return args.length ? `{date: ${args.join('; ')}}` : '{date}';
      },
    },
    {
      id: 'zipcode', group: 'Test data', icon: 'pin', title: 'Zip code',
      desc: 'Thai postal code with a real province prefix', keywords: 'zip postal postcode รหัสไปรษณีย์',
      fields: [],
      build: () => '{zipcode}',
    },
    {
      id: 'bankaccount', group: 'Test data', icon: 'bank', title: 'Bank account',
      desc: '10-digit account number', keywords: 'bank account บัญชี',
      fields: [
        { key: 'source', label: 'Source', type: 'select', value: 'list',
          options: () => [['list', `Allow list in Settings (${currentSettings.bankAllow.length} accounts)`], ['random', 'Random number (may belong to a real person)']],
          desc: (v) => (v.source === 'random'
            ? 'Warning: a random account number can exist. Never use it where money is transferred.'
            : currentSettings.bankAllow.length ? 'Picks one of the team accounts from Settings.' : 'The allow list is empty, so a random number is used until you add accounts in Settings.') },
        { key: 'format', label: 'Format', type: 'select', options: [['plain', '1234567890'], ['dash', '123-4-56789-0']], value: 'plain' },
      ],
      build: (v) => {
        const args = [v.format === 'dash' ? 'format=dash' : '', v.source === 'random' ? 'source=random' : ''].filter(Boolean);
        return args.length ? `{bankaccount: ${args.join('; ')}}` : '{bankaccount}';
      },
    },
    {
      id: 'randomtext', group: 'Test data', icon: 'text', title: 'Random text',
      desc: 'Random letters, digits or Thai characters', keywords: 'random string text password code',
      fields: [
        { key: 'length', label: 'Length', type: 'number', value: '8', required: true },
        { key: 'type', label: 'Characters', type: 'select', value: 'alnum',
          options: [['alnum', 'Letters and digits'], ['letters', 'Letters'], ['lower', 'Lowercase'], ['upper', 'Uppercase'], ['digits', 'Digits'], ['thai', 'Thai letters']] },
      ],
      build: (v) => `{randomtext: length=${Number(v.length)}${v.type !== 'alnum' ? `; type=${v.type}` : ''}}`,
    },
    {
      id: 'random', group: 'Test data', icon: 'dice', title: 'Random number',
      desc: 'A random number in a range', keywords: 'random number digit',
      fields: [
        { key: 'min', label: 'Range', short: 'Min', type: 'number', required: true, value: '0', row: 'range' },
        { key: 'max', label: 'Max', type: 'number', required: true, value: '9', row: 'range' },
        { key: 'kind', label: 'Type', type: 'select', options: [['whole', 'Whole number'], ['decimal', 'Decimal']], value: 'whole' },
      ],
      build: (v) => `{random-number: min=${Number(v.min)}; max=${Number(v.max)}${v.kind === 'decimal' ? '; rounded=no' : ''}}`,
    },
    {
      id: 'import', group: 'Snippets & logic', frequent: true, icon: 'fileplus', title: 'Import snippet',
      desc: 'Embed another snippet', keywords: 'include reuse embed',
      fields: [{ key: 'shortcut', label: 'Snippet', type: 'select', options: snippetOptions, required: true }],
      build: (v) => `{import: ${v.shortcut}}`,
    },
    {
      id: 'var', group: 'Snippets & logic', icon: 'variable', title: 'Set variable',
      desc: 'Store a value to reuse later', keywords: 'variable assign let',
      fields: [
        { key: 'name', label: 'Variable name', required: true, mono: true, pattern: /^[A-Za-z_]\w*$/, patternMsg: 'Letters, digits and _ only; cannot start with a digit.' },
        { key: 'value', label: 'Value or expression', required: true, mono: true, hint: 'e.g. 5, "text", a + 1, floor(x / 2)' },
      ],
      build: (v) => `{${v.name}=${v.value}}`,
    },
    {
      id: 'expr', group: 'Snippets & logic', icon: 'sigma', title: 'Show value',
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
      b.addEventListener('click', () => (c.special === 'record' ? openRecordPanel() : openCommand(c)));
      return b;
    };
    const nodes = [];
    if (q) {
      const hits = COMMANDS.filter((c) => `${c.title} ${c.desc} ${c.keywords} ${c.id}`.toLowerCase().includes(q));
      if (hits.length) nodes.push(...hits.map(item));
      else nodes.push(el('div', { className: 'cmd-empty', textContent: 'No matching command.' }));
    } else {
      nodes.push(el('div', { className: 'cmd-group', textContent: 'Frequently used' }), ...COMMANDS.filter((c) => c.frequent).map(item));
      for (const g of ['Automation', 'Forms', 'Test data', 'Snippets & logic']) {
        nodes.push(el('div', { className: 'cmd-group', textContent: g }), ...COMMANDS.filter((c) => c.group === g).map(item));
      }
    }
    $('cmd-list').replaceChildren(...nodes);
  }
  $('cmd-q').addEventListener('input', renderCommands);
  $('open-help').addEventListener('click', () => $('help').showModal());

  // ---------- command config panel (right side) ----------
  let currentSettings = FB.storage.normalizeSettings();
  FB.storage.loadSettings().then((s) => { currentSettings = s; });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[FB.storage.SETTINGS_KEY]) currentSettings = FB.storage.normalizeSettings(changes[FB.storage.SETTINGS_KEY].newValue);
  });

  let pickWaiter = null; // { done(candidate), me: tab }

  function showList() {
    if (pickWaiter) cancelPick();
    $('cmd-config').hidden = true;
    $('cmd-config').replaceChildren();
    for (const n of document.querySelectorAll('.commands > .cmd-search, .commands > .cmd-list, .commands > .cmd-footer')) n.hidden = false;
  }

  /**
   * Start "Select from website": the background switches to the last used tab and
   * runs the picker there; the picker follows any tab the user switches to.
   * The result arrives through storage (lastPick).
   */
  async function pickFromWebsite(done, onWaiting) {
    if (!chrome.tabs || !chrome.tabs.getCurrent) {
      // Test harness without tab APIs: just wait for a pick to arrive in storage.
      pickWaiter = { done, since: Date.now() };
      onWaiting();
      return;
    }
    const me = await chrome.tabs.getCurrent();
    pickWaiter = { done, since: Date.now() };
    onWaiting();
    const res = await chrome.runtime.sendMessage({ type: 'fastblaze:pick-start', fromTabId: me && me.id }).catch((err) => ({ ok: false, error: err.message }));
    if (!res || !res.ok) {
      pickWaiter = null;
      done(null);
      await FB.dialog.alert({ title: 'Cannot start picking', message: [(res && res.error) || 'Unknown error', '. Open the web page in another tab, then try again.'] });
    }
  }

  function cancelPick() {
    pickWaiter = null;
    if (chrome.runtime && chrome.runtime.sendMessage) chrome.runtime.sendMessage({ type: 'fastblaze:pick-cancel' }).catch(() => {});
  }

  chrome.storage.onChanged.addListener(async (changes, area) => {
    if (area !== 'local' || !changes[LAST_PICK_KEY] || !pickWaiter) return;
    const p = changes[LAST_PICK_KEY].newValue;
    if (!p || p.at < pickWaiter.since) return;
    const { done } = pickWaiter;
    pickWaiter = null; // the background brings this tab back to the front
    done((p.candidates && p.candidates[0]) || null, p);
  });

  // ---------- Record from website (Manage page) ----------
  const LAST_RECORDING_KEY = 'fastblaze.lastRecording';
  let recWaiter = null; // { since, done(template) }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes[LAST_RECORDING_KEY] || !recWaiter) return;
    const r = changes[LAST_RECORDING_KEY].newValue;
    if (!r || r.at < recWaiter.since) return;
    const { done } = recWaiter;
    recWaiter = null;
    done(r);
  });

  function cancelRecording() {
    recWaiter = null;
    if (chrome.runtime && chrome.runtime.sendMessage) chrome.runtime.sendMessage({ type: 'fastblaze:rec-cancel' }).catch(() => {});
  }

  function openRecordPanel() {
    const panel = $('cmd-config');
    for (const n of document.querySelectorAll('.commands > .cmd-search, .commands > .cmd-list, .commands > .cmd-footer')) n.hidden = true;
    panel.hidden = false;
    let waiting = !!recWaiter;

    const back = el('button', { type: 'button', className: 'icon-only ghost-btn', title: 'Back to commands' }, [FB.icon('back')]);
    back.addEventListener('click', () => { if (waiting) cancelRecording(); showList(); });
    const body = el('div', { className: 'cfg-body' });
    panel.replaceChildren(el('div', { className: 'cfg-head' }, [back, FB.icon('record'), el('strong', { textContent: 'Record from website' })]), body);

    function render() {
      const start = el('button', { type: 'button', className: 'pick-btn' }, [FB.icon('record'), waiting ? 'Recording…' : 'Start recording']);
      start.disabled = waiting;
      start.addEventListener('click', startRec);
      const nodes = [
        el('div', { className: 'cfg-title', textContent: 'Record steps' }),
        el('p', { className: 'cfg-desc', textContent: 'Switches to your last tab and records clicks, typing, dropdown choices and Enter. Before your first click you can switch to any other tab. Passwords are never stored.' }),
        start,
      ];
      if (waiting) {
        const stop = el('button', { type: 'button', className: 'link-btn', textContent: 'Cancel recording' });
        stop.addEventListener('click', () => { cancelRecording(); waiting = false; render(); });
        nodes.push(el('p', { className: 'cfg-desc rec-wait' }, ['Use the page, then press ', el('b', { textContent: 'Stop & save' }), ' in the bar at the top of the page. The steps are inserted here at the cursor. ', stop]));
      }
      body.replaceChildren(el('section', { className: 'cfg-section' }, nodes));
    }

    async function startRec() {
      const since = Date.now();
      recWaiter = {
        since,
        done: (r) => {
          waiting = false;
          showList();
          insertAtCursor(r.template);
        },
      };
      waiting = true;
      render();
      if (!chrome.runtime || !chrome.runtime.sendMessage || !chrome.tabs) return; // test harness: wait for storage
      const me = await chrome.tabs.getCurrent();
      const res = await chrome.runtime.sendMessage({ type: 'fastblaze:rec-start', fromTabId: me && me.id }).catch((err) => ({ ok: false, error: err.message }));
      if (!res || !res.ok) {
        recWaiter = null;
        waiting = false;
        render();
        await FB.dialog.alert({ title: 'Cannot start recording', message: [(res && res.error) || 'Unknown error', '. Open the web page in another tab, then try again.'] });
      }
    }

    render();
  }

  // ---------- edit an existing command chip ----------
  const DATE_PRESETS = ['DDMMBBBB', 'DD/MM/BBBB', 'DD/MM/YYYY', 'YYYY-MM-DD', 'D MMMM BBBB', 'D MMM BB'];
  const splitTime = (v, defUnit) => {
    const m = String(v ?? '').trim().match(/^(\d+(?:\.\d+)?)\s*(ms|s)?$/i);
    return m ? { amount: m[1], unit: (m[2] || defUnit).toLowerCase() } : null;
  };
  const isNo = (v) => /^(no|false|0|off)$/i.test(String(v ?? ''));
  const isYesArg = (v) => /^(yes|true|1|on)$/i.test(String(v ?? ''));

  /** Turn a parsed command back into the form values of its Dynamic command. */
  const PARSERS = {
    click: (a) => {
      const d = splitTime(a.maxdelay, 'ms');
      return {
        by: a.text != null ? 'text' : 'selector', value: a.text ?? a.selector ?? a._[0] ?? '',
        within: a.text != null ? (a.selector ?? '') : '', maxdelay: d ? d.amount : '', unit: d ? d.unit : 's',
        pick: !a.pick ? 'one' : /^\d+$/.test(a.pick) ? 'nth' : a.pick, nth: /^\d+$/.test(a.pick || '') ? a.pick : '1',
        exclude: a.exclude ?? '',
      };
    },
    select: (a) => {
      const by = a.index != null ? 'index' : a.value != null ? 'value' : 'text';
      return { selector: a.selector ?? '', by, value: a[by] ?? '' };
    },
    clear: (a) => ({ target: a.selector || a._[0] ? 'selector' : 'focused', selector: a.selector ?? a._[0] ?? '' }),
    key: (a) => ({ key: (a.key ?? a._[0] ?? 'enter').toLowerCase() }),
    wait: (a) => {
      const v = a.delay ?? a._[0] ?? '500ms';
      if (/^idle$/i.test(String(v).trim())) return { mode: 'idle' };
      const d = splitTime(v, 'ms');
      return d ? { mode: 'time', amount: d.amount, unit: d.unit } : { mode: 'time' };
    },
    waitfor: (a) => {
      const d = splitTime(a.maxdelay, 'ms');
      return {
        by: a.text != null ? 'text' : 'selector', value: a.text ?? a.selector ?? a._[0] ?? '',
        within: a.text != null ? (a.selector ?? '') : '', state: a.state === 'gone' ? 'gone' : 'visible',
        maxdelay: d ? d.amount : '', unit: d ? d.unit : 's',
      };
    },
    formtext: (a) => ({ name: a.name ?? '', default: a.default ?? '', cols: a.cols ?? '' }),
    formparagraph: (a) => ({ name: a.name ?? '', default: a.default ?? '' }),
    formmenu: (a) => ({ name: a.name ?? '', options: [a.default, ...a._].filter((x) => x != null && x !== '').join(', ') }),
    thaiid: (a) => ({ prefix: a.prefix ?? a.first ?? '', format: a.format === 'dash' ? 'dash' : 'plain' }),
    random: (a) => ({ min: a.min ?? '0', max: a.max ?? '100', kind: isNo(a.rounded) ? 'decimal' : 'whole' }),
    import: (a) => ({ shortcut: a.shortcut ?? a._[0] ?? '' }),
    thaiphone: (a) => ({
      type: a.type === 'landline' ? 'landline' : 'mobile', format: a.format === 'dash' ? 'dash' : 'plain',
      source: a.source === 'random' ? 'random' : 'list', prefix: a.prefix ?? '',
    }),
    thainame: (a) => ({
      part: a.part ?? a._[0] ?? 'full', gender: a.gender ?? 'any', lang: a.lang === 'en' ? 'en' : 'th', title: isYesArg(a.title) ? 'yes' : 'no',
    }),
    email: (a) => ({ base: a.base ?? 'test', domain: a.domain ?? 'example.com' }),
    date: (a) => {
      const fmt = a.format ?? a._[0] ?? 'DD/MM/BBBB';
      const v = DATE_PRESETS.includes(fmt) ? { format: fmt } : { format: 'custom', custom: fmt };
      if (a.age) {
        const [mn, mx] = String(a.age).split('-').map((x) => x.trim());
        return { ...v, mode: 'age', ageMin: mn, ageMax: mx ?? mn };
      }
      const m = String(a.shift ?? '').trim().match(/^([+-]?)(\d+)\s*([dwmy])$/i);
      if (m) return { ...v, mode: 'shift', dir: m[1] === '+' ? '+' : '-', amount: m[2], unit: m[3].toLowerCase() };
      return { ...v, mode: 'today' };
    },
    zipcode: () => ({}),
    bankaccount: (a) => ({ format: a.format === 'dash' ? 'dash' : 'plain', source: a.source === 'random' ? 'random' : 'list' }),
    randomtext: (a) => ({ length: a.length ?? a._[0] ?? '8', type: a.type ?? 'alnum' }),
  };

  function editCommand(chip) {
    const raw = chip.dataset.src;
    const n = FB.tokenizeTemplate(raw)[0].node;
    let def;
    let vals;
    if (n.type === 'assign') { def = COMMANDS.find((c) => c.id === 'var'); vals = { name: n.name, value: n.value.raw ?? '' }; }
    else if (n.type === 'expr') { def = COMMANDS.find((c) => c.id === 'expr'); vals = { expr: n.expr }; }
    else if (n.type === 'cmd') {
      const id = n.name === 'random-number' ? 'random' : n.name;
      def = COMMANDS.find((c) => c.id === id);
      vals = def && PARSERS[id] ? PARSERS[id](n.args) : null;
    }
    if (!def || !vals) {
      // No form for this command: edit it as code.
      const at = ta.value.indexOf(raw);
      setView('code');
      ta.focus();
      if (at !== -1) ta.setSelectionRange(at, at + raw.length);
      return;
    }
    openCommand(def, {
      vals,
      apply: (text) => {
        if (!chip.isConnected) return insertAtCursor(text);
        const fresh = templateNodes(text);
        chip.replaceWith(...fresh);
        if (fresh.length) placeCaretAfter(fresh[fresh.length - 1]);
        syncFromRich();
      },
    });
  }

  // Config view for one command: sections with title + description + control.
  // edit = { vals, apply(text) } when changing an existing command chip.
  function openCommand(c, edit) {
    const panel = $('cmd-config');
    for (const n of document.querySelectorAll('.commands > .cmd-search, .commands > .cmd-list, .commands > .cmd-footer')) n.hidden = true;
    panel.hidden = false;

    const val = (x, v) => (typeof x === 'function' ? x(v) : x);
    const vals = {};
    for (const f of c.fields) {
      const opts = val(f.options, vals);
      vals[f.key] = f.value ?? (opts && opts[0] ? opts[0][0] : '');
    }
    if (edit) for (const [k, v] of Object.entries(edit.vals)) if (v != null) vals[k] = String(v);
    let showAdvanced = false;
    let manualEdit = false;
    let waiting = false;
    const inputs = {};

    const back = el('button', { type: 'button', className: 'icon-only ghost-btn', title: 'Back to commands' }, [FB.icon('back')]);
    back.addEventListener('click', showList);
    const head = el('div', { className: 'cfg-head' }, [back, FB.icon(c.icon), el('strong', { textContent: edit ? `Edit: ${c.title}` : c.title })]);
    const body = el('div', { className: 'cfg-body' });
    const out = el('code', { className: 'cmd-out' });
    const err = el('p', { className: 'warn', hidden: true });
    const cancel = el('button', { type: 'button', className: 'outline', textContent: 'Cancel' });
    const ok = el('button', { type: 'button', className: 'primary' }, edit ? [FB.icon('check'), 'Update'] : [FB.icon('plus'), 'Insert']);
    cancel.addEventListener('click', showList);
    const foot = el('div', { className: 'cfg-foot' }, [el('div', { className: 'cfg-out-label muted', textContent: 'Will insert' }), out, err,
      el('div', { className: 'fb-dialog-actions' }, [cancel, ok])]);
    panel.replaceChildren(head, body, foot);

    function control(f) {
      const opts = val(f.options, vals);
      let input;
      if (f.type === 'select') {
        input = el('select', {}, (opts || []).map(([v, label]) => el('option', { value: v, textContent: label })));
        if (!opts || !opts.length) input.append(el('option', { value: '', textContent: '(nothing to choose)' }));
        input.value = vals[f.key];
        if (input.value !== vals[f.key]) vals[f.key] = input.value;
        input.addEventListener('change', () => { vals[f.key] = input.value; if (f.onChange) f.onChange(vals); render(); });
      } else {
        input = el('input', { type: val(f.type, vals) || 'text', value: vals[f.key] ?? '', className: f.mono ? 'mono' : '', spellcheck: false });
        input.addEventListener('input', () => { vals[f.key] = input.value; updateOut(); });
      }
      inputs[f.key] = input;
      return input;
    }

    function elementSection(f) {
      const isText = vals.by === 'text';
      const pickBtn = el('button', { type: 'button', className: 'pick-btn' }, [FB.icon('mouse'), waiting ? 'Waiting for your click…' : 'Select from website']);
      pickBtn.disabled = waiting;
      pickBtn.addEventListener('click', () => {
        pickFromWebsite((cand, pick) => {
          waiting = false;
          vals._list = pick && pick.list ? pick.list.selector : null;
          vals._listCount = pick && pick.list ? pick.list.count : 0;
          if (vals.pick && vals.pick !== 'one' && vals._list) { vals.by = 'selector'; vals.value = vals._list; }
          else if (cand) {
            if (cand.text != null && !cand.selector) { vals.by = 'text'; vals.value = cand.text; }
            else { vals.by = 'selector'; vals.value = cand.selector; }
          }
          render();
        }, () => { waiting = true; render(); });
      });
      const current = vals.value
        ? el('code', { className: 'cfg-current', textContent: vals.value, title: vals.value })
        : el('span', { className: 'muted', textContent: '(none)' });
      const edit = el('button', { type: 'button', className: 'link-btn', textContent: manualEdit ? 'Done' : 'Manual edit' });
      edit.addEventListener('click', () => { manualEdit = !manualEdit; render(); if (manualEdit) inputs[f.key].focus(); });
      const input = control({ ...f, type: 'text', mono: true });
      input.hidden = !manualEdit;
      input.addEventListener('input', () => { current.textContent = input.value || '(none)'; });
      const nodes = [
        el('div', { className: 'cfg-title', textContent: f.label }),
        el('p', { className: 'cfg-desc', textContent: val(f.desc, vals) }),
        pickBtn,
      ];
      if (waiting) {
        const stop = el('button', { type: 'button', className: 'link-btn', textContent: 'Cancel' });
        stop.addEventListener('click', () => { cancelPick(); waiting = false; render(); });
        nodes.push(el('p', { className: 'cfg-desc' }, ['Switch to any tab and click the element there. ', stop]));
      }
      const listMode = vals.pick && vals.pick !== 'one';
      const what = listMode ? `Options${vals._listCount && vals.value === vals._list ? ` (${vals._listCount})` : ''}: ` : `${isText ? 'Text' : 'Selector'}: `;
      nodes.push(el('div', { className: 'cfg-status' }, [el('span', { textContent: what }), current, el('span', { className: 'spacer' }), edit]), input);
      if (listMode && !vals._list && vals.value && !/[>\s]/.test(vals.value)) {
        nodes.push(el('p', { className: 'cfg-desc warn-soft', textContent: 'This looks like one element. Select an option on the web page so the whole list is used.' }));
      }
      return el('section', { className: 'cfg-section' }, nodes);
    }

    function fieldSection(fields) {
      const first = fields[0];
      const desc = val(first.desc, vals);
      const hint = val(first.hint, vals);
      // Native <select>s become custom dropdowns (enhanced once they have a parent).
      const ctrl = (f) => {
        const input = control(f);
        if (f.type !== 'select') return input;
        const box = el('div', { className: 'fb-select-wrap' }, [input]);
        FB.enhanceSelect(input);
        return box;
      };
      const controls = fields.length > 1
        ? el('div', { className: 'cf-row' }, fields.map((f) => el('label', { className: 'cf' }, [f.short || val(f.label, vals), ctrl(f)])))
        : ctrl(first);
      return el('section', { className: 'cfg-section' }, [
        el('div', { className: 'cfg-title', textContent: val(first.label, vals) }),
        ...(desc ? [el('p', { className: 'cfg-desc', textContent: desc })] : []),
        controls,
        ...(hint ? [el('span', { className: 'hint muted', textContent: hint })] : []),
      ]);
    }

    function render() {
      const sections = [];
      const groups = [];
      for (const f of c.fields) {
        if (f.show && !f.show(vals)) continue;
        if (f.advanced) continue;
        const last = groups[groups.length - 1];
        if (f.row && last && last[0].row === f.row) last.push(f);
        else groups.push([f]);
      }
      for (const g of groups) sections.push(g[0].type === 'element' ? elementSection(g[0]) : fieldSection(g));
      const adv = c.fields.filter((f) => f.advanced && (!f.show || f.show(vals)));
      if (adv.length) {
        const toggle = el('button', { type: 'button', className: 'adv-toggle' }, [FB.icon('chevron'), showAdvanced ? 'Hide advanced settings' : 'Show advanced settings']);
        toggle.classList.toggle('open', showAdvanced);
        toggle.addEventListener('click', () => { showAdvanced = !showAdvanced; render(); });
        sections.push(toggle);
        if (showAdvanced) for (const f of adv) sections.push(fieldSection([f]));
      }
      if (!sections.length) sections.push(el('section', { className: 'cfg-section' }, [el('p', { className: 'cfg-desc', textContent: `${c.desc}. Nothing to set up.` })]));
      body.replaceChildren(...sections);
      updateOut();
    }

    function missing() {
      for (const f of c.fields) {
        if (f.show && !f.show(vals)) continue;
        const v = String(vals[f.key] ?? '').trim();
        const label = val(f.label, vals);
        if (f.required && !v) return { f, msg: f.type === 'element' ? 'Select an element on a web page, or use Manual edit.' : `${label} is required.` };
        if (v && f.pattern && !f.pattern.test(v)) return { f, msg: f.patternMsg };
        if (v && val(f.type, vals) === 'number' && Number.isNaN(Number(v))) return { f, msg: `${label} must be a number.` };
      }
      return null;
    }

    function updateOut() {
      const m = missing();
      out.textContent = m ? '…' : c.build(vals);
      ok.disabled = !!m;
      err.hidden = true;
    }

    ok.addEventListener('click', () => {
      const m = missing();
      if (m) {
        err.textContent = m.msg;
        err.hidden = false;
        return;
      }
      const text = c.build(vals);
      showList();
      if (edit) edit.apply(text);
      else insertAtCursor(text);
    });

    render();
    const first = body.querySelector('input:not([hidden]), .fb-select, .pick-btn');
    if (first) first.focus();
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !$('cmd-config').hidden && !document.querySelector('.fb-select-menu') && !document.querySelector('dialog[open]')) showList();
  });

  renderCommands();


  // ---------- settings ----------
  async function openSettings() {
    const s = await FB.storage.loadSettings();
    $('s-highlight').checked = s.highlight;
    $('s-step').value = s.stepDelay;
    $('s-timeout').value = s.timeout / 1000;
    $('s-volume').value = s.soundVolume;
    $('s-phones').value = s.phoneAllow.join('\n');
    $('s-banks').value = s.bankAllow.join('\n');
    showVolume();
    showAllowCounts();
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
      phoneAllow: $('s-phones').value,
      bankAllow: $('s-banks').value,
    });
    showAllowCounts();
  }
  function showAllowCounts() {
    const n = (id, min, max) => FB.storage.normalizeSettings({ [id]: $(id === 'phoneAllow' ? 's-phones' : 's-banks').value })[id].length;
    const p = n('phoneAllow'), b = n('bankAllow');
    $('s-phones-count').textContent = p ? `(${p})` : '(empty: random)';
    $('s-banks-count').textContent = b ? `(${b})` : '(empty: random)';
  }
  $('open-settings').addEventListener('click', openSettings);
  for (const id of ['s-highlight', 's-step', 's-timeout', 's-volume', 's-phones', 's-banks']) $(id).addEventListener('change', saveSettingsFromForm);
  for (const id of ['s-phones', 's-banks']) $(id).addEventListener('input', showAllowCounts);
  $('s-volume').addEventListener('input', showVolume);
  $('s-volume').addEventListener('change', () => FB.sound.trigger($('s-volume').value));
  $('s-volume-test').addEventListener('click', () => FB.sound.trigger($('s-volume').value));

  FB.storage.load().then((d) => {
    data = d;
    const m = location.hash.match(/snippet=([\w-]+)/); // opened after a recording
    select(m && findSnippet(m[1]) ? m[1] : null);
  });
})();
