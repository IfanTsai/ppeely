# Offline checks for the Swift code

The iOS app can only be built with Xcode on macOS. This directory provides checks that run on Linux, so errors in the Swift code are caught early in environments without Xcode:

1. Syntax check: `swiftc -parse` parses every Swift file under `native/ios/App/App/`.
2. Type check: `swiftc -typecheck` checks the three files written for this project against the interface declarations in `stubs/`.

`stubs/Capacitor.swift` is written from the public interface in the source code under `node_modules/@capacitor/ios/Capacitor/Capacitor/` (Capacitor is MIT-licensed), and `stubs/UIKit.swift` is written from Apple's public UIKit documentation; both cover only what this project uses. Linux has no Objective-C runtime, so the `@objc` attributes in the source are stripped before checking.

3. Real execution (optional): `PackStore.swift` depends only on Foundation and can be compiled and run on Linux. With `PACKS_HOME` set, `PackStoreCheck.swift` uses it to read real sticker pack data, builds the pasteboard JSON handed to WhatsApp, and checks that the tray icon, sticker count, dimensions, and file sizes meet WhatsApp's requirements.

These checks do not replace an Xcode build: they do not verify the real SDK, linking, signing, or runtime behavior.

Run:

```bash
./scripts/check-swift.sh

# Also run PackStore against real data: <dir>/Documents/packs is files/packs pulled from an Android device
PACKS_HOME=<dir> ./scripts/check-swift.sh
```
