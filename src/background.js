importScripts('engine/parser.js', 'engine/thaiid.js', 'engine/recording.js', 'shared/defaults.js', 'shared/storage.js', 'shared/tabs.js');

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  if (reason !== 'install') return;
  const FB = globalThis.FastBlaze;
  const got = await chrome.storage.local.get(FB.storage.KEY);
  if (!got[FB.storage.KEY]) await FB.storage.save(FB.DEFAULT_DATA);
  chrome.runtime.openOptionsPage();
});

chrome.commands.onCommand.addListener((command) => {
  if (command === 'pick-element') {
    globalThis.FastBlaze.tabs.sendToActiveTab({ type: 'fastblaze:pick' }).catch((err) => console.warn('[FastBlaze] pick:', err));
  }
});

// ---------------------------------------------------------------------------
// "Select from website" (Manage page): the picker follows the user across tabs.
// State lives in storage.session because the service worker can be suspended.
// { fromTabId, since, currentTabId }
// ---------------------------------------------------------------------------
const PICK_STATE = 'fastblaze.pickState';
const LAST_PICK_KEY = 'fastblaze.lastPick';

async function getPickState() {
  return (await chrome.storage.session.get(PICK_STATE))[PICK_STATE] || null;
}

async function setPickState(state) {
  if (state) await chrome.storage.session.set({ [PICK_STATE]: state });
  else await chrome.storage.session.remove(PICK_STATE);
}

async function sendToTop(tabId, msg) {
  try {
    return await chrome.tabs.sendMessage(tabId, msg, { frameId: 0 });
  } catch {
    const files = chrome.runtime.getManifest().content_scripts[0].js;
    await chrome.scripting.executeScript({ target: { tabId, allFrames: true }, files });
    return chrome.tabs.sendMessage(tabId, msg, { frameId: 0 });
  }
}

const stopPickerIn = (tabId) => chrome.tabs.sendMessage(tabId, { type: 'fastblaze:pick-stop' }, { frameId: 0 }).catch(() => {});

/** Move the picker to `tabId` (no-op when it is already there or is the Manage page). */
async function followTo(tabId, force) {
  const s = await getPickState();
  if (!s || (!force && s.currentTabId === tabId)) return;
  if (s.currentTabId && s.currentTabId !== tabId) stopPickerIn(s.currentTabId);
  if (tabId === s.fromTabId) {
    await setPickState({ ...s, currentTabId: null });
    return;
  }
  await setPickState({ ...s, currentTabId: tabId });
  try {
    await sendToTop(tabId, { type: 'fastblaze:pick', returnTo: true });
  } catch (err) {
    // chrome:// pages, the Web Store, etc. cannot be scripted: wait for another tab.
    console.warn('[FastBlaze] picker could not start in tab', tabId, err && err.message);
    const now = await getPickState();
    if (now && now.currentTabId === tabId) await setPickState({ ...now, currentTabId: null });
  }
}

async function startPickSession(fromTabId) {
  const old = await getPickState();
  if (old && old.currentTabId) stopPickerIn(old.currentTabId);
  await setPickState({ fromTabId, since: Date.now(), currentTabId: null });
  const tabs = (await chrome.tabs.query({}))
    .filter((t) => t.id !== fromTabId)
    .sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0));
  const target = tabs[0];
  if (!target) return { ok: false, error: 'No other tab is open' };
  await chrome.tabs.update(target.id, { active: true });
  await chrome.windows.update(target.windowId, { focused: true });
  await followTo(target.id);
  return { ok: true };
}

async function cancelPickSession() {
  const s = await getPickState();
  if (s && s.currentTabId) stopPickerIn(s.currentTabId);
  await setPickState(null);
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg) return;
  if (msg.type === 'fastblaze:pick-start') {
    const from = msg.fromTabId ?? (sender.tab && sender.tab.id);
    startPickSession(from).then(sendResponse, (err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }
  if (msg.type === 'fastblaze:pick-cancel') {
    cancelPickSession().then(() => sendResponse({ ok: true }));
    return true;
  }
});

chrome.tabs.onActivated.addListener(({ tabId }) => { followTo(tabId); });

chrome.windows.onFocusChanged.addListener(async (windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) return;
  const [tab] = await chrome.tabs.query({ active: true, windowId });
  if (tab) followTo(tab.id);
});

// Page reloaded / navigated while picking: start the picker again on the new page.
chrome.tabs.onUpdated.addListener(async (tabId, info) => {
  if (info.status !== 'complete') return;
  const s = await getPickState();
  if (s && s.currentTabId === tabId) followTo(tabId, true);
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  const s = await getPickState();
  if (s && s.fromTabId === tabId) cancelPickSession();
});

// An element was picked: end the session and bring the Manage page back.
chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area !== 'local' || !changes[LAST_PICK_KEY]) return;
  const s = await getPickState();
  const p = changes[LAST_PICK_KEY].newValue;
  if (!s || !p || p.at < s.since) return;
  await setPickState(null);
  try {
    const from = await chrome.tabs.get(s.fromTabId);
    await chrome.tabs.update(from.id, { active: true });
    await chrome.windows.update(from.windowId, { focused: true });
  } catch { /* Manage page was closed */ }
});

