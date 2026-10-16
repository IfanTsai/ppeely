// Tests the web layer shared by both platforms in a desktop browser engine, without an emulator: the editor, encoding, storage, and
// import/export. BROWSER=chromium (the engine of Android's WebView) runs with Pixel 7 device settings, BROWSER=webkit (the engine of
// iOS's WKWebView) with iPhone 15 device settings. Neither is a real device: Capacitor's native plugins, the Kotlin and Swift code are
// out of scope, and file storage uses Capacitor's browser implementation (IndexedDB).
//
// Usage: ./scripts/browser-test.sh, which runs it inside Playwright's Docker image; see e2e/config.mjs for the options.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { unzipSync } from 'fflate';
import { chromium, devices, webkit } from 'playwright-core';
import { FIXTURES, OUTPUT, selected } from './config.mjs';
import { assertOutlineLooksRight, outlineStatsExpression } from './outline-check.mjs';

const URL = process.env.APP_URL ?? 'http://127.0.0.1:4173/';
const ENGINES = {
  chromium: { label: 'Chromium', launcher: chromium, device: 'Pixel 7' },
  webkit: { label: 'WebKit', launcher: webkit, device: 'iPhone 15' },
};
const engine = ENGINES[process.env.BROWSER ?? 'webkit'];
if (!engine) {
  throw new Error(`BROWSER must be one of ${Object.keys(ENGINES).join(', ')}`);
}

// Output files and pack names carry the engine name, so both engines can share one output directory.
const prefix = engine.label.toLowerCase();

mkdirSync(OUTPUT, { recursive: true });

const browser = await engine.launcher.launch();
const context = await browser.newContext({ ...devices[engine.device], acceptDownloads: true });
const page = await context.newPage();
const consoleLines = [];
page.on('console', (message) => consoleLines.push(`[${message.type()}] ${message.text()}`));
page.on('pageerror', (error) => consoleLines.push(`[exception] ${error.message}`));

const results = [];
const id = (name) => `[data-testid="${name}"]`;
const tap = (name) => page.locator(id(name)).first().click();
const idle = () => page.waitForSelector(id('busy'), { state: 'detached', timeout: 180000 });
const stickerCount = () => page.locator(id('sticker-slot')).count();

function assert(condition, message) {
  if (!condition) {
    throw new Error(`assertion failed: ${message}`);
  }
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
    console.log(`FAIL  ${name}: ${error.message.split('\n')[0]}`);
    console.log(consoleLines.filter((line) => /^\[(error|exception|warning)\]/.test(line)).slice(-4).join('\n'));
    await page.screenshot({ path: `${OUTPUT}/${prefix}-fail-${results.length}.png` }).catch(() => undefined);
    // Reload from the root URL: the route lives in the URL hash, so reloading in place would stay on the failing page.
    await page.goto('about:blank');
    await page.goto(URL);
    await page.waitForSelector(id('home-screen'));
    if ((await page.locator(id('pack-row')).count()) > 0) {
      await tap('pack-row');
    }
  }
}

// Taps a slot and picks a source; when a file is given, hands it to the page through the browser's file chooser event.
async function chooseSource(slot, source, file) {
  await tap(slot);
  if (file) {
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), tap(`sheet-item-${source}`)]);
    await chooser.setFiles(`${FIXTURES}/${file}`);
  } else {
    await tap(`sheet-item-${source}`);
  }
}

async function waitForStickers(count) {
  await page.waitForFunction((expected) => document.querySelectorAll('[data-testid="sticker-slot"]').length === expected && !document.querySelector('[data-testid="busy"]'), count, { timeout: 240000 });
}

