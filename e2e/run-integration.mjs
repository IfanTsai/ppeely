// End-to-end tests (part 2): the WhatsApp flow, sticker pack file import and export, settings, custom fonts, backup, sticker keyboard, sticker library.
// Prerequisites: run-editor.mjs has run (leaving the "Cat Pack 2" and "Anim Pack" sticker packs on the device), and adb runs as root
// (requires a userdebug system image; these images all include su).
// Both debug build and release build APKs can be tested: the release build is not debuggable, but on a userdebug system (emulator) the WebView debugging port is still open.
// Usage: [DOUBLE_APK=<WhatsApp protocol double APK>] node e2e/run-integration.mjs; see e2e/config.mjs for the other options.
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { adb, adbOutput, APP_ID, connect, deviceScreenshot, launchApp, sleep } from './cdp.mjs';
import { FIXTURES, OUTPUT, selected } from './config.mjs';
import { foregroundPackage, pressBack, tapNode, tapScreen } from './device.mjs';
import { appShell, assert, assertEqual, installFilePicker, queueFile, readAppPath, readPackIndex, testId } from './helpers.mjs';
import * as steps from './steps.mjs';

const DOUBLE_APK = process.env.DOUBLE_APK ?? 'e2e/whatsapp-double/app/build/outputs/apk/debug/app-debug.apk';
const AUTHORITY = `${APP_ID}.stickercontentprovider`;
const KEYBOARD = `${APP_ID}/.keyboard.StickerKeyboardService`;
mkdirSync(OUTPUT, { recursive: true });

const results = [];
let session;

async function openApp() {
  session?.close();
  launchApp();
  session = await connect();
  await session.waitForSelector(testId('home-screen'));
  await installFilePicker(session);
}

async function step(name, body) {
  if (!selected(name)) {
    return;
  }

  const started = Date.now();
  try {
    await body();
    results.push({ name, ok: true });
    console.log(`ok    ${name} (${Date.now() - started} ms)`);
  } catch (error) {
    results.push({ name, ok: false });
    console.log(`FAIL  ${name}: ${error.message}`);
    console.log(session.consoleLines.filter((line) => /^\[(error|exception)\] (?!Object)/.test(line)).slice(-4).join('\n'));
    console.log(`      recent events: ${await session.evaluate('JSON.stringify(window.__e2eEvents ?? [])').catch(() => 'unavailable')}`);
    deviceScreenshot(`${OUTPUT}/fail-integration-${results.length}.png`);
    await openApp().catch((reopenError) => console.log(`      could not reopen the app: ${reopenError.message}`));
  }
}

const shot = (name) => deviceScreenshot(`${OUTPUT}/${name}.png`);
const packs = () => readPackIndex().packs;
const packNamed = (name) => packs().find((pack) => pack.name === name);
const readDouble = (file) => JSON.parse(adb('shell', 'run-as', 'com.whatsapp', 'cat', `files/${file}`));

async function openPack(name) {
  await session.waitForSelector(testId('pack-row'));
  await session.evaluate(`[...document.querySelectorAll('${testId('pack-row')}')].find((row) => row.querySelector('strong').innerText === ${JSON.stringify(name)}).click()`);
  await session.waitForSelector(testId('maker-screen'));
}

async function backToHome() {
  await session.tap(testId('maker-back'));
  await session.waitFor(`!document.querySelector('${testId('maker-screen')}')`);
}

async function waitForToast(pattern, timeoutMs = 20000) {
  return session.waitFor(`${pattern}.test(${steps.toastMessage}) ? ${steps.toastMessage} : null`, { timeoutMs });
}

async function addCurrentPackToWhatsApp() {
  // The previous action's toast may still be showing; wait for it to disappear before tapping, so what we wait for next is this action's result.
  await session.waitFor(`!document.querySelector('${testId('toast')}')`);
  await session.tap(testId('add-to-whatsapp'));
  await waitForToast(/WhatsApp/);
  await steps.waitIdle(session);
}

