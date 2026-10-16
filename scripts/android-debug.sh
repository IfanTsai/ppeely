#!/usr/bin/env bash
# Builds the debug build APK and installs it on the connected device or emulator.
# Requires JAVA_HOME pointing to JDK 21 and ANDROID_HOME pointing to the Android SDK.
set -euo pipefail

cd "$(dirname "$0")/.."

npm run build
npx cap sync android
(cd native/android && ./gradlew assembleDebug --console=plain -q)

if [[ "${1:-}" == "--install" ]]; then
  adb install -r native/android/app/build/outputs/apk/debug/app-debug.apk
fi