// Reads sticker files back through Capacitor's file API and returns each sticker's size in bytes, dimensions, and frame count.
function inspectStickers() {
  return page.evaluate(async () => {
    const filesystem = window.Capacitor.Plugins.Filesystem;
    const { data: indexText } = await filesystem.readFile({ path: 'packs/index.json', directory: 'DATA', encoding: 'utf8' });
    const index = JSON.parse(indexText);
    const report = [];

    for (const pack of index.packs) {
      for (const sticker of pack.stickers) {
        const { data } = await filesystem.readFile({ path: `packs/${pack.id}/${sticker.file}`, directory: 'DATA' });
        const bytes = Uint8Array.from(atob(data), (char) => char.charCodeAt(0));
        const text = String.fromCharCode(...bytes.subarray(0, 12));
        let width = 0;
        let height = 0;
        let frames = 0;
        for (let offset = 12; offset + 8 <= bytes.length; ) {
          const type = String.fromCharCode(...bytes.subarray(offset, offset + 4));
          const size = bytes[offset + 4] | (bytes[offset + 5] << 8) | (bytes[offset + 6] << 16) | (bytes[offset + 7] << 24);
          if (type === 'VP8X') {
            width = (bytes[offset + 12] | (bytes[offset + 13] << 8) | (bytes[offset + 14] << 16)) + 1;
            height = (bytes[offset + 15] | (bytes[offset + 16] << 8) | (bytes[offset + 17] << 16)) + 1;
          }

          if (type === 'ANMF') frames++;
          offset += 8 + size + (size & 1);
        }

        report.push({ pack: pack.name, webp: text.startsWith('RIFF') && text.endsWith('WEBP'), bytes: bytes.length, width, height, frames: Math.max(1, frames), animated: sticker.animated, wrapped: !!sticker.wrapped, emojis: sticker.emojis });
      }
    }

    return { packs: index.packs.map((pack) => ({ name: pack.name, trayIcon: pack.trayIcon, stickers: pack.stickers.length, fillers: pack.fillers.length, animated: pack.animated })), stickers: report };
  });
}

// Returns only once the element position has settled: the editor modal has an enter animation, and coordinates measured during it go stale.
async function stableBox(selector) {
  let previous = await page.locator(selector).boundingBox();
  for (let i = 0; i < 40; i++) {
    await page.waitForTimeout(120);
    const current = await page.locator(selector).boundingBox();
    if (JSON.stringify(current) === JSON.stringify(previous)) {
      return current;
    }

    previous = current;
  }

  return previous;
}

async function drawOnCanvas(points) {
  const box = await stableBox(id('cut-canvas'));
  const absolute = points.map(([x, y]) => [box.x + box.width * x, box.y + box.height * y]);
  await page.mouse.move(...absolute[0]);
  await page.mouse.down();
  for (const point of absolute.slice(1)) {
    await page.mouse.move(...point);
  }

  await page.mouse.up();
}

const circle = (cx, cy, rx, ry, count = 40) => Array.from({ length: count }, (_, i) => [cx + Math.cos((i / count) * Math.PI * 2) * rx, cy + Math.sin((i / count) * Math.PI * 2) * ry]);

async function saveSticker(expected) {
  await page.waitForSelector(id('decorate-step'), { timeout: 120000 });
  await idle();
  await tap('save-sticker');
  await waitForStickers(expected);
}

await page.goto(URL);
await page.waitForSelector(id('home-screen'));
console.log(`engine: ${await page.evaluate(() => navigator.userAgent)}`);
console.log(`capabilities: ${JSON.stringify(await page.evaluate(() => ({ webgl: !!document.createElement('canvas').getContext('webgl'), webgl2: !!document.createElement('canvas').getContext('webgl2'), wasm: typeof WebAssembly === 'object', canvasWebp: document.createElement('canvas').toDataURL('image/webp').startsWith('data:image/webp') })))}`);

await step('on first launch the UI is Chinese on a Chinese system and English on any other', async () => {
  // Each context has its own storage, so the app starts as on a fresh install, with the language setting at "follow the system".
  for (const [locale, lang, label] of [['zh-CN', 'zh-CN', '新建贴图包'], ['zh-TW', 'zh-CN', '新建贴图包'], ['en-US', 'en', 'New sticker pack'], ['fr-FR', 'en', 'New sticker pack']]) {
    const fresh = await browser.newContext({ ...devices[engine.device], locale });
    const freshPage = await fresh.newPage();
    const started = Date.now();
    await freshPage.goto(URL);
    // A fresh context fetches the WASM module and the model again; under load (the Android suite running alongside) that
    // takes longer than the default 30 s, so wait as long as the other heavy steps do.
    await freshPage.waitForSelector(id('home-screen'), { timeout: 120000 });
    console.log(`      ${locale}: loaded in ${Date.now() - started} ms`);
    const shown = await freshPage.evaluate((selector) => [document.documentElement.lang, document.querySelector(selector).textContent.trim()], id('create-pack'));
    assert(shown[0] === lang && shown[1] === label, `system language ${locale} shows ${JSON.stringify(shown)}`);
    await fresh.close();
  }
});