// First make sure WhatsApp (or its double) is not on the device, to test the "not installed" branch; if it was never installed the uninstall command fails, which does not affect the test.
adbOutput('shell', 'pm', 'uninstall', 'com.whatsapp');

await openApp();

await step('without WhatsApp installed, adding a pack explains why it cannot proceed', async () => {
  await openPack('Cat Pack 2');
  await session.tap(testId('add-to-whatsapp'));
  await session.waitForSelector(testId('alert-dialog'));
  const message = await session.evaluate(`document.querySelector('${testId('alert-dialog')}').innerText`);
  assert(/not installed/.test(message), `unexpected message: ${message}`);
  await session.tap(testId('alert-ok'));
  await backToHome();
});

await step('install the WhatsApp protocol double', async () => {
  const output = adb('install', '-r', DOUBLE_APK);
  assert(/Success/.test(output), output);
});

await step('static pack passes WhatsApp validation through the content provider', async () => {
  await openPack('Cat Pack 2');
  await addCurrentPackToWhatsApp();
  const report = readDouble('last-add.json');
  writeFileSync(`${OUTPUT}/whatsapp-static-report.json`, JSON.stringify(report, null, 2));
  assertEqual(report.ok, true, `validation result (${report.error})`);
  assertEqual(report.caller, APP_ID, 'calling package');
  assertEqual(report.pack.animated, false, 'animated flag');
  assertEqual(report.pack.stickers.length, 7, 'sticker rows');
  assertEqual(report.pack.metadata.sticker_pack_name, 'Cat Pack 2', 'pack name');
  assertEqual(report.pack.stickers[0].emojis.length, 3, 'emoji tags of the first sticker');
  await session.waitFor(`document.querySelector('${testId('add-to-whatsapp')}').textContent.includes('changes')`);
  shot('11-added-to-whatsapp');
  await backToHome();
});

await step('mixed pack is delivered as animated: static sticker is wrapped, tray icon is generated', async () => {
  await openPack('Anim Pack');
  await addCurrentPackToWhatsApp();
  const report = readDouble('last-add.json');
  writeFileSync(`${OUTPUT}/whatsapp-animated-report.json`, JSON.stringify(report, null, 2));
  assertEqual(report.ok, true, `validation result (${report.error})`);
  assertEqual(report.pack.animated, true, 'animated flag');
  assertEqual(report.pack.stickers.map((sticker) => sticker.frames > 1), [true, true, true, true, true], 'every sticker animates');
  assertEqual(report.pack.stickers[4].frames, 2, 'wrapped static sticker has two frames');
  assertEqual([report.pack.tray.width, report.pack.tray.height], [96, 96], 'generated tray icon');
  const pack = packNamed('Anim Pack');
  assertEqual(pack.stickers[4].wrapped, true, 'wrapped flag in the index');
  await backToHome();
});

await step('a pack with one sticker is padded to three with transparent fillers', async () => {
  await steps.createPack(session, 'Solo Pack', 'Tester');
  await steps.chooseSource(session, 'add-sticker', 'text');
  await steps.addText(session, 'Solo');
  await steps.saveText(session);
  await session.waitForSelector(testId('text-layer'));
  await session.tap(testId('save-sticker'));
  await steps.waitForStickerCount(session, 1);
  await addCurrentPackToWhatsApp();
  const report = readDouble('last-add.json');
  assertEqual(report.ok, true, `validation result (${report.error})`);
  assertEqual(report.pack.stickers.length, 3, 'rows seen by WhatsApp');
  assertEqual(report.pack.stickers.slice(1).map((sticker) => sticker.emojis), [['\u2B1C'], ['\u2B1C']], 'emoji of the fillers');
  assertEqual(packNamed('Solo Pack').fillers.length, 2, 'fillers in the index');
  assertEqual(await steps.stickerCount(session), 1, 'fillers are not shown in the app');
  await backToHome();
});

