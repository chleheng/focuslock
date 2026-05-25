let originalUrl = window.location.hash.slice(1);
let site = 'this site';

try {
  site = new URL(originalUrl).hostname.replace(/^www\./, '');
} catch {
  originalUrl = '';
}

document.getElementById('siteName').textContent = site;

const pwInput = document.getElementById('pw');
const btn = document.getElementById('btn');
const err = document.getElementById('err');

async function tryUnlock() {
  err.textContent = '';
  btn.disabled = true;
  btn.textContent = 'Checking…';

  try {
    const res = await chrome.runtime.sendMessage({
      type: 'unlock',
      pw: pwInput.value,
      site
    });

    if (res.ok) {
      btn.textContent = 'Unlocked!';
      window.location.href = originalUrl || 'about:blank';
    } else {
      err.textContent = 'Wrong password. Try again.';
      pwInput.value = '';
      pwInput.focus();
      btn.disabled = false;
      btn.textContent = 'Unlock';
    }
  } catch {
    err.textContent = 'Extension error — try reloading.';
    btn.disabled = false;
    btn.textContent = 'Unlock';
  }
}

btn.addEventListener('click', tryUnlock);
pwInput.addEventListener('keydown', e => { if (e.key === 'Enter') tryUnlock(); });
