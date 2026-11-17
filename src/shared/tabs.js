// Send a message to the active tab's top frame, injecting the content scripts
// first if the tab was opened before the extension was (re)loaded.
(function () {
  'use strict';
  const FB = (globalThis.FastBlaze = globalThis.FastBlaze || {});

  async function sendToActiveTab(msg) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) throw new Error('No active tab');
    try {
      return await chrome.tabs.sendMessage(tab.id, msg, { frameId: 0 });
    } catch {
      const files = chrome.runtime.getManifest().content_scripts[0].js;
      await chrome.scripting.executeScript({ target: { tabId: tab.id, allFrames: true }, files });
      return chrome.tabs.sendMessage(tab.id, msg, { frameId: 0 });
    }
  }

  FB.tabs = { sendToActiveTab };
})();