await step('content provider refuses callers without the WhatsApp permission', async () => {
  // root can read any provider, so verifying the permission protection requires dropping to the shell user with su before querying.
  assert(adbOutput('shell', 'command', '-v', 'su').trim() !== '', 'this check needs su on the device (a userdebug system image)');
  const denied = adbOutput('shell', 'su', 'shell', 'content', 'query', '--uri', `content://${AUTHORITY}/metadata`);
  assert(/Permission Denial|SecurityException/.test(denied), `expected a permission denial, got: ${denied.slice(0, 200)}`);
  const allowed = adb('shell', 'content', 'query', '--uri', `content://${AUTHORITY}/metadata`);
  assert(allowed.includes('sticker_pack_identifier='), 'root can read the metadata');
  writeFileSync(`${OUTPUT}/provider-metadata.txt`, allowed);
});

let exportedPack;

await step('share exports a .wastickers archive with the expected entries', async () => {
  await openPack('Cat Pack 2');
  await session.tap(testId('maker-menu'));
  await session.tap(testId('sheet-item-share'));
  await session.waitFor('document.visibilityState === "hidden"', { timeoutMs: 20000 }).catch(() => undefined);
  await sleep(1500);
  assert(!(await session.evaluate(`!!document.querySelector('${testId('busy')}')`)), 'the loading overlay is dismissed before the share sheet opens');
  shot('12-share-sheet');
  exportedPack = readAppPath('cache/export/Cat Pack 2.wastickers');
  writeFileSync(`${OUTPUT}/Cat Pack 2.wastickers`, exportedPack);
  const listing = execFileSync('unzip', ['-Z1', `${OUTPUT}/Cat Pack 2.wastickers`], { encoding: 'utf8' }).trim().split('\n').sort();
  assertEqual(listing, ['author.txt', 'sticker_1.webp', 'sticker_2.webp', 'sticker_3.webp', 'sticker_4.webp', 'sticker_5.webp', 'sticker_6.webp', 'sticker_7.webp', 'title.txt', 'tray.png'], 'archive entries');
  assertEqual(execFileSync('unzip', ['-p', `${OUTPUT}/Cat Pack 2.wastickers`, 'title.txt'], { encoding: 'utf8' }), 'Cat Pack 2\n', 'title.txt');
  pressBack();
  await sleep(800);
  await session.waitForSelector(testId('maker-screen'));
  await backToHome();
});

await step('opening or sharing a .wastickers file from another app imports it', async () => {
  // Have the WhatsApp protocol double act as a file manager: put the file in its private directory and let it hand the file to this app through FileProvider.
  adb('push', `${OUTPUT}/Cat Pack 2.wastickers`, '/data/local/tmp/shared.wastickers');
  adb('shell', 'chmod', '644', '/data/local/tmp/shared.wastickers');
  adb('shell', 'run-as com.whatsapp sh -c "mkdir -p files/shared && cp /data/local/tmp/shared.wastickers files/shared/pack.wastickers"');

  for (const [mode, extra] of [['open', []], ['share', ['--ez', 'send', 'true']]]) {
    const before = packs().length;
    adb('shell', 'am', 'start', '-n', 'com.whatsapp/com.ppeely.e2e.whatsappdouble.OpenFileActivity', '--es', 'file', 'pack.wastickers', '--es', 'target', APP_ID, ...extra);
    await session.waitForSelector(testId('maker-screen'), { timeoutMs: 30000 });
    await steps.waitIdle(session);
    assertEqual(packs().length, before + 1, `pack count after ${mode}`);
    const imported = packs()[0];
    assertEqual([imported.name, imported.author, imported.imported, imported.stickers.length], ['Cat Pack 2', 'Tester', true, 7], `imported pack (${mode})`);
    assert(imported.trayIcon, 'imported pack has a tray icon');
    await backToHome();
  }

  shot('12b-home-after-import');
});

