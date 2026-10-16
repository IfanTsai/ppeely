#!/usr/bin/env bash
# Renders the app icon and splash images for both platforms (see scripts/generate-icons.mjs)
# in the Playwright Docker image. Needs Docker and `npm install`.
set -euo pipefail

cd "$(dirname "$0")/.."

# The browsers in the image must match the installed playwright-core.
image="mcr.microsoft.com/playwright:v$(node -p "require('playwright-core/package.json').version")-noble"

docker run --rm --ipc=host \
  --user "$(id -u):$(id -g)" -e HOME=/tmp \
  -v "$PWD:/work" -w /work \
  "$image" \
  node scripts/generate-icons.mjs
