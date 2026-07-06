# FocusLock

A free browser extension that blocks distracting sites and lets you through if you enter a password — no paywall, no subscription.

Blocks **Reddit, X/Twitter, Instagram, and YouTube** by default. Correct password grants 4-hour access to that site. You can add or remove any site from the popup.

FocusLock also has a local history cleanup list. By default, it removes matching `okcupid.com` and `bumble.com` URLs from browser history as they are visited and when you click **Clean now**.

---

## Chrome Install (Load Unpacked)

Until this is on the Chrome Web Store, install it as an unpacked extension:

1. Download or clone this repo to your computer
2. Open Chrome → go to `chrome://extensions`
3. Enable **Developer mode** (toggle, top-right)
4. Click **Load unpacked** → select the `focuslock-extension` folder
5. Done — the 🔒 icon appears in your toolbar

**Default password:** `focuslock`  
Change it immediately via the popup.

---

## Firefox Android Package

Firefox for Android uses the Firefox-specific package source generated from `manifest.firefox.json`:

```bash
bash ./scripts/build-firefox.sh
npx web-ext lint --source-dir dist/firefox-src
npx web-ext build --source-dir dist/firefox-src
```

For device testing:

```bash
npx web-ext run -t firefox-android --source-dir dist/firefox-src --firefox-apk org.mozilla.firefox
```

For AMO submission, use the generated ZIP from `web-ext-artifacts/` or sign/publish with AMO credentials:

```bash
npx web-ext sign --source-dir dist/firefox-src --channel=listed --amo-metadata=amo-metadata.json --api-key=$AMO_JWT_ISSUER --api-secret=$AMO_JWT_SECRET
```

---

## Usage

- **Visiting a blocked site** → you see the blocked page; enter your password to unlock for 4 hours
- **Popup (click 🔒 icon)** → edit the blocked sites list (one domain per line), or change your password
- **History cleanup** → edit the hidden-history list or click **Clean now** to sweep matching old URLs
- **Unlocks are per-site** — unlocking Reddit doesn't unlock Instagram
- **Regular-block subdomains are covered** — `music.youtube.com`, `www.instagram.com`, etc. use the parent site's unlock
- **X/Twitter are linked** — blocking or unlocking either `x.com` or `twitter.com` applies to both
- **Reddit redirects to old reddit** — `reddit.com/...` and `www.reddit.com/...` go to `old.reddit.com/...`

---

## Blocked sites format

In the popup, enter one domain per line:

```
reddit.com
x.com
twitter.com
instagram.com
youtube.com
```

No `https://` or `www.` needed.

---

## History Cleanup Format

In the popup, enter one domain per line:

```
okcupid.com
bumble.com
```

FocusLock deletes matching history URLs for the listed domains and their subdomains. Browser-controlled suggestions from bookmarks, open tabs, synced devices, or the search provider may still appear outside extension control.

---

## How it works

Built with Chrome's Manifest V3 APIs and a Firefox MV2 package target for Firefox Android:

- `declarativeNetRequest` — redirects blocked URLs to the extension's blocked page before the page loads (no flash of content)
- `webRequest` — redirects blocked URLs in the Firefox package
- `history` — removes selected domains from local browser history
- `storage` — stores the blocked list and a SHA-256 hash of your password (never the password itself)
- Block redirects include the matched parent site, so unlocking `music.youtube.com` unlocks the configured `youtube.com` block
- Temporary unlocks are tracked with an expiry timestamp; expired unlocks are cleaned up automatically

---

## Privacy

Everything stays on your device. No data is sent anywhere. The password is stored as a SHA-256 hash in local extension storage.

---

## License

MIT
