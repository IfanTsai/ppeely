#!/usr/bin/env bash
# Runs the web layer tests (e2e/run-browser.mjs) on Chromium and WebKit inside Playwright's Docker image. No emulator is needed,
# so this is the quick check after changing the web layer; the Android suites (scripts/android-test.sh) cover the native side.
# Builds the web assets first (SKIP_BUILD=1 reuses dist/) and creates the test media if it is missing.
# Usage: [BROWSERS="chromium webkit"] [E2E_ONLY=<step name pattern>] ./scripts/browser-test.sh
set -euo pipefail

cd "$(dirname "$0")/.."

fixtures="${FIXTURES:-$PWD/e2e/fixtures}"
output="${OUTPUT:-$PWD/e2e/output}"
browsers="${BROWSERS:-chromium webkit}"
# The browsers in the image must match the installed playwright-core.
image="mcr.microsoft.com/playwright:v$(node -p "require('playwright-core/package.json').version")-noble"
mkdir -p "$output"

[[ -f "$fixtures/cat.jpg" ]] || ./scripts/make-fixtures.sh "$fixtures"
[[ -n "${SKIP_BUILD:-}" ]] || npm run build

docker run --rm --ipc=host \
  --user "$(id -u):$(id -g)" -e HOME=/tmp -e BROWSERS="$browsers" -e E2E_ONLY="${E2E_ONLY:-}" \
  -v "$PWD:/work" -v "$fixtures:/fixtures:ro" -v "$output:/output" -w /work \
  "$image" \
  bash -c '
    npx vite preview --host 127.0.0.1 --port 4173 --strictPort >/tmp/preview.log 2>&1 &
    for _ in $(seq 1 40); do
      curl -fs http://127.0.0.1:4173/ >/dev/null && break
      sleep 0.5
    done
    curl -fs http://127.0.0.1:4173/ >/dev/null || { cat /tmp/preview.log; exit 1; }
    status=0
    for browser in $BROWSERS; do
      echo "== $browser"
      BROWSER=$browser FIXTURES=/fixtures OUTPUT=/output node e2e/run-browser.mjs || status=1
    done
    exit $status
  '
