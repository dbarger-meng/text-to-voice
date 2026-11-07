#!/usr/bin/env bash
# Rebuild js/mespeak.bundle.js from the meSpeak npm package (GPL):
# engine + config + US English voice, as one browser script exposing window.meSpeak.
set -euo pipefail
here="$(cd "$(dirname "$0")/.." && pwd)"
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
cd "$tmp"
npm pack mespeak@2.0.2 >/dev/null && tar xzf mespeak-2.0.2.tgz
cat > entry.js <<'JS'
var meSpeak = require("./package/src/index.js");
meSpeak.loadConfig(require("./package/src/mespeak_config.json"));
meSpeak.loadVoice(require("./package/voices/en/en-us.json"));
window.meSpeak = meSpeak;
JS
npx -y esbuild@0.24.0 entry.js --bundle --minify --format=iife --platform=browser \
  --outfile="$here/js/mespeak.bundle.js" --log-level=warning
echo "wrote $here/js/mespeak.bundle.js"
