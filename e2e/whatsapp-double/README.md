# WhatsApp protocol double

This is an Android app used only for end-to-end tests. It is not part of the product, and it is not WhatsApp.

The real WhatsApp requires registering with a phone number before sticker packs can be added, which cannot be automated on an emulator. To verify this project's Android integration without depending on the real WhatsApp, this app plays the WhatsApp side and follows WhatsApp's public third-party sticker protocol:

- It installs under the package name `com.whatsapp` and defines and holds the `com.whatsapp.sticker.READ` permission.
- It responds to `com.whatsapp.intent.action.ENABLE_STICKER_PACK`: it reads the metadata, the sticker list and every image file through the sticker app's ContentProvider, applies the validation rules from WhatsApp's documentation, and returns `RESULT_OK` on success or `RESULT_CANCELED` with the reason in `validation_error` otherwise.
- It provides `com.whatsapp.provider.sticker_whitelist_check`, which answers whether a given sticker pack has been added.
- Its launch screen has a text field that accepts `image/webp.wasticker`, used to receive stickers committed by the sticker keyboard.
- `OpenFileActivity` acts as a file manager: it hands files from its own directory to the sticker app through FileProvider to open or share, used to test the sticker pack file (.wastickers) import entry points.

The result of every validation and every received sticker is written to a JSON file in the app-private directory, which the test scripts read with `adb shell run-as com.whatsapp cat files/<file>`.

Because the package name is the same as the real WhatsApp, the two cannot be installed at the same time; install this app only on emulators used for testing.

Build:

```bash
../../native/android/gradlew -p . assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
```