await step('import button reads a picked file; an invalid file is rejected', async () => {
  const before = packs().length;
  await queueFile(session, `${OUTPUT}/Cat Pack 2.wastickers`, 'picked.wastickers', 'application/octet-stream');
  await session.tap(testId('home-import'));
  await session.waitForSelector(testId('maker-screen'), { timeoutMs: 30000 });
  await steps.waitIdle(session);
  assertEqual(packs().length, before + 1, 'pack count after import');
  await backToHome();

  await queueFile(session, `${FIXTURES}/cat.jpg`, 'broken.wastickers', 'application/octet-stream');
  await session.tap(testId('home-import'));
  await session.waitForSelector(testId('alert-dialog'));
  assert(/not a valid sticker pack file/.test(await session.evaluate(`document.querySelector('${testId('alert-dialog')}').innerText`)), 'invalid file message');
  await session.tap(testId('alert-ok'));
  assertEqual(packs().length, before + 1, 'pack count after the invalid file');
});

await step('settings: toggles persist and the importer switch disables the file association', async () => {
  await session.tap(testId('home-settings'));
  await session.waitForSelector(testId('settings-screen'));
  shot('13-settings');
  await session.tap(testId('setting-frame-limit'));
  await session.waitFor(`document.querySelector('${testId('setting-frame-limit')}').getAttribute('aria-checked') === 'true'`);
  await session.tap(testId('setting-frame-limit'));

  const resolves = () => adb('shell', 'cmd', 'package', 'query-activities', '--brief', '-a', 'android.intent.action.VIEW', '-t', 'application/wastickers', '-d', 'content://example/pack.wastickers').includes(APP_ID);
  assert(resolves(), 'file association is active by default');
  await session.tap(testId('setting-importer'));
  await session.waitFor(`document.querySelector('${testId('setting-importer')}').getAttribute('aria-checked') === 'false'`);
  assert(!resolves(), 'file association is off after disabling the switch');
  await session.tap(testId('setting-importer'));
  await session.waitFor(`document.querySelector('${testId('setting-importer')}').getAttribute('aria-checked') === 'true'`);
  assert(resolves(), 'file association is back on');
});

await step('open source licenses list the bundled third-party components', async () => {
  await session.evaluate(`document.querySelector('${testId('setting-licenses')}').scrollIntoView({ block: 'center' })`);
  await sleep(300);
  await session.tap(testId('setting-licenses'));
  await session.waitForSelector(testId('licenses-text'));
  const text = await session.evaluate(`document.querySelector('${testId('licenses-text')}').textContent`);
  for (const name of ['@capacitor/core', '@mediapipe/tasks-vision', '@fontsource/nunito', 'wasm-webp', 'libwebp', 'Apache Cordova Android']) {
    assert(text.includes(name), `the licenses page lists ${name}`);
  }

  await session.tap(testId('licenses-back'));
  await session.waitFor(`!document.querySelector('${testId('licenses-screen')}')`);
  // Scroll back to the top of the settings page; later steps tap settings near the top.
  await session.evaluate(`document.querySelector('${testId('settings-screen')} ion-content').scrollToTop(0)`);
  await sleep(300);
});

