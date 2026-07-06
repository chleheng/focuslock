#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$ROOT/dist/firefox-src"

rm -rf "$OUT"
mkdir -p "$OUT"

cp "$ROOT/background.js" "$OUT/background.js"
cp "$ROOT/blocked.html" "$OUT/blocked.html"
cp "$ROOT/blocked.js" "$OUT/blocked.js"
cp "$ROOT/popup.html" "$OUT/popup.html"
cp "$ROOT/popup.js" "$OUT/popup.js"
cp "$ROOT/manifest.firefox.json" "$OUT/manifest.json"

echo "$OUT"
