// Smoke test for the release build APK. The release build has WebView debugging disabled, so it works only through the accessibility view hierarchy (uiautomator) and adb:
// install, launch, create a sticker pack, add an existing sticker pack to WhatsApp (the WhatsApp protocol double), confirming the native and web layers both work in the release build.
// Prerequisites: the device still holds the data left by run-integration.mjs, and the WhatsApp protocol double is installed.
// Usage: APK=release/ppeely-<version>.apk node e2e/run-release-smoke.mjs
import { mkdirSync } from 'node:fs';
import { adb, adbOutput, APP_ID, deviceScreenshot, sleep } from './cdp.mjs';
import { tapNode, tapNodeOfClass, waitForNode } from './device.mjs';
import { assert, assertEqual } from './helpers.mjs';

const APK = process.env.APK;
const OUTPUT = process.env.OUTPUT ?? 'e2e/output';
assert(APK, 'set APK to the release APK path');
mkdirSync(OUTPUT, { recursive: true });

assert(/Success/.test(adb('install', '-r', APK)), 'release APK installs');
assert(/not debuggable/.test(adbOutput('shell', 'run-as', APP_ID, 'true')), 'release build is not debuggable');

adb('shell', 'am', 'force-stop', APP_ID);
adb('shell', 'am', 'start', '-W', '-n', `${APP_ID}/.MainActivity`);
// Each sticker pack row is one node in the view hierarchy, with text "name author · count".
await waitForNode(/^Cat Pack 2 /);
deviceScreenshot(`${OUTPUT}/release-01-home.png`);
console.log('ok    release build starts and lists the existing packs');

// Ionic renders button text in uppercase on Android, and the view hierarchy text is uppercase too, so matching is case-insensitive.
await tapNode(/^new sticker pack$/i);
await sleep(1500);
// The first text field in the dialog is the name; the author keeps the previously entered value.
await tapNodeOfClass('android.widget.EditText', 0);
adb('shell', 'input', 'text', 'Release');
await tapNode(/^create$/i);
await waitForNode(/^Release/);
adb('shell', 'input', 'keyevent', '4');
await sleep(1500);
console.log('ok    a sticker pack can be created');

await tapNode(/^Cat Pack 2 /);
await sleep(1500);
adb('shell', 'run-as', 'com.whatsapp', 'rm', '-f', 'files/last-add.json');
await tapNode(/^add (changes )?to whatsapp$/i);
await sleep(5000);
deviceScreenshot(`${OUTPUT}/release-02-added.png`);
const report = JSON.parse(adb('shell', 'run-as', 'com.whatsapp', 'cat', 'files/last-add.json'));
assertEqual([report.ok, report.caller, report.pack.metadata.sticker_pack_name], [true, APP_ID, 'Cat Pack 2'], `validation by the WhatsApp double (${report.error})`);
console.log(`ok    WhatsApp double validated ${report.pack.stickers.length} stickers served by the release build`);