// ---------------------------------------------------------------------------
// Record mode. Steps are kept here so recording survives navigation / reloads.
// { tabId, fromTabId (Manage page or null), steps: [], since, locked }
// While nothing is recorded yet (locked=false) and it was started from the
// Manage page, recording follows the tab the user switches to.
// ---------------------------------------------------------------------------
const REC_STATE = 'fastblaze.recState';
const LAST_RECORDING_KEY = 'fastblaze.lastRecording';

async function getRec() {
  return (await chrome.storage.session.get(REC_STATE))[REC_STATE] || null;
}

async function setRec(state) {
  if (state) await chrome.storage.session.set({ [REC_STATE]: state });
  else await chrome.storage.session.remove(REC_STATE);
}

const endRecIn = (tabId) => chrome.tabs.sendMessage(tabId, { type: 'fastblaze:rec-end' }, { frameId: 0 }).catch(() => {});

async function beginRecIn(tabId, count) {
  try {
    await sendToTop(tabId, { type: 'fastblaze:rec-begin', count });
    return true;
  } catch (err) {
    console.warn('[FastBlaze] recording could not start in tab', tabId, err && err.message);
    return false;
  }
}

async function startRecording({ tabId, fromTabId }) {
  const old = await getRec();
  if (old && old.tabId) endRecIn(old.tabId);
  let target = tabId;
  if (!target) {
    const tabs = (await chrome.tabs.query({}))
      .filter((t) => t.id !== fromTabId)
      .sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0));
    if (!tabs[0]) return { ok: false, error: 'No other tab is open' };
    target = tabs[0].id;
    await chrome.tabs.update(target, { active: true });
    await chrome.windows.update(tabs[0].windowId, { focused: true });
  }
  await setRec({ tabId: target, fromTabId: fromTabId ?? null, steps: [], since: Date.now(), locked: false });
  const ok = await beginRecIn(target, 0);
  if (!ok && !fromTabId) {
    await setRec(null);
    return { ok: false, error: 'This page cannot be recorded' };
  }
  return { ok: true };
}

async function followRecording(tabId) {
  const s = await getRec();
  if (!s || s.locked || !s.fromTabId || s.tabId === tabId || tabId === s.fromTabId) return;
  if (s.tabId) endRecIn(s.tabId);
  await setRec({ ...s, tabId });
  await beginRecIn(tabId, 0);
}

async function saveRecordedSnippet(template, host) {
  const FB = globalThis.FastBlaze;
  const data = await FB.storage.load();
  let folder = data.folders.find((f) => f.name === 'Recorded');
  if (!folder) {
    folder = { id: FB.storage.uid(), name: 'Recorded', snippets: [] };
    data.folders.push(folder);
  }
  const time = new Date().toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' });
  const snippet = { id: FB.storage.uid(), name: `Recorded – ${host || 'page'} ${time}`, shortcut: '', text: template };
  folder.snippets.push(snippet);
  await FB.storage.save(data);
  return snippet.id;
}

async function stopRecording(msg, sender) {
  const s = await getRec();
  if (!s || (sender.tab && sender.tab.id !== s.tabId)) return { ok: false, error: 'Not recording here' };
  await setRec(null);
  if (!msg.save) return { ok: true, count: 0 };
  if (!s.steps.length) return { ok: false, error: 'no steps recorded' };
  const template = globalThis.FastBlaze.recording.buildRecordedTemplate(s.steps, { convert: msg.convert !== false });
  if (s.fromTabId) {
    await chrome.storage.local.set({ [LAST_RECORDING_KEY]: { template, at: Date.now(), count: s.steps.length } });
    try {
      const from = await chrome.tabs.get(s.fromTabId);
      await chrome.tabs.update(from.id, { active: true });
      await chrome.windows.update(from.windowId, { focused: true });
    } catch { /* Manage page closed: the result stays in storage */ }
  } else {
    const id = await saveRecordedSnippet(template, msg.host);
    await chrome.tabs.create({ url: chrome.runtime.getURL(`src/options/options.html#snippet=${id}`), openerTabId: s.tabId });
  }
  return { ok: true, count: s.steps.length };
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg) return;
  const reply = (p) => { p.then(sendResponse, (err) => sendResponse({ ok: false, error: err.message })); return true; };
  switch (msg.type) {
    case 'fastblaze:rec-start':
      return reply(startRecording({ tabId: msg.tabId, fromTabId: msg.fromTabId }));
    case 'fastblaze:rec-status':
      return reply(getRec().then((s) => ({ recording: !!(s && sender.tab && s.tabId === sender.tab.id), count: s ? s.steps.length : 0 })));
    case 'fastblaze:rec-step':
      return reply((async () => {
        const s = await getRec();
        if (!s || !sender.tab || s.tabId !== sender.tab.id) return { ok: false };
        s.steps.push(msg.step);
        s.locked = true;
        await setRec(s);
        return { ok: true, count: s.steps.length };
      })());
    case 'fastblaze:rec-stop':
      return reply(stopRecording(msg, sender));
    case 'fastblaze:rec-cancel':
      return reply((async () => { const s = await getRec(); if (s && s.tabId) endRecIn(s.tabId); await setRec(null); return { ok: true }; })());
    default:
  }
});

chrome.tabs.onActivated.addListener(({ tabId }) => { followRecording(tabId); });
chrome.tabs.onRemoved.addListener(async (tabId) => {
  const s = await getRec();
  if (s && (s.tabId === tabId || s.fromTabId === tabId)) await setRec(null);
});
