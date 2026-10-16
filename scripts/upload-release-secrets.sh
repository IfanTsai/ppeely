#!/usr/bin/env bash
# Uploads the Android release key to the `release` environment of the GitHub repository, where the Release workflow
# (.github/workflows/release.yml) reads it to sign builds. Reads native/android/keystore/ppeely-release.jks and
# native/android/keystore.properties, created by scripts/generate-release-key.sh; the password is never printed.
# Requires the GitHub CLI (gh), signed in, run inside a clone of the GitHub repository.
set -euo pipefail

cd "$(dirname "$0")/../native/android"

if [[ ! -f keystore.properties || ! -f keystore/ppeely-release.jks ]]; then
  echo "No release key found; run scripts/generate-release-key.sh first." >&2
  exit 1
fi

# Creates the environment if it doesn't exist yet; leaves its protection rules alone if it does.
gh api --silent --method PUT 'repos/{owner}/{repo}/environments/release'

base64 < keystore/ppeely-release.jks | tr -d '\n' | gh secret set ANDROID_KEYSTORE_BASE64 --env release
grep '^storePassword=' keystore.properties | cut -d= -f2- | tr -d '\n' | gh secret set ANDROID_KEYSTORE_PASSWORD --env release

echo "Uploaded ANDROID_KEYSTORE_BASE64 and ANDROID_KEYSTORE_PASSWORD to the release environment."
