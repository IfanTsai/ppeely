#!/usr/bin/env bash
# Builds the release build APK and copies it to the release/ directory.
# Requires JAVA_HOME pointing to JDK 21 and ANDROID_HOME pointing to the Android SDK.
# Uses the release signing config in native/android/keystore.properties if present; otherwise signs with the debug key (only suitable for trial installs).
set -euo pipefail

cd "$(dirname "$0")/.."

npm run build
npx cap sync android
(cd native/android && ./gradlew assembleRelease --console=plain -q)

mkdir -p release
version="$(node -p "require('./package.json').version")"
cp native/android/app/build/outputs/apk/release/app-release.apk "release/ppeely-${version}.apk"
echo "release/ppeely-${version}.apk"