await step('create a pack', async () => {
  await tap('create-pack');
  await page.fill(id('pack-name'), `${engine.label} Pack`);
  await page.fill(id('pack-author'), 'Tester');
  await tap('pack-form-submit');
  await page.waitForSelector(id('maker-screen'));
});

await step('freehand cut, outline and a text layer produce a 512x512 WebP sticker', async () => {
  await chooseSource('add-sticker', 'file', 'cat.jpg');
  await page.waitForSelector(id('cut-canvas'));
  await idle();
  await drawOnCanvas(circle(0.5, 0.45, 0.3, 0.2));
  await page.waitForSelector(id('decorate-step'));
  await idle();
  await tap('open-outline');
  await page.locator(id('outline-color')).nth(2).click();
  await page.locator(id('outline-width')).evaluate((range) => {
    range.value = 18;
    range.dispatchEvent(new CustomEvent('ionInput', { detail: { value: 18 } }));
    range.dispatchEvent(new CustomEvent('ionChange', { detail: { value: 18 } }));
  });
  await page.waitForTimeout(600);
  // The third color is red #d93036.
  assertOutlineLooksRight(await page.evaluate(outlineStatsExpression([0xd9, 0x30, 0x36])));
  await tap('outline-close');
  await tap('add-text');
  await page.fill(`${id('text-input')} textarea`, 'Meow!');
  await page.waitForSelector(id('text-preview'));
  await tap('text-save');
  await page.waitForSelector(id('text-layer'));
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUTPUT}/${prefix}-01-decorate.png` });
  await saveSticker(1);
  const [sticker] = (await inspectStickers()).stickers;
  assert(sticker.webp && sticker.width === 512 && sticker.height === 512 && sticker.bytes <= 100 * 1024, `unexpected sticker ${JSON.stringify(sticker)}`);
});

await step('rectangle, ellipse, polygon, select all and rotate', async () => {
  await chooseSource('add-sticker', 'file', 'cat.jpg');
  await page.waitForSelector(id('cut-canvas'));
  await tap('cut-tool-rect');
  await drawOnCanvas([[0.25, 0.3], [0.5, 0.45], [0.75, 0.6]]);
  await saveSticker(2);

  await chooseSource('add-sticker', 'file', 'cat.jpg');
  await page.waitForSelector(id('cut-canvas'));
  await tap('cut-tool-ellipse');
  await drawOnCanvas([[0.2, 0.3], [0.5, 0.45], [0.8, 0.62]]);
  await saveSticker(3);

  await chooseSource('add-sticker', 'file', 'cat.jpg');
  await page.waitForSelector(id('cut-canvas'));
  await tap('cut-tool-polygon');
  for (const point of [[0.5, 0.3], [0.75, 0.45], [0.6, 0.62], [0.3, 0.55], [0.5, 0.3]]) {
    await drawOnCanvas([point]);
  }

  await saveSticker(4);

  await chooseSource('add-sticker', 'file', 'cat.jpg');
  await page.waitForSelector(id('cut-canvas'));
  await tap('cut-rotate');
  await idle();
  await tap('cut-select-all');
  await saveSticker(5);
});

await step('smart select segments the subject with the on-device model', async () => {
  await chooseSource('add-sticker', 'file', 'cat.jpg');
  await page.waitForSelector(id('cut-canvas'));
  await idle();
  await tap('cut-smart');
  await page.waitForSelector(id('decorate-step'), { timeout: 180000 });
  await idle();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUTPUT}/${prefix}-02-smart-select.png` });
  await saveSticker(6);
});

