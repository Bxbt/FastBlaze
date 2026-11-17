importScripts('shared/defaults.js', 'shared/storage.js');

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  if (reason !== 'install') return;
  const FB = globalThis.FastBlaze;
  const got = await chrome.storage.local.get(FB.storage.KEY);
  if (!got[FB.storage.KEY]) await FB.storage.save(FB.DEFAULT_DATA);
  chrome.runtime.openOptionsPage();
});
