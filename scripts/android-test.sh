#!/usr/bin/env bash
# Runs the Android end-to-end suites (e2e/run-editor.mjs, then e2e/run-integration.mjs) in one go:
#   1. builds the debug APK (SKIP_BUILD=1 reuses the last build; APK=<path> tests another APK, e.g. a release build),
#      the WhatsApp protocol double if it is missing, and the test media if it is missing;
#   2. creates the test emulator (AVD "ppeely-test") on first use and boots it without a window;
#   3. installs the APK from scratch and runs the suites;
#   4. shuts the emulator down again, also when a suite fails, so its memory is released.
#
# The test emulator uses a 720×1600 screen at 280 dpi (the same 411 dp width as a Pixel 6, so the layout is unchanged), 2 GB of RAM
# and the SwiftShader-on-ANGLE renderer: the editor suite peaks at 3.8 GB of host memory instead of 5.0 GB with a default Pixel 6 emulator.
# The emulator grows by about 1 GB per run, so it is shut down after every run instead of being left running.
#
# Usage: [SUITES="editor integration"] [E2E_ONLY=<step name pattern>] [KEEP_EMULATOR=1] ./scripts/android-test.sh
#   ANDROID_SERIAL=<serial>  test on a device or emulator that is already running instead (it is left running);
#                            it needs a userdebug system image so adb can run as root.
# Requires ANDROID_HOME (or the SDK in ~/Android/Sdk), JAVA_HOME for the Gradle builds, and the tools make-fixtures.sh needs.
set -euo pipefail

cd "$(dirname "$0")/.."

sdk="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-$HOME/Android/Sdk}}"
adb="$sdk/platform-tools/adb"
avd=ppeely-test
image='system-images;android-35;google_apis;x86_64'
port=5584
suites="${SUITES:-editor integration}"
apk="${APK:-native/android/app/build/outputs/apk/debug/app-debug.apk}"
double=e2e/whatsapp-double/app/build/outputs/apk/debug/app-debug.apk
fixtures="${FIXTURES:-$PWD/e2e/fixtures}"
export ADB="$adb" FIXTURES="$fixtures"

[[ -x "$adb" ]] || { echo "Android SDK not found; set ANDROID_HOME." >&2; exit 1; }
mkdir -p e2e/output

# 1. Build what is needed.
[[ -f "$fixtures/cat.jpg" ]] || ./scripts/make-fixtures.sh "$fixtures"

if [[ -z "${APK:-}" && -z "${SKIP_BUILD:-}" ]]; then
  npm run build
  npx cap sync android
  native/android/gradlew -p native/android assembleDebug --console=plain -q
fi

[[ -f "$double" ]] || native/android/gradlew -p e2e/whatsapp-double assembleDebug --console=plain -q
# The Gradle daemon holds 1 to 2 GB; release it before the emulator starts.
native/android/gradlew -p native/android --stop >/dev/null || true

# 2. Pick or start the device.
emulator_pid=
suite_pid=
stop_emulator() {
  if [[ -n "$emulator_pid" && -z "${KEEP_EMULATOR:-}" ]]; then
    "$adb" emu kill >/dev/null 2>&1 || true
    # Wait for the emulator process to exit so its memory is really released.
    for _ in $(seq 1 30); do
      kill -0 "$emulator_pid" 2>/dev/null || break
      sleep 1
    done
  fi
}
trap stop_emulator EXIT
# On Ctrl+C or termination, stop the running suite and exit normally so the EXIT trap still shuts the emulator down.
trap 'kill $suite_pid 2>/dev/null; exit 130' INT TERM

if [[ -z "${ANDROID_SERIAL:-}" ]]; then
  export ANDROID_SERIAL="emulator-$port"

  if ! "$adb" devices | grep -q "^$ANDROID_SERIAL\s*device"; then
    if ! "$sdk/emulator/emulator" -list-avds | grep -qx "$avd"; then
      [[ -d "$sdk/${image//;//}" ]] || "$sdk/cmdline-tools/latest/bin/sdkmanager" "$image"
      echo no | "$sdk/cmdline-tools/latest/bin/avdmanager" create avd -n "$avd" -k "$image" -d pixel_6 >/dev/null
      config="${ANDROID_AVD_HOME:-$HOME/.android/avd}/$avd.avd/config.ini"
      sed -i -e '/^hw\.lcd\.\(width\|height\|density\)=/d' -e '/^hw\.ramSize=/d' "$config"
      printf 'hw.lcd.width=720\nhw.lcd.height=1600\nhw.lcd.density=280\nhw.ramSize=2048M\n' >>"$config"
    fi

    echo "Starting the $avd emulator…"
    "$sdk/emulator/emulator" -avd "$avd" -port "$port" -no-window -no-audio -no-boot-anim -no-snapshot \
      -gpu swangle -memory 2048 -cores 4 >e2e/output/emulator.log 2>&1 &
    emulator_pid=$!
  fi
fi

timeout 300 "$adb" wait-for-device
for _ in $(seq 1 300); do
  [[ "$("$adb" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" == 1 ]] && break
  sleep 1
done
[[ "$("$adb" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" == 1 ]] || { echo "The device did not finish booting; see e2e/output/emulator.log." >&2; exit 1; }

"$adb" root >/dev/null
sleep 2
"$adb" wait-for-device

# 3. Install the APK from scratch. Clearing app data alone would keep state stored outside it, such as the importer
#    switch (a component enabled state) and granted permissions, and a reinstall also accepts an APK signed with another key.
"$adb" uninstall com.ppeely.stickers >/dev/null 2>&1 || true
"$adb" install "$apk" >/dev/null

status=0
for suite in $suites; do
  echo "== $suite"
  # Run in the background and wait, so a signal reaches the trap at once instead of after the suite finishes.
  DOUBLE_APK="$double" node "e2e/run-$suite.mjs" &
  suite_pid=$!
  wait "$suite_pid" || status=1
done

exit "$status"
