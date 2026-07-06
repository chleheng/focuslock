const api = typeof browser !== 'undefined' ? browser : chrome;
const IS_FIREFOX = typeof browser !== 'undefined';
const USE_DNR = !IS_FIREFOX && !!api.declarativeNetRequest?.updateDynamicRules;
const BLOCKED_PAGE = api.runtime.getURL('blocked.html');

const DEFAULT_SITES = ['x.com', 'twitter.com', 'instagram.com', 'youtube.com'];
const DEFAULT_SERIOUS_SITES = ['reddit.com'];
const DEFAULT_HIDDEN_HISTORY_SITES = ['okcupid.com', 'bumble.com'];
const DEFAULT_PASSWORD = 'focuslock';
const DEFAULTS_VERSION = 2;
const SETTINGS_KEYS = ['sites', 'seriousSites', 'hiddenHistorySites', 'allowed', 'pwHash', 'defaultsVersion'];
const HISTORY_SEARCH_BATCH = 1000;
const HISTORY_SWEEP_PASSES = 20;
const SITE_ALIAS_GROUPS = [['x.com', 'twitter.com']];

async function sha256(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf), b => b.toString(16).padStart(2, '0')).join('');
}

function callbackApi(invoker) {
  return new Promise((resolve, reject) => {
    invoker((result) => {
      const err = api.runtime.lastError;
      if (err) reject(new Error(err.message));
      else resolve(result);
    });
  });
}

function storageGet(keys) {
  if (IS_FIREFOX) return api.storage.local.get(keys);
  return callbackApi(callback => api.storage.local.get(keys, callback));
}

function storageSet(items) {
  if (IS_FIREFOX) return api.storage.local.set(items);
  return callbackApi(callback => api.storage.local.set(items, callback));
}

function getDynamicRules() {
  if (IS_FIREFOX) return api.declarativeNetRequest.getDynamicRules();
  return callbackApi(callback => api.declarativeNetRequest.getDynamicRules(callback));
}

function updateDynamicRules(options) {
  if (IS_FIREFOX) return api.declarativeNetRequest.updateDynamicRules(options);
  return callbackApi(callback => api.declarativeNetRequest.updateDynamicRules(options, callback));
}

function historySearch(query) {
  if (!api.history?.search) return Promise.resolve([]);
  if (IS_FIREFOX) return api.history.search(query);
  return callbackApi(callback => api.history.search(query, callback));
}

function historyDeleteUrl(url) {
  if (!api.history?.deleteUrl) return Promise.resolve();
  if (IS_FIREFOX) return api.history.deleteUrl({ url });
  return callbackApi(callback => api.history.deleteUrl({ url }, callback));
}

function tabsUpdate(tabId, updateProperties) {
  if (IS_FIREFOX) return api.tabs.update(tabId, updateProperties);
  return callbackApi(callback => api.tabs.update(tabId, updateProperties, callback));
}

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeSite(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return '';

  let host = raw;
  try {
    host = new URL(raw.includes('://') ? raw : `https://${raw}`).hostname;
  } catch {
    host = raw.split('/')[0];
  }

  host = host.replace(/^www\./, '').replace(/\.$/, '');
  if (!/^[a-z0-9.-]+$/.test(host) || !host.includes('.') || host.includes('..')) return '';
  return host;
}

function normalizeSites(sites) {
  const seen = new Set();
  const result = [];

  for (const site of Array.isArray(sites) ? sites : []) {
    const normalized = normalizeSite(site);
    if (normalized && !seen.has(normalized)) {
      seen.add(normalized);
      result.push(normalized);
    }
  }

  return result;
}

function mergeSites(...siteLists) {
  return normalizeSites(siteLists.flat());
}

function linkedSitesFor(site) {
  const normalized = normalizeSite(site);
  const aliasGroup = SITE_ALIAS_GROUPS.find(group => group.includes(normalized));
  return aliasGroup || (normalized ? [normalized] : []);
}

function expandLinkedSites(sites) {
  const expanded = [];
  for (const site of normalizeSites(sites)) {
    expanded.push(...linkedSitesFor(site));
  }
  return normalizeSites(expanded);
}

function getEffectiveBlockSites(settings) {
  const seriousSites = expandLinkedSites(settings.seriousSites || []);
  const seriousSet = new Set(seriousSites);
  const sites = expandLinkedSites(settings.sites || []).filter(site => !seriousSet.has(site));
  return { sites, seriousSites };
}

