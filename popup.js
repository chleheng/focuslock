const api = typeof browser !== 'undefined' ? browser : chrome;

function sendMessage(message) {
  if (typeof browser !== 'undefined') return api.runtime.sendMessage(message);

  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, result => {
      const err = chrome.runtime.lastError;
      if (err) reject(new Error(err.message));
      else resolve(result);
    });
  });
}

function setMsg(id, text, ok) {
  const el = document.getElementById(id);
  el.textContent = text;
  el.className = 'msg ' + (ok ? 'ok' : 'fail');
}

function fmtTimeLeft(exp) {
  const ms = exp - Date.now();
  if (ms <= 0) return 'expired';
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return h > 0 ? `${h}h ${m}m left` : `${m}m left`;
}

async function loadUnlocks() {
  const { allowed } = await sendMessage({ type: 'get_allowed' });
  const section = document.getElementById('unlockSection');
  const list = document.getElementById('unlockList');
  list.innerHTML = '';

  const active = Object.entries(allowed || {}).filter(([, exp]) => exp > Date.now());
  section.style.display = active.length ? 'block' : 'none';

  for (const [site, exp] of active) {
    const row = document.createElement('div');
    row.className = 'unlock-row';

    const siteEl = document.createElement('span');
    siteEl.className = 'unlock-site';
    siteEl.textContent = site;

    const timeEl = document.createElement('span');
    timeEl.className = 'unlock-time';
    timeEl.textContent = fmtTimeLeft(exp);

    const relockBtn = document.createElement('button');
    relockBtn.className = 'relock-btn';
    relockBtn.dataset.site = site;
    relockBtn.textContent = 'Re-lock';

    row.append(siteEl, timeEl, relockBtn);
    list.appendChild(row);
  }

  list.querySelectorAll('.relock-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      await sendMessage({ type: 'relock', site: btn.dataset.site });
      loadUnlocks();
    });
  });
}

function parseDomains(id) {
  return document.getElementById(id).value
    .split('\n')
    .map(s => s.trim().toLowerCase())
    .filter(Boolean);
}

function historyResultMessage(res, prefix) {
  if (!res.available) return `${prefix} History cleanup is not supported in this browser.`;
  const noun = res.deleted === 1 ? 'URL' : 'URLs';
  return `${prefix} Removed ${res.deleted || 0} matching ${noun}.`;
}

async function load() {
  const { sites, seriousSites, hiddenHistorySites, historyAvailable } = await sendMessage({ type: 'get_sites' });
  document.getElementById('sites').value = (sites || []).join('\n');
  document.getElementById('seriousSites').value = (seriousSites || []).join('\n');
  document.getElementById('hiddenHistorySites').value = (hiddenHistorySites || []).join('\n');

  if (!historyAvailable) {
    document.getElementById('hiddenHistorySites').disabled = true;
    document.getElementById('saveHiddenHistory').disabled = true;
    document.getElementById('cleanHistory').disabled = true;
    setMsg('historyMsg', 'History cleanup is not supported in this browser.', false);
  }

  await loadUnlocks();
}

document.getElementById('saveSites').addEventListener('click', async () => {
  const sites = parseDomains('sites');
  const seriousSites = parseDomains('seriousSites');
  const res = await sendMessage({ type: 'set_sites', sites, seriousSites });
  setMsg('sitesMsg', res.ok ? 'Saved!' : 'Error saving.', res.ok);
});

document.getElementById('saveHiddenHistory').addEventListener('click', async () => {
  const hiddenHistorySites = parseDomains('hiddenHistorySites');
  const res = await sendMessage({ type: 'set_hidden_history_sites', hiddenHistorySites });
  setMsg('historyMsg', res.ok ? historyResultMessage(res, 'Saved.') : 'Error saving.', res.ok && res.available);
});

document.getElementById('cleanHistory').addEventListener('click', async () => {
  const res = await sendMessage({ type: 'scrub_history_now' });
  setMsg('historyMsg', res.ok ? historyResultMessage(res, 'Cleaned now.') : 'Error cleaning history.', res.ok && res.available);
});

document.getElementById('savePw').addEventListener('click', async () => {
  const oldPw = document.getElementById('oldPw').value;
  const newPw = document.getElementById('newPw').value;

  if (!oldPw || !newPw) {
    setMsg('pwMsg', 'Fill in both fields.', false);
    return;
  }
  if (newPw.length < 4) {
    setMsg('pwMsg', 'Password must be at least 4 characters.', false);
    return;
  }

  const res = await sendMessage({ type: 'set_pw', oldPw, newPw });
  setMsg('pwMsg', res.ok ? 'Password changed!' : 'Wrong current password.', res.ok);
  if (res.ok) {
    document.getElementById('oldPw').value = '';
    document.getElementById('newPw').value = '';
  }
});

load();
