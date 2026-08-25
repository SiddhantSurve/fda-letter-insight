#!/usr/bin/env bash
# Domino Data Lab App launcher.
# Domino runs this file to start a long-running web app and proxies it on port 8888.
set -euo pipefail

cd "$(dirname "$0")"

# Build a plain Node server bundle instead of the default edge/Cloudflare target.
export NITRO_PRESET=node-server
export NODE_ENV=production

npm install --no-audit --no-fund
npm run build

# Domino Apps must listen on 0.0.0.0:8888
export HOST=0.0.0.0
export PORT=8888
exec node .output/server/index.mjs
