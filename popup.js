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
  const { allowed } = await chrome.runtime.sendMessage({ type: 'get_allowed' });
  const section = document.getElementById('unlockSection');
  const list = document.getElementById('unlockList');
  list.innerHTML = '';

  const active = Object.entries(allowed || {}).filter(([, exp]) => exp > Date.now());
  section.style.display = active.length ? 'block' : 'none';

  for (const [site, exp] of active) {
    const row = document.createElement('div');
    row.className = 'unlock-row';
    row.innerHTML = `
      <span class="unlock-site">${site}</span>
      <span class="unlock-time">${fmtTimeLeft(exp)}</span>
      <button class="relock-btn" data-site="${site}">Re-lock</button>
    `;
    list.appendChild(row);
  }

  list.querySelectorAll('.relock-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      await chrome.runtime.sendMessage({ type: 'relock', site: btn.dataset.site });
      loadUnlocks();
    });
  });
}

async function load() {
  const { sites } = await chrome.runtime.sendMessage({ type: 'get_sites' });
  document.getElementById('sites').value = (sites || []).join('\n');
  await loadUnlocks();
}

document.getElementById('saveSites').addEventListener('click', async () => {
  const raw = document.getElementById('sites').value;
  const sites = raw.split('\n').map(s => s.trim().toLowerCase()).filter(Boolean);
  const res = await chrome.runtime.sendMessage({ type: 'set_sites', sites });
  setMsg('sitesMsg', res.ok ? 'Saved!' : 'Error saving.', res.ok);
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

  const res = await chrome.runtime.sendMessage({ type: 'set_pw', oldPw, newPw });
  setMsg('pwMsg', res.ok ? 'Password changed!' : 'Wrong current password.', res.ok);
  if (res.ok) {
    document.getElementById('oldPw').value = '';
    document.getElementById('newPw').value = '';
  }
});

load();