await step('text-only sticker with all four styles and a custom font', async () => {
  await tap('maker-back');
  await tap('home-settings');
  await tap('setting-fonts');
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), tap('font-add')]);
  await chooser.setFiles(`${FIXTURES}/font.ttf`);
  await page.waitForSelector(id('font-row'));
  await tap('fonts-back');
  await tap('settings-back');
  await tap('pack-row');

  await chooseSource('add-sticker', 'text');
  for (const [index, style] of ['background', 'stroke', 'plain', 'rainbow'].entries()) {
    if (index > 0) {
      await tap('add-text');
    }

    await page.fill(`${id('text-input')} textarea`, `Style\n${style}`);
    while ((await page.locator(id('text-style')).getAttribute('data-style')) !== style) {
      await tap('text-style');
    }

    if (style === 'rainbow') {
      for (let i = 0; i < 12 && (await page.locator(id('text-font')).getAttribute('data-font')) !== 'custom:font.ttf'; i++) {
        await tap('text-font');
      }

      assert((await page.locator(id('text-font')).getAttribute('data-font')) === 'custom:font.ttf', 'custom font is selectable');
    }

    await page.waitForSelector(id('text-preview'));
    await tap('text-save');
    await page.waitForFunction((expected) => document.querySelectorAll('[data-testid="text-layer"]').length === expected, index + 1);
    const layer = await page.locator(id('text-layer')).last().boundingBox();
    await page.mouse.move(layer.x + layer.width / 2, layer.y + layer.height / 2);
    await page.mouse.down();
    await page.mouse.move(layer.x + layer.width / 2, layer.y + layer.height / 2 + (index - 1.5) * 90, { steps: 4 });
    await page.mouse.up();
  }

  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUTPUT}/${prefix}-03-text-styles.png` });
  await tap('save-sticker');
  await waitForStickers(7);
});

await step('tray icon and emoji tags', async () => {
  await chooseSource('tray-slot', 'file', 'cat.jpg');
  await page.waitForSelector(id('cut-canvas'));
  await tap('cut-select-all');
  await page.waitForSelector(id('decorate-step'));
  await idle();
  await tap('save-sticker');
  await page.waitForSelector(`${id('tray-slot')} img`);

  await page.locator(id('sticker-slot')).first().click();
  await tap('sheet-item-emoji');
  for (const index of [0, 1, 2, 3]) {
    await page.locator(id('emoji-option')).nth(index).click();
  }

  await page.screenshot({ path: `${OUTPUT}/${prefix}-05-emoji.png` });

  await tap('emoji-save');
  await page.waitForFunction(() => document.querySelector('[data-testid="sticker-slot"] .slot-emojis'));
  // The UI updates before the index file: wait until the emoji is written to the index before checking.
  let report = await inspectStickers();
  for (let i = 0; i < 20 && report.stickers[0].emojis.length === 0; i++) {
    await page.waitForTimeout(250);
    report = await inspectStickers();
  }

  assert(report.stickers[0].emojis.length === 3, `emoji tags ${JSON.stringify(report.stickers[0].emojis)}`);
  assert(/^tray_.*\.png$/.test(report.packs[0].trayIcon), 'tray icon is stored');
});

let exportedPath;

await step('share exports a .wastickers archive, and it can be imported again', async () => {
  await tap('maker-menu');
  const [download] = await Promise.all([page.waitForEvent('download', { timeout: 120000 }), tap('sheet-item-share')]);
  exportedPath = `${OUTPUT}/${prefix}-export.wastickers`;
  await download.saveAs(exportedPath);
  await idle();
  const entries = Object.keys(unzipSync(readFileSync(exportedPath))).sort();
  assert(entries.includes('title.txt') && entries.includes('author.txt') && entries.includes('tray.png') && entries.filter((name) => name.endsWith('.webp')).length === 7, `archive entries ${entries}`);

  await tap('maker-back');
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), tap('home-import')]);
  await chooser.setFiles(exportedPath);
  await page.waitForSelector(id('maker-screen'), { timeout: 120000 });
  await idle();
  assert((await stickerCount()) === 7, 'imported pack has seven stickers');
  await tap('maker-back');
});

await step('animated stickers from a GIF and an animated WebP stay within 500 KB', async () => {
  await tap('create-pack');
  await page.fill(id('pack-name'), `${engine.label} Anim`);
  await page.fill(id('pack-author'), 'Tester');
  await tap('pack-form-submit');
  await page.waitForSelector(id('maker-screen'));
  await chooseSource('add-sticker', 'file', 'cat.gif');
  await waitForStickers(1);
  await chooseSource('add-sticker', 'file', 'small-anim.webp');
  await waitForStickers(2);
  const stickers = (await inspectStickers()).stickers.filter((sticker) => sticker.pack === `${engine.label} Anim`);
  assert(stickers.length === 2 && stickers.every((sticker) => sticker.animated && sticker.frames > 1 && sticker.width === 512 && sticker.bytes <= 500 * 1024), `unexpected stickers ${JSON.stringify(stickers)}`);
});

await step('animated sticker from an MP4 video', async () => {
  await chooseSource('add-sticker', 'file', 'clip.mp4');
  await waitForStickers(3);
});

await step('mixed pack: delivery wraps the static sticker and generates the tray icon', async () => {
  const before = await stickerCount();
  await chooseSource('add-sticker', 'text');
  await page.fill(`${id('text-input')} textarea`, 'Static');
  await page.waitForSelector(id('text-preview'));
  await tap('text-save');
  await page.waitForSelector(id('text-layer'));
  await tap('save-sticker');
  await waitForStickers(before + 1);

  await tap('maker-menu');
  const [download] = await Promise.all([page.waitForEvent('download', { timeout: 120000 }), tap('sheet-item-share')]);
  await download.saveAs(`${OUTPUT}/${prefix}-anim.wastickers`);
  await idle();
  const report = await inspectStickers();
  const pack = report.packs.find((item) => item.name === `${engine.label} Anim`);
  const stickers = report.stickers.filter((sticker) => sticker.pack === `${engine.label} Anim`);
  assert(pack.animated && pack.trayIcon, `pack state ${JSON.stringify(pack)}`);
  assert(stickers.at(-1).wrapped && stickers.at(-1).frames === 2, `wrapped sticker ${JSON.stringify(stickers.at(-1))}`);
  await tap('maker-back');
});

await step('backup and restore', async () => {
  const before = (await inspectStickers()).packs;
  await tap('home-settings');
  const [download] = await Promise.all([page.waitForEvent('download', { timeout: 120000 }), tap('setting-backup')]);
  await download.saveAs(`${OUTPUT}/${prefix}-backup.ppeelybackup`);
  await idle();
  await tap('setting-delete-all');
  await tap('confirm-ok');
  await page.waitForTimeout(500);
  assert((await inspectStickers()).packs.length === 0, 'all packs deleted');
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), tap('setting-restore')]);
  await chooser.setFiles(`${OUTPUT}/${prefix}-backup.ppeelybackup`);
  await page.waitForFunction(() => /Restored/.test(document.querySelector('[data-testid="toast"]')?.message ?? ''), null, { timeout: 120000 });
  const after = (await inspectStickers()).packs;
  assert(JSON.stringify(after.map((pack) => [pack.name, pack.stickers])) === JSON.stringify(before.map((pack) => [pack.name, pack.stickers])), `restored packs ${JSON.stringify(after)}`);
  await tap('settings-back');
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUTPUT}/${prefix}-04-home.png` });
});

const summary = await inspectStickers();
writeFileSync(`${OUTPUT}/${prefix}-report.json`, JSON.stringify(summary, null, 2));
const outlineFallback = consoleLines.some((line) => line.includes('outline shader failed'));
console.log(`outline renderer: ${outlineFallback ? '2D canvas fallback' : 'WebGL shader'}`);

const failed = results.filter((result) => !result.ok);
const exceptions = consoleLines.filter((line) => line.startsWith('[exception]'));
if (exceptions.length > 0) {
  console.log(`uncaught exceptions:\n${exceptions.join('\n')}`);
}

console.log(`\n${results.length - failed.length} passed, ${failed.length} failed`);
await browser.close();
process.exit(failed.length > 0 ? 1 : 0);