function hostnameFromUrl(url) {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

function isHttpUrl(url) {
  return typeof url === 'string' && /^https?:\/\//i.test(url);
}

function siteIsTemporarilyAllowed(site, allowed, now = Date.now()) {
  return linkedSitesFor(site).some(linkedSite => allowed?.[linkedSite] && allowed[linkedSite] >= now);
}

function regularSiteMatches(hostname, site) {
  return hostname === site || hostname.endsWith('.' + site);
}

function seriousSiteMatches(hostname, site) {
  return hostname === site;
}

function hiddenHistorySiteMatches(url, hiddenHistorySites) {
  if (!isHttpUrl(url)) return false;
  const hostname = hostnameFromUrl(url);
  return hiddenHistorySites.some(site => regularSiteMatches(hostname, site));
}

function getBlockForUrl(url, settings) {
  if (!isHttpUrl(url)) return null;

  const hostname = hostnameFromUrl(url);
  const now = Date.now();
  const allowed = settings.allowed || {};
  const { sites, seriousSites } = getEffectiveBlockSites(settings);

  const regularSite = sites.find(
    site => regularSiteMatches(hostname, site) && !siteIsTemporarilyAllowed(site, allowed, now)
  );
  if (regularSite) return { site: regularSite, serious: false };

  const seriousSite = seriousSites.find(
    site => seriousSiteMatches(hostname, site) && !siteIsTemporarilyAllowed(site, allowed, now)
  );
  if (seriousSite) return { site: seriousSite, serious: true };

  return null;
}

function blockedUrl(originalUrl, block) {
  const params = new URLSearchParams();
  if (block.serious) params.set('s', '1');
  params.set('site', block.site);
  return BLOCKED_PAGE + '?' + params.toString() + '#' + originalUrl;
}

function redditRedirectUrl(url) {
  if (!isHttpUrl(url)) return '';

  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase().replace(/^www\./, '');
    if (hostname !== 'reddit.com') return '';
    return `https://old.reddit.com${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return '';
  }
}

async function getSettings() {
  const data = await storageGet(SETTINGS_KEYS);
  return {
    sites: normalizeSites(data.sites || []),
    seriousSites: normalizeSites(data.seriousSites || []),
    hiddenHistorySites: normalizeSites(data.hiddenHistorySites || []),
    allowed: data.allowed || {},
    pwHash: data.pwHash || '',
    defaultsVersion: Number(data.defaultsVersion) || 0
  };
}

let settingsCache = {
  sites: [],
  seriousSites: [],
  hiddenHistorySites: [],
  allowed: {},
  pwHash: '',
  defaultsVersion: 0
};

async function refreshSettingsCache() {
  settingsCache = await getSettings();
  return settingsCache;
}

let settingsReady = refreshSettingsCache();

async function ensureDefaults() {
  const data = await storageGet(SETTINGS_KEYS);
  const updates = {};

  if (!Array.isArray(data.sites)) {
    updates.sites = DEFAULT_SITES;
  }

  if (!Array.isArray(data.seriousSites)) {
    updates.seriousSites = DEFAULT_SERIOUS_SITES;
    if (Array.isArray(data.sites)) {
      updates.sites = normalizeSites(data.sites).filter(site => site !== 'reddit.com');
    }
  }

  if (!Array.isArray(data.hiddenHistorySites)) {
    updates.hiddenHistorySites = DEFAULT_HIDDEN_HISTORY_SITES;
  }

  if (!data.pwHash) {
    updates.pwHash = await sha256(DEFAULT_PASSWORD);
  }

  if (!data.allowed) {
    updates.allowed = {};
  }

  const defaultsVersion = Number(data.defaultsVersion) || 0;
  if (defaultsVersion < DEFAULTS_VERSION) {
    const currentSites = Array.isArray(updates.sites) ? updates.sites : normalizeSites(data.sites || []);
    const currentSeriousSites = Array.isArray(updates.seriousSites)
      ? updates.seriousSites
      : normalizeSites(data.seriousSites || []);

    updates.seriousSites = mergeSites(currentSeriousSites, DEFAULT_SERIOUS_SITES);
    updates.sites = mergeSites(currentSites, DEFAULT_SITES)
      .filter(site => !updates.seriousSites.includes(site));
    updates.defaultsVersion = DEFAULTS_VERSION;
  }

  if (Object.keys(updates).length) {
    await storageSet(updates);
  }

  settingsReady = refreshSettingsCache();
  return settingsReady;
}

async function updateRules() {
  if (!USE_DNR) return;

  const data = await getSettings();
  const { sites, seriousSites } = getEffectiveBlockSites(data);
  const allowed = data.allowed || {};
  const now = Date.now();

  // Clean expired temporary unlocks
  let dirty = false;
  for (const site in allowed) {
    if (allowed[site] < now) { delete allowed[site]; dirty = true; }
  }
  if (dirty) await storageSet({ allowed });

  const existing = await getDynamicRules();
  const removeRuleIds = existing.map(r => r.id);

  const redditRedirectRules = [{
    id: 9001,
    priority: 10,
    action: {
      type: 'redirect',
      redirect: { regexSubstitution: 'https://old.reddit.com\\2' }
    },
    condition: {
      regexFilter: '^https?://(www\\.)?reddit\\.com(/.*)?$',
      resourceTypes: ['main_frame'],
      isUrlFilterCaseSensitive: false
    }
  }];

  // Regular blocks: all subdomains caught.
  const regularRules = sites
    .filter(s => !siteIsTemporarilyAllowed(s, allowed, now))
    .map((site, i) => ({
      id: i + 1,
      priority: 1,
      action: {
        type: 'redirect',
        redirect: { regexSubstitution: `${BLOCKED_PAGE}?site=${encodeURIComponent(site)}#\\0` }
      },
      condition: {
        regexFilter: `^https?://([^/]+\\.)?${escapeRegExp(site)}(/.*)?$`,
        resourceTypes: ['main_frame'],
        isUrlFilterCaseSensitive: false
      }
    }));

  // Serious blocks: only www + naked domain. Subdomains like old.reddit.com pass through.
  const seriousRules = seriousSites
    .filter(s => !siteIsTemporarilyAllowed(s, allowed, now))
    .map((site, i) => ({
      id: i + 1001,
      priority: 2, // higher priority than regular rules
      action: {
        type: 'redirect',
        redirect: { regexSubstitution: `${BLOCKED_PAGE}?s=1&site=${encodeURIComponent(site)}#\\0` }
      },
      condition: {
        regexFilter: `^https?://(www\\.)?${escapeRegExp(site)}(/.*)?$`,
        resourceTypes: ['main_frame'],
        isUrlFilterCaseSensitive: false
      }
    }));

  await updateDynamicRules({
    removeRuleIds,
    addRules: [...redditRedirectRules, ...regularRules, ...seriousRules]
  });

  settingsReady = refreshSettingsCache();
}

