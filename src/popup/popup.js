(function () {
  'use strict';
  const FB = globalThis.FastBlaze;
  const $ = (id) => document.getElementById(id);
  let all = [];
  let shown = [];

  function setStatus(msg, isError) {
    $('status').textContent = msg;
    $('status').className = isError ? 'muted error' : 'muted';
  }

  // Thai ID quick generator
  const newId = () => { $('tid').textContent = FB.generateThaiId(); };
  $('tid-new').addEventListener('click', newId);
  $('tid-copy').addEventListener('click', async () => {
    await navigator.clipboard.writeText($('tid').textContent);
    setStatus('Copied ' + $('tid').textContent);
    newId();
  });
  newId();

  $('open-options').addEventListener('click', () => chrome.runtime.openOptionsPage());

  function render() {
    const q = $('q').value.trim().toLowerCase();
    shown = all.filter((s) => !q || `${s.name} ${s.shortcut} ${s.folder}`.toLowerCase().includes(q));
    const list = $('list');
    list.replaceChildren(...shown.map((s, i) => {
      const li = document.createElement('li');
      if (i === 0 && q) li.className = 'active';
      const left = document.createElement('div');
      left.className = 'name';
      left.textContent = s.name || s.shortcut || '(untitled)';
      const folder = document.createElement('div');
      folder.className = 'folder muted';
      folder.textContent = s.folder;
      left.append(folder);
      const chip = document.createElement('span');
      chip.className = 'chip';
      chip.textContent = s.shortcut;
      li.append(left, chip);
      li.addEventListener('click', () => run(s));
      return li;
    }));
    if (!shown.length) setStatus(all.length ? 'No match' : 'No snippets yet — click Manage');
    else setStatus('');
  }

  async function send(tabId, id) {
    return chrome.tabs.sendMessage(tabId, { type: 'fastblaze:run', id }, { frameId: 0 });
  }

  async function run(snippet) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;
    try {
      let res;
      try {
        res = await send(tab.id, snippet.id);
      } catch {
        // Tab was open before the extension loaded: inject the content scripts now.
        const files = chrome.runtime.getManifest().content_scripts[0].js;
        await chrome.scripting.executeScript({ target: { tabId: tab.id, allFrames: true }, files });
        res = await send(tab.id, snippet.id);
      }
      if (res && res.ok === false) throw new Error(res.error);
      window.close();
    } catch (err) {
      setStatus(`Cannot run here: ${err.message}`, true);
    }
  }

  $('q').addEventListener('input', render);
  $('q').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && shown[0]) run(shown[0]);
  });

  FB.storage.load().then((data) => {
    all = FB.storage.flatten(data);
    render();
  });
})();