await step('language: the setting switches the app and the sticker keyboard, and survives a restart', async () => {
  const settingsTitle = `document.querySelector('${testId('settings-screen')} ion-title').textContent.trim()`;
  const chooseLanguage = async (value) => {
    await session.tap(testId('setting-language'));
    await session.waitForSelector(testId(`sheet-item-${value}`));
    await sleep(300);
    await session.tap(testId(`sheet-item-${value}`));
    await session.waitFor(`!document.querySelector('${testId('sheet')}')`);
  };

  await chooseLanguage('zh');
  await session.waitFor(`${settingsTitle} === '设置' && document.documentElement.lang === 'zh-CN'`);
  assertEqual(await session.evaluate(`document.querySelector('${testId('setting-language-value')}').textContent.trim()`), '中文', 'language shown in settings');
  shot('13b-settings-chinese');

  await openApp();
  assertEqual(await session.evaluate(`document.documentElement.lang`), 'zh-CN', 'page language after a restart');
  assertEqual(await session.evaluate(`document.querySelector('${testId('create-pack')}').textContent.trim()`), '新建贴图包', 'home screen text after a restart');

  // The sticker keyboard (AppLanguage.kt) reads the setting from the Capacitor Preferences file. uiautomator can't see the
  // input method window, so its text is checked on the screenshot.
  assert(appShell('cat shared_prefs/CapacitorStorage.xml').includes('&quot;language&quot;:&quot;zh&quot;'), 'the language is stored where the keyboard reads it');
  adb('shell', 'ime', 'enable', KEYBOARD);
  adb('shell', 'ime', 'set', KEYBOARD);
  adb('shell', 'am', 'start', '-n', 'com.whatsapp/com.ppeely.e2e.whatsappdouble.ChatActivity');
  await sleep(3500);
  shot('13c-keyboard-chinese');
  adb('shell', 'ime', 'reset');

  await openApp();
  await session.tap(testId('home-settings'));
  await session.waitForSelector(testId('settings-screen'));
  await chooseLanguage('system');
  // The emulator's system language is English.
  await session.waitFor(`${settingsTitle} === 'Settings' && document.documentElement.lang === 'en'`);
});

await step('custom fonts: a font file is added and used, a non-font file is rejected', async () => {
  await session.tap(testId('setting-fonts'));
  await session.waitForSelector(testId('fonts-screen'));
  await queueFile(session, `${FIXTURES}/cat.jpg`, 'not-a-font.ttf', 'font/ttf');
  await session.tap(testId('font-add'));
  await session.waitForSelector(testId('alert-dialog'));
  await session.tap(testId('alert-ok'));
  await queueFile(session, `${FIXTURES}/font.ttf`, 'MySerif.ttf', 'font/ttf');
  await session.tap(testId('font-add'));
  await session.waitForSelector(testId('font-row'));
  assertEqual(await session.evaluate(`document.querySelector('${testId('font-row')} ion-label').textContent.trim()`), 'MySerif', 'font label');
  shot('14-custom-fonts');
  await session.tap(testId('fonts-back'));
  await session.tap(testId('settings-back'));

  await openPack('Solo Pack');
  await steps.chooseSource(session, 'add-sticker', 'text');
  await session.waitForSelector(testId('text-input'));
  await session.type(testId('text-input'), 'Custom');
  for (let i = 0; i < 12 && (await session.evaluate(`document.querySelector('${testId('text-font')}').dataset.font`)) !== 'custom:MySerif.ttf'; i++) {
    await session.tap(testId('text-font'));
  }

  assertEqual(await session.evaluate(`document.querySelector('${testId('text-font')}').textContent.trim()`), 'MySerif', 'font button label');
  await sleep(500);
  shot('15-custom-font-text');
  await steps.saveText(session);
  await session.waitForSelector(testId('text-layer'));
  await session.tap(testId('save-sticker'));
  await steps.waitForStickerCount(session, 2);
  await backToHome();
});

await step('gallery source: a photo chosen in the system photo picker reaches the editor', async () => {
  adb('push', `${FIXTURES}/cat.jpg`, '/sdcard/Pictures/e2e-cat.jpg');
  adb('shell', 'am', 'broadcast', '-a', 'android.intent.action.MEDIA_SCANNER_SCAN_FILE', '-d', 'file:///sdcard/Pictures/e2e-cat.jpg');
  await sleep(1500);
  await openPack('Solo Pack');
  const before = await steps.stickerCount(session);
  await steps.chooseSource(session, 'add-sticker', 'gallery');
  await sleep(3000);
  shot('15b-photo-picker');
  await tapNode(/^Photo taken on/);
  await session.waitForSelector(testId('cut-canvas'), { timeoutMs: 30000 });
  await steps.waitIdle(session);
  await session.tap(testId('cut-select-all'));
  await session.waitForSelector(testId('decorate-step'));
  await steps.waitIdle(session);
  await session.tap(testId('save-sticker'));
  await steps.waitForStickerCount(session, before + 1);
});