async function scrubHiddenHistoryUrl(url, hiddenHistorySites) {
  if (!api.history?.deleteUrl) return false;

  const sites = hiddenHistorySites || (await getSettings()).hiddenHistorySites;
  if (!hiddenHistorySiteMatches(url, sites)) return false;

  await historyDeleteUrl(url);
  return true;
}

function queueHiddenHistoryCleanup(url) {
  if (!isHttpUrl(url) || !api.history?.deleteUrl) return;

  scrubHiddenHistoryUrl(url).catch(() => {});

  // A short delayed retry catches browsers that write the visit just after navigation starts.
  setTimeout(() => {
    scrubHiddenHistoryUrl(url).catch(() => {});
  }, 1500);
}

async function scrubHiddenHistorySites(hiddenHistorySites) {
  if (!api.history?.search || !api.history?.deleteUrl) {
    return { deleted: 0, available: false };
  }

  const sites = normalizeSites(hiddenHistorySites);
  const deletedUrls = new Set();

  for (const site of sites) {
    for (let pass = 0; pass < HISTORY_SWEEP_PASSES; pass += 1) {
      const results = await historySearch({
        text: site,
        startTime: 0,
        maxResults: HISTORY_SEARCH_BATCH
      });
      const urls = [...new Set(
        results
          .map(item => item.url)
          .filter(url => url && !deletedUrls.has(url) && hiddenHistorySiteMatches(url, [site]))
      )];

      if (!urls.length) break;

      for (const url of urls) {
        await historyDeleteUrl(url);
        deletedUrls.add(url);
      }

      if (results.length < HISTORY_SEARCH_BATCH) break;
    }
  }

  return { deleted: deletedUrls.size, available: true };
}

async function scrubHiddenHistorySitesFromStorage() {
  const settings = await getSettings();
  return scrubHiddenHistorySites(settings.hiddenHistorySites);
}

api.runtime.onInstalled.addListener(async () => {
  await ensureDefaults();
  await updateRules();
  await scrubHiddenHistorySitesFromStorage();
});

