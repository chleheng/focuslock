const BLOCKED_PAGE = chrome.runtime.getURL('blocked.html');

async function sha256(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf), b => b.toString(16).padStart(2, '0')).join('');
}

async function updateRules() {
  const data = await chrome.storage.local.get(['sites', 'seriousSites', 'allowed']);
  const sites = data.sites || [];
  const seriousSites = data.seriousSites || [];
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

  // Regular blocks — all subdomains caught
  const regularRules = sites
    .filter(s => !allowed[s] || allowed[s] < now)
    .map((site, i) => ({
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

  // Serious blocks — only www + naked domain (subdomains like old.reddit.com pass through)
  const seriousRules = seriousSites
    .filter(s => !allowed[s] || allowed[s] < now)
    .map((site, i) => ({
      id: i + 1001,
      priority: 2, // higher priority than regular rules
      action: {
        type: 'redirect',
        redirect: { regexSubstitution: BLOCKED_PAGE + '?s=1#\\0' }
      },
      condition: {
        regexFilter: `^https?://(www\\.)?${site.replace(/\./g, '\\.')}(/.*)?$`,
        resourceTypes: ['main_frame'],
        isUrlFilterCaseSensitive: false
      }
    }));

  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds,
    addRules: [...regularRules, ...seriousRules]
  });
}

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  const data = await chrome.storage.local.get(['sites', 'pwHash', 'seriousSites']);

  if (!data.sites) {
    // Fresh install
    await chrome.storage.local.set({
      sites: ['x.com', 'instagram.com'],
      seriousSites: ['reddit.com'],
      pwHash: await sha256('focuslock'),
      allowed: {}
    });
  } else if (!data.seriousSites) {
    // Existing install — migrate reddit.com to serious blocks
    const newSites = (data.sites || []).filter(s => s !== 'reddit.com');
    await chrome.storage.local.set({
      seriousSites: ['reddit.com'],
      sites: newSites
    });
  }

  await updateRules();
});

// Re-apply rules when service worker restarts to handle allowed expiry
chrome.runtime.onStartup.addListener(updateRules);

// Backup for service-worker-served navigations that bypass declarativeNetRequest
// (e.g. x.com / Twitter PWA serves pages from its own SW cache)
chrome.webNavigation.onBeforeNavigate.addListener(async (details) => {
  if (details.frameId !== 0) return;
  const { url, tabId } = details;
  if (!url.startsWith('http://') && !url.startsWith('https://')) return;

  const data = await chrome.storage.local.get(['sites', 'seriousSites', 'allowed']);
  const sites = data.sites || [];
  const seriousSites = data.seriousSites || [];
  const allowed = data.allowed || {};
  const now = Date.now();
  const hostname = new URL(url).hostname.replace(/^www\./, '');

  const regularMatch = sites.find(
    s => (hostname === s || hostname.endsWith('.' + s)) && (!allowed[s] || allowed[s] < now)
  );
  const seriousMatch = seriousSites.find(
    s => hostname === s && (!allowed[s] || allowed[s] < now)
  );

  if (regularMatch || seriousMatch) {
    chrome.tabs.update(tabId, {
      url: BLOCKED_PAGE + (seriousMatch ? '?s=1' : '') + '#' + url
    });
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    const data = await chrome.storage.local.get(['sites', 'seriousSites', 'pwHash', 'allowed']);
    const sites = data.sites || [];
    const seriousSites = data.seriousSites || [];
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
        sendResponse({ sites, seriousSites });
        break;
      case 'get_allowed': {
        const now2 = Date.now();
        const active = Object.fromEntries(
          Object.entries(allowed).filter(([, exp]) => exp > now2)
        );
        sendResponse({ allowed: active });
        break;
      }
      case 'relock':
        delete allowed[msg.site];
        await chrome.storage.local.set({ allowed });
        await updateRules();
        sendResponse({ ok: true });
        break;
      case 'set_sites':
        await chrome.storage.local.set({ sites: msg.sites, seriousSites: msg.seriousSites });
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
  return true;
});