await step('camera source: a photo taken with the system camera reaches the editor', async () => {
  const before = await steps.stickerCount(session);
  await steps.chooseSource(session, 'add-sticker', 'camera');
  await tapNode(/^Shutter$/, { timeoutMs: 30000 });
  await sleep(3000);
  shot('15c-camera-review');
  await tapNode(/^Done$/, { timeoutMs: 30000 });
  await session.waitForSelector(testId('cut-canvas'), { timeoutMs: 30000 });
  await steps.waitIdle(session);
  await sleep(500);
  shot('15d-camera-photo-in-editor');
  await session.tap(testId('cut-select-all'));
  await session.waitForSelector(testId('decorate-step'));
  await steps.waitIdle(session);
  await session.tap(testId('save-sticker'));
  await steps.waitForStickerCount(session, before + 1);
  await backToHome();
});

await step('sticker keyboard commits a sticker into a chat input as image/webp.wasticker', async () => {
  adb('shell', 'ime', 'enable', KEYBOARD);
  adb('shell', 'ime', 'set', KEYBOARD);
  adb('shell', 'run-as', 'com.whatsapp', 'rm', '-f', 'files/last-received.json');
  adb('shell', 'am', 'start', '-n', 'com.whatsapp/com.ppeely.e2e.whatsappdouble.ChatActivity');
  await sleep(3500);
  shot('16-keyboard');
  const size = /(\d+)x(\d+)/.exec(adb('shell', 'wm', 'size')).slice(1).map(Number);
  const density = Number(/(\d+)/.exec(adb('shell', 'wm', 'density'))[1]) / 160;
  // The keyboard layout is fixed: below a 48dp tab bar is a 230dp-tall, 4-column sticker grid; tap the sticker in the first row and first column.
  const gridTop = size[1] - (24 + 230) * density;
  tapScreen(size[0] * 0.125, gridTop + (size[0] / 4) * 0.5);
  await sleep(2000);
  shot('17-keyboard-sent');
  const received = readDouble('last-received.json');
  writeFileSync(`${OUTPUT}/keyboard-report.json`, JSON.stringify(received, null, 2));
  assertEqual([received.ok, received.mimeType, received.width, received.height], [true, 'image/webp.wasticker', 512, 512], 'sticker received by the chat input');
  adb('shell', 'ime', 'reset');
});

await step('sticker library lists WhatsApp sent and received stickers after folder access is granted', async () => {
  const folder = '/sdcard/Android/media/com.whatsapp/WhatsApp/Media/WhatsApp Stickers';
  adb('shell', `mkdir -p '${folder}'`);
  adb('push', `${OUTPUT}/from-gif.webp`, `${folder}/STK-20260101-WA0001.webp`);
  adb('push', `${FIXTURES}/small-anim.webp`, `${folder}/STK-20260101-WA0002.webp`);
  await openApp();
  await openPack('Solo Pack');
  await steps.chooseSource(session, 'add-sticker', 'library');
  await session.tap(testId('library-tab-received'));
  // Directory access grants persist; if access was already granted on the device (e.g. on a repeated test run), the grant button won't appear again.
  await session.waitFor(`!!document.querySelector('${testId('library-allow')}') || !!document.querySelector('${testId('library-received-sticker')}')`);
  if (await session.evaluate(`!!document.querySelector('${testId('library-allow')}')`)) {
    await session.tap(testId('library-allow'));
    await sleep(2500);
    shot('18-folder-picker');
    await tapNode(/^use this folder$/i);
    await tapNode(/^allow$/i);
  }

  await session.waitForSelector(testId('library-received-sticker'), { timeoutMs: 20000 });
  assertEqual(await session.evaluate(`document.querySelectorAll('${testId('library-received-sticker')}').length`), 2, 'received stickers');
  await sleep(800);
  shot('19-library-received');
  const before = packNamed('Solo Pack').stickers.length;
  await session.tap(testId('library-received-sticker'));
  await steps.waitForStickerCount(session, before + 1, 120000);
  // The UI updates before the index file: wait until the new sticker is written to the index before checking.
  for (let i = 0; i < 40 && packNamed('Solo Pack').stickers.length <= before; i++) {
    await sleep(250);
  }

  assertEqual(packNamed('Solo Pack').stickers[before]?.animated, true, 'picked sticker is animated');
  await backToHome();
});

