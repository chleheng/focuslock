const BLOCKED_PAGE = chrome.runtime.getURL('blocked.html');

async function sha256(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf), b => b.toString(16).padStart(2, '0')).join('');
}

async function updateRules() {
  const data = await chrome.storage.local.get(['sites', 'allowed']);
  const sites = data.sites || [];
  const allowed = data.allowed || {};
  const now = Date.now();

  // Clean expired temporary unlocks
  let dirty = false;
  for (const site in allowed) {
    if (allowed[site] < now) { delete allowed[site]; dirty = true; }
  }
  if (dirty) await chrome.storage.local.set({ allowed });

  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  const removeRuleIds = existing.map(r => r.id);

  const toBlock = sites.filter(s => !allowed[s] || allowed[s] < now);

  const addRules = toBlock.map((site, i) => ({
    id: i + 1,
    priority: 1,
    action: {
      type: 'redirect',
      redirect: { regexSubstitution: BLOCKED_PAGE + '#\\0' }
    },
    condition: {
      regexFilter: `^https?://([^/]+\\.)?${site.replace(/\./g, '\\.')}(/.*)?$`,
      resourceTypes: ['main_frame'],
      isUrlFilterCaseSensitive: false
    }
  }));

  await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds, addRules });
}

chrome.runtime.onInstalled.addListener(async () => {
  const data = await chrome.storage.local.get(['sites', 'pwHash']);
  if (!data.sites) {
    await chrome.storage.local.set({
      sites: ['reddit.com', 'x.com', 'instagram.com'],
      pwHash: await sha256('focuslock'),
      allowed: {}
    });
  }
  await updateRules();
});

// Re-apply rules when service worker restarts (rules persist, but handle allowed expiry)
chrome.runtime.onStartup.addListener(updateRules);

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    const data = await chrome.storage.local.get(['sites', 'pwHash', 'allowed']);
    const sites = data.sites || [];
    const pwHash = data.pwHash || '';
    const allowed = data.allowed || {};

    switch (msg.type) {
      case 'unlock': {
        const h = await sha256(msg.pw);
        if (h !== pwHash) { sendResponse({ ok: false }); return; }
        allowed[msg.site] = Date.now() + 4 * 60 * 60 * 1000; // 4 hours
        await chrome.storage.local.set({ allowed });
        await updateRules();
        sendResponse({ ok: true });
        break;
      }
      case 'get_sites':
        sendResponse({ sites });
        break;
      case 'set_sites':
        await chrome.storage.local.set({ sites: msg.sites });
        await updateRules();
        sendResponse({ ok: true });
        break;
      case 'set_pw': {
        const oldH = await sha256(msg.oldPw);
        if (oldH !== pwHash) { sendResponse({ ok: false }); return; }
        await chrome.storage.local.set({ pwHash: await sha256(msg.newPw) });
        sendResponse({ ok: true });
        break;
      }
    }
  })();
  return true; // keep message channel open for async response
});
