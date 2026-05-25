# FocusLock

A free Chrome extension that blocks distracting sites and lets you through if you enter a password — no paywall, no subscription.

Blocks **Reddit, X (Twitter), and Instagram** by default. Correct password grants 4-hour access to that site. You can add or remove any site from the popup.

---

## Install (Load Unpacked)

Until this is on the Chrome Web Store, install it as an unpacked extension:

1. Download or clone this repo to your computer
2. Open Chrome → go to `chrome://extensions`
3. Enable **Developer mode** (toggle, top-right)
4. Click **Load unpacked** → select the `focuslock-extension` folder
5. Done — the 🔒 icon appears in your toolbar

**Default password:** `focuslock`  
Change it immediately via the popup.

---

## Usage

- **Visiting a blocked site** → you see the blocked page; enter your password to unlock for 4 hours
- **Popup (click 🔒 icon)** → edit the blocked sites list (one domain per line), or change your password
- **Unlocks are per-site** — unlocking Reddit doesn't unlock Instagram
- **Subdomains are blocked automatically** — `old.reddit.com`, `www.instagram.com`, etc. are all covered

---

## Blocked sites format

In the popup, enter one domain per line:

```
reddit.com
x.com
instagram.com
youtube.com
```

No `https://` or `www.` needed.

---

## How it works

Built with Chrome's Manifest V3 APIs:

- `declarativeNetRequest` — redirects blocked URLs to the extension's blocked page before the page loads (no flash of content)
- `storage` — stores the blocked list and a SHA-256 hash of your password (never the password itself)
- Temporary unlocks are tracked with an expiry timestamp; expired unlocks are cleaned up automatically

---

## Privacy

Everything stays on your device. No data is sent anywhere. The password is stored as a SHA-256 hash in Chrome's local extension storage.

---

## License

MIT