let backup;

await step('backup writes every pack into one file', async () => {
  await session.tap(testId('home-settings'));
  await session.tap(testId('setting-backup'));
  // Backup time depends on the number of stickers; once the system share sheet appears, the backup file has been written.
  const deadline = Date.now() + 60000;
  while (foregroundPackage() === APP_ID && Date.now() < deadline) {
    await sleep(500);
  }

  await sleep(1000);
  const name = appShell('ls cache/export').split('\n').find((line) => line.trim().endsWith('.ppeelybackup'));
  assert(name, 'backup file exists in the cache directory');
  backup = readAppPath(`cache/export/${name.trim()}`);
  writeFileSync(`${OUTPUT}/backup.ppeelybackup`, backup);
  const manifest = JSON.parse(execFileSync('unzip', ['-p', `${OUTPUT}/backup.ppeelybackup`, 'backup.json'], { encoding: 'utf8' }));
  assertEqual(manifest.packs.length, packs().length, 'packs in the backup');
  pressBack();
  await sleep(800);
});

await step('delete all packs, then restore them from the backup', async () => {
  const before = packs();
  await session.waitForSelector(testId('settings-screen'));
  await session.tap(testId('setting-delete-all'));
  await session.tap(testId('confirm-ok'));
  await session.waitFor(`(() => true)()`);
  await sleep(800);
  assertEqual(packs().length, 0, 'packs after delete all');
  assertEqual(appShell('ls files/packs').trim(), 'index.json', 'pack directories are removed from disk');

  await queueFile(session, `${OUTPUT}/backup.ppeelybackup`, 'backup.ppeelybackup', 'application/zip');
  await session.tap(testId('setting-restore'));
  await waitForToast(/Restored/, 60000);
  const after = packs();
  assertEqual(after.map((pack) => [pack.name, pack.stickers.length, pack.stickers.map((sticker) => sticker.emojis.length)]), before.map((pack) => [pack.name, pack.stickers.length, pack.stickers.map((sticker) => sticker.emojis.length)]), 'restored packs');
  await session.tap(testId('settings-back'));
  await sleep(500);
  shot('20-home-restored');
});

await step('restored packs are still accepted by WhatsApp', async () => {
  await openPack('Anim Pack');
  await addCurrentPackToWhatsApp();
  const report = readDouble('last-add.json');
  assertEqual([report.ok, report.pack.animated, report.pack.stickers.length], [true, true, 5], `validation result (${report.error})`);
  await backToHome();
});

await step('deleting a pack removes its files', async () => {
  const pack = packNamed('Solo Pack');
  await openPack('Solo Pack');
  await session.tap(testId('maker-menu'));
  await session.tap(testId('sheet-item-delete'));
  await session.tap(testId('confirm-ok'));
  await session.waitFor(`!document.querySelector('${testId('maker-screen')}')`);
  await sleep(600);
  assert(!packNamed('Solo Pack'), 'pack is gone from the index');
  assert(!appShell('ls files/packs').includes(pack.id), 'pack directory is removed');
});

const failed = results.filter((result) => !result.ok);
const errors = session.consoleLines.filter((line) => /^\[exception\]/.test(line));
if (errors.length > 0) {
  console.log(`\nuncaught exceptions in the page:\n${errors.join('\n')}`);
}

console.log(`\n${results.length - failed.length} passed, ${failed.length} failed`);
console.log(`foreground package at the end: ${foregroundPackage()}`);
session.close();
process.exit(failed.length > 0 ? 1 : 0);