// Re-apply rules when the browser starts to handle allowed expiry.
api.runtime.onStartup.addListener(async () => {
  settingsReady = refreshSettingsCache();
  await updateRules();
  await scrubHiddenHistorySitesFromStorage();
});

if (api.storage?.onChanged) {
  api.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' && SETTINGS_KEYS.some(key => changes[key])) {
      settingsReady = refreshSettingsCache();
    }
  });
}

if (api.history?.onVisited) {
  api.history.onVisited.addListener((item) => {
    if (item.url) queueHiddenHistoryCleanup(item.url);
  });
}

if (IS_FIREFOX && api.webRequest?.onBeforeRequest) {
  api.webRequest.onBeforeRequest.addListener(
    (details) => settingsReady.then((settings) => {
      const redditUrl = redditRedirectUrl(details.url);
      if (redditUrl) return { redirectUrl: redditUrl };

      const block = getBlockForUrl(details.url, settings);
      if (!block) return {};

      queueHiddenHistoryCleanup(details.url);
      return { redirectUrl: blockedUrl(details.url, block) };
    }),
    { urls: ['<all_urls>'], types: ['main_frame'] },
    ['blocking']
  );
}

// Backup for service-worker-served navigations that bypass declarativeNetRequest
// (e.g. x.com / Twitter PWA serves pages from its own SW cache)
api.webNavigation.onBeforeNavigate.addListener(async (details) => {
  if (details.frameId !== 0) return;
  const { url, tabId } = details;
  if (!isHttpUrl(url)) return;

  queueHiddenHistoryCleanup(url);

  const redditUrl = redditRedirectUrl(url);
  if (redditUrl) {
    await tabsUpdate(tabId, { url: redditUrl });
    return;
  }

  const settings = await settingsReady;
  const block = getBlockForUrl(url, settings);

  if (block) {
    await tabsUpdate(tabId, {
      url: blockedUrl(url, block)
    });
  }
});

api.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    await settingsReady;
    const data = await getSettings();
    const sites = data.sites || [];
    const seriousSites = data.seriousSites || [];
    const hiddenHistorySites = data.hiddenHistorySites || [];
    const pwHash = data.pwHash || '';
    const allowed = data.allowed || {};

    switch (msg.type) {
      case 'unlock': {
        const h = await sha256(msg.pw);
        if (h !== pwHash) { sendResponse({ ok: false }); return; }
        const site = normalizeSite(msg.site);
        if (!site) { sendResponse({ ok: false }); return; }
        const expiresAt = Date.now() + 4 * 60 * 60 * 1000; // 4 hours
        for (const linkedSite of linkedSitesFor(site)) {
          allowed[linkedSite] = expiresAt;
        }
        await storageSet({ allowed });
        await updateRules();
        sendResponse({ ok: true });
        break;
      }
      case 'get_sites':
        sendResponse({
          sites,
          seriousSites,
          hiddenHistorySites,
          historyAvailable: !!api.history?.deleteUrl
        });
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
        for (const linkedSite of linkedSitesFor(msg.site)) {
          delete allowed[linkedSite];
        }
        await storageSet({ allowed });
        await updateRules();
        sendResponse({ ok: true });
        break;
      case 'set_sites':
        await storageSet({
          sites: normalizeSites(msg.sites),
          seriousSites: normalizeSites(msg.seriousSites)
        });
        await updateRules();
        sendResponse({ ok: true });
        break;
      case 'set_hidden_history_sites': {
        const updatedSites = normalizeSites(msg.hiddenHistorySites);
        await storageSet({ hiddenHistorySites: updatedSites });
        settingsReady = refreshSettingsCache();
        const result = await scrubHiddenHistorySites(updatedSites);
        sendResponse({ ok: true, ...result });
        break;
      }
      case 'scrub_history_now': {
        const result = await scrubHiddenHistorySites(hiddenHistorySites);
        sendResponse({ ok: true, ...result });
        break;
      }
      case 'set_pw': {
        const oldH = await sha256(msg.oldPw);
        if (oldH !== pwHash) { sendResponse({ ok: false }); return; }
        await storageSet({ pwHash: await sha256(msg.newPw) });
        sendResponse({ ok: true });
        break;
      }
      default:
        sendResponse({ ok: false, error: 'Unknown message.' });
    }
  })().catch(error => {
    sendResponse({ ok: false, error: error.message || 'Extension error.' });
  });
  return true;
});
