function setMsg(id, text, ok) {
  const el = document.getElementById(id);
  el.textContent = text;
  el.className = 'msg ' + (ok ? 'ok' : 'fail');
}

async function load() {
  const { sites } = await chrome.runtime.sendMessage({ type: 'get_sites' });
  document.getElementById('sites').value = (sites || []).join('\n');
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
