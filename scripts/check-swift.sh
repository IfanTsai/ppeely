#!/usr/bin/env bash
# Checks the iOS Swift code with the Swift toolchain in Docker; see native/ios/checks/README.md.
set -euo pipefail

cd "$(dirname "$0")/.."

# When PACKS_HOME is set, also run PackStore for real: Documents/packs under that directory holds sticker pack data (e.g. files/packs pulled from an Android device).
packs_home="${PACKS_HOME:-}"
packs_mount=()
if [[ -n "$packs_home" ]]; then
  packs_mount=(-v "$packs_home:/data:ro")
fi

docker run --rm --user "$(id -u):$(id -g)" -e HOME=/tmp -v "$PWD:/work:ro" "${packs_mount[@]}" -w /tmp swift:6.1-jammy bash -euc '
  app=/work/native/ios/App/App
  stubs=/work/native/ios/checks/stubs

  echo "== syntax =="
  for file in "$app"/*.swift; do
    swiftc -parse "$file"
    echo "ok    $(basename "$file")"
  done

  echo "== types =="
  mkdir -p /tmp/modules /tmp/sources
  swiftc -emit-module -module-name UIKit -parse-as-library -o /tmp/modules/UIKit.swiftmodule "$stubs/UIKit.swift"
  swiftc -emit-module -module-name Capacitor -parse-as-library -I /tmp/modules -o /tmp/modules/Capacitor.swiftmodule "$stubs/Capacitor.swift"

  # Linux has no Objective-C runtime, so strip @objc annotations before checking.
  for file in StickerBridgePlugin.swift PackStore.swift MainViewController.swift; do
    sed -E "s/@objc(\([A-Za-z]+\))? ?//g" "$app/$file" > "/tmp/sources/$file"
  done

  swiftc -typecheck -module-name App -I /tmp/modules -warnings-as-errors /tmp/sources/*.swift
  echo "ok    StickerBridgePlugin.swift PackStore.swift MainViewController.swift"

  if [ -d /data/Documents/packs ]; then
    echo "== PackStore on real data =="
    swiftc -parse-as-library -o /tmp/packstore-check "$app/PackStore.swift" /work/native/ios/checks/PackStoreCheck.swift
    HOME=/data /tmp/packstore-check
  fi
'
