const api = typeof browser !== 'undefined' ? browser : chrome;
const params = new URLSearchParams(window.location.search);
const isSerious = params.get('s') === '1';
let originalUrl = window.location.hash.slice(1);
let site = 'this site';

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

const requestedSite = normalizeSite(params.get('site'));

try {
  site = requestedSite || normalizeSite(new URL(originalUrl).hostname);
} catch {
  originalUrl = '';
  if (requestedSite) site = requestedSite;
}

document.getElementById('siteName').textContent = site;

if (isSerious) {
  document.body.classList.add('serious');
  document.getElementById('icon').textContent = '⚠️';
  document.getElementById('heading').textContent = 'Are you sure?';
}

document.getElementById('backBtn').addEventListener('click', () => {
  if (history.length > 1) history.back();
  else window.close();
});

const pwInput = document.getElementById('pw');
const btn = document.getElementById('btn');
const err = document.getElementById('err');

function sendMessage(message) {
  if (typeof browser !== 'undefined') return api.runtime.sendMessage(message);

  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, result => {
      const runtimeErr = chrome.runtime.lastError;
      if (runtimeErr) reject(new Error(runtimeErr.message));
      else resolve(result);
    });
  });
}

async function tryUnlock() {
  err.textContent = '';
  btn.disabled = true;
  btn.textContent = 'Checking…';

  try {
    const res = await sendMessage({
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
