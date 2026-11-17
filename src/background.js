importScripts('shared/defaults.js', 'shared/storage.js', 'shared/tabs.js');

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
