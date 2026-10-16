// End-to-end tests (part 1): sticker pack management, every editor tool, animated stickers.
// Usage: node e2e/run-editor.mjs, or ./scripts/android-test.sh to run all Android suites on an emulator; see e2e/config.mjs for the options.
import { mkdirSync, writeFileSync } from 'node:fs';
import { adb, connect, deviceScreenshot, launchApp, sleep } from './cdp.mjs';
import { FIXTURES, OUTPUT, selected } from './config.mjs';
import { assert, assertEqual, installFilePicker, readAppFile, readPackIndex, testId } from './helpers.mjs';
import { assertOutlineLooksRight, outlineStatsExpression } from './outline-check.mjs';
import * as steps from './steps.mjs';

mkdirSync(OUTPUT, { recursive: true });

const photo = { path: `${FIXTURES}/cat.jpg`, name: 'cat.jpg', type: 'image/jpeg' };
const results = [];

launchApp({ clear: true });
const session = await connect();
await session.waitForSelector(testId('home-screen'));
await installFilePicker(session);

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
    results.push({ name, ok: false, error: error.message });
    console.log(`FAIL  ${name}: ${error.message}`);
    console.log(`      recent events: ${await session.evaluate('JSON.stringify(window.__e2eEvents ?? [])').catch(() => 'unavailable')}`);
    deviceScreenshot(`${OUTPUT}/fail-${results.length}.png`);
    await recover();
  }
}

// After a step fails, return to the sticker pack screen so later steps can continue: close dialogs and modals in turn.
async function recover() {
  for (let i = 0; i < 6; i++) {
    const closed = await session.evaluate(`(async () => {
      const overlay = [...document.querySelectorAll('ion-alert, ion-action-sheet, ion-loading, ion-modal')].pop();
      if (!overlay) return false;
      await overlay.dismiss();
      return true;
    })()`);
    if (!closed) {
      return;
    }

    await sleep(400);
  }
}

const shot = (name) => deviceScreenshot(`${OUTPUT}/${name}.png`);

async function openEditorWithPhoto(slot = 'add-sticker') {
  await steps.chooseSource(session, slot, 'file', photo);
  await session.waitForSelector(testId('cut-canvas'));
  await steps.waitIdle(session);
  await sleep(300);
}

async function saveSticker(expectedCount) {
  await session.waitForSelector(testId('decorate-step'), { timeoutMs: 60000 });
  await steps.waitIdle(session);
  await sleep(500);
  await session.tap(testId('save-sticker'));
  await steps.waitForStickerCount(session, expectedCount);
}

const currentPack = () => readPackIndex().packs[0];

await step('create pack: short name is rejected, valid input opens the maker', async () => {
  await session.tap(testId('create-pack'));
  await session.type(testId('pack-name'), 'ab');
  await session.type(testId('pack-author'), 'Tester');
  await session.tap(testId('pack-form-submit'));
  await steps.waitForPackFormError(session);
  await session.tap(testId('pack-form-cancel'));
  await steps.createPack(session, 'Cat Pack', 'Tester');
  assertEqual(currentPack().name, 'Cat Pack', 'pack name');
});

await step('freehand cut with outline color and width, plus a text layer', async () => {
  await openEditorWithPhoto();
  shot('01-cut-step');
  await steps.dragOnCanvas(session, testId('cut-canvas'), steps.circlePoints(0.5, 0.45, 0.32, 0.2));
  await session.waitForSelector(testId('decorate-step'));
  await steps.waitIdle(session);
  await session.tap(testId('open-outline'));
  await session.tap(`${testId('outline-color')}:nth-of-type(3)`);
  await steps.setRange(session, testId('outline-width'), 18);
  await sleep(600);
  // The third color is red #d93036.
  assertOutlineLooksRight(await session.evaluate(outlineStatsExpression([0xd9, 0x30, 0x36])));
  await session.tap(testId('outline-close'));
  await steps.addText(session, 'Meow!');
  shot('02-text-editor');
  await steps.saveText(session);
  await session.waitForSelector(testId('text-layer'));
  // New text starts in the middle of the sticker, on the kitten's face; move it down onto its paws, still inside the cutout,
  // like a caption. This screenshot is also used in the README.
  const cutout = await session.stableRect(testId('stage-base'));
  const label = await session.stableRect(testId('text-layer'));
  const from = { x: label.x + label.width / 2, y: label.y + label.height / 2 };
  const to = { x: cutout.x + cutout.width / 2, y: cutout.y + cutout.height * 0.8 };
  await session.touchPath([from, { x: from.x, y: from.y - 10 }, to, to]);
  await sleep(400);
  shot('03-decorate-step');
  await saveSticker(1);
});

await step('rectangle cut', async () => {
  await openEditorWithPhoto();
  await session.tap(testId('cut-tool-rect'));
  await steps.dragOnCanvas(session, testId('cut-canvas'), [[0.25, 0.3], [0.4, 0.4], [0.6, 0.5], [0.75, 0.6]]);
  await saveSticker(2);
});

await step('ellipse cut', async () => {
  await openEditorWithPhoto();
  await session.tap(testId('cut-tool-ellipse'));
  await steps.dragOnCanvas(session, testId('cut-canvas'), [[0.2, 0.3], [0.5, 0.45], [0.8, 0.62]]);
  await saveSticker(3);
});

await step('polygon cut with undo', async () => {
  await openEditorWithPhoto();
  await session.tap(testId('cut-tool-polygon'));
  const canvas = testId('cut-canvas');
  const tapAt = (x, y) => steps.dragOnCanvas(session, canvas, [[x, y]]);
  await tapAt(0.5, 0.3);
  await tapAt(0.75, 0.45);
  await tapAt(0.9, 0.9);
  await session.tap(testId('cut-undo'));
  await tapAt(0.6, 0.62);
  await tapAt(0.3, 0.55);
  shot('04-polygon');
  await tapAt(0.5, 0.3);
  await saveSticker(4);
});

await step('select all keeps the whole image and defaults to no outline', async () => {
  await openEditorWithPhoto();
  await session.tap(testId('cut-select-all'));
  await saveSticker(5);
});

await step('rotate then smart select finds the subject', async () => {
  await openEditorWithPhoto();
  await session.tap(testId('cut-rotate'));
  await steps.waitIdle(session);
  for (let i = 0; i < 3; i++) {
    await session.tap(testId('cut-rotate'));
    await steps.waitIdle(session);
  }

  await session.tap(testId('cut-smart'));
  await session.waitForSelector(testId('decorate-step'), { timeoutMs: 120000 });
  await steps.waitIdle(session);
  await sleep(600);
  shot('05-smart-select');
  await saveSticker(6);
});

await step('text-only sticker: four styles, fonts, colors, drag, pinch, tap-to-edit and delete', async () => {
  await steps.chooseSource(session, 'add-sticker', 'text');
  await steps.addText(session, 'Hello\nWorld', { styleClicks: 1, fontClicks: 1, colorIndex: 1 });
  assertEqual(await session.evaluate(`document.querySelector('${testId('text-style')}').dataset.style`), 'stroke', 'style after one click');
  await steps.saveText(session);
  await session.waitForSelector(testId('text-layer'));

  // The text input remembers the last style and font: two more clicks go from "outline" to "rainbow".
  await steps.addText(session, 'RAINBOW', { styleClicks: 2, fontClicks: 2 });
  assertEqual(await session.evaluate(`document.querySelector('${testId('text-style')}').dataset.style`), 'rainbow', 'style after two more clicks');
  await steps.saveText(session);
  await session.waitFor(`document.querySelectorAll('${testId('text-layer')}').length === 2`);

  // Drag the top layer down, then pinch with two fingers to scale and rotate it.
  const layer = await session.stableRect(`${testId('text-layer')}:last-of-type`);
  const cx = layer.x + layer.width / 2;
  const cy = layer.y + layer.height / 2;
  await session.touchPath([{ x: cx, y: cy }, { x: cx, y: cy + 60 }, { x: cx, y: cy + 150 }]);
  const pinch = (points) => session.send('Input.dispatchTouchEvent', { type: points.type, touchPoints: points.touches.map(([x, y], id) => ({ x, y, id })) });
  const y = cy + 150;
  await pinch({ type: 'touchStart', touches: [[cx - 20, y], [cx + 20, y]] });
  await pinch({ type: 'touchMove', touches: [[cx - 50, y - 10], [cx + 50, y + 10]] });
  await pinch({ type: 'touchMove', touches: [[cx - 80, y - 30], [cx + 80, y + 30]] });
  await pinch({ type: 'touchEnd', touches: [] });
  const transform = await session.evaluate(`document.querySelector('${testId('text-layer')}:last-of-type').style.transform`);
  assert(/scale\((?!1\))/.test(transform) && !/rotate\(0rad\)/.test(transform), `layer should be scaled and rotated: ${transform}`);
  shot('06-text-only');

  // Tap a layer to edit it again, clear its text and save, which removes the layer; then create another layer and drag it to the delete zone.
  const first = await session.stableRect(`${testId('text-layer')}:first-of-type`);
  await session.touchPath([{ x: first.x + first.width / 2, y: first.y + first.height / 2 }]);
  await session.waitForSelector(testId('text-input'));
  await session.type(testId('text-input'), 'Hi there');
  await steps.saveText(session);
  await steps.addText(session, 'bye');
  await steps.saveText(session);
  await session.waitFor(`document.querySelectorAll('${testId('text-layer')}').length === 3`);
  // Closing the soft keyboard changes the stage height; wait for the stage size to settle before computing the drag start and end points.
  await sleep(600);
  const stage = await session.stableRect(testId('stage'));
  const doomed = await session.stableRect(`${testId('text-layer')}:last-of-type`);
  const start = { x: doomed.x + doomed.width / 2, y: doomed.y + doomed.height / 2 };
  const zone = { x: stage.x + stage.width / 2, y: stage.y + stage.height - 49 };
  await session.touchPath([start, { x: start.x, y: start.y + 40 }, { x: zone.x, y: zone.y - 60 }, zone, zone]);
  await session.waitFor(`document.querySelectorAll('${testId('text-layer')}').length === 2`);
  await session.tap(testId('save-sticker'));
  await steps.waitForStickerCount(session, 7);
});

await step('tray icon is a 96x96 PNG', async () => {
  await openEditorWithPhoto('tray-slot');
  await session.tap(testId('cut-select-all'));
  await session.waitForSelector(testId('decorate-step'));
  await steps.waitIdle(session);
  await session.tap(testId('save-sticker'));
  await session.waitFor(`!!document.querySelector('${testId('tray-slot')} img') && !document.querySelector('${testId('busy')}')`);
  const pack = currentPack();
  const png = readAppFile(`packs/${pack.id}/${pack.trayIcon}`);
  assertEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [96, 96], 'tray icon size');
  assert(png.length <= 50 * 1024, 'tray icon within 50 KB');
});

await step('emoji tags keep the last three choices', async () => {
  const versionBefore = currentPack().imageDataVersion;
  await session.tap(testId('sticker-slot'));
  await session.tap(testId('sheet-item-emoji'));
  await session.waitForSelector(testId('emoji-picker'));

  // Swipe up on the emoji list: the list should scroll while the panel stays put; at the bottom, the last emoji is on screen.
  const pickerState = `(async () => {
    const content = document.querySelector('${testId('emoji-picker')}');
    const scroller = await content.getScrollElement();
    const last = [...content.querySelectorAll('${testId('emoji-option')}')].pop().getBoundingClientRect();
    return { scrollTop: scroller.scrollTop, maxScroll: scroller.scrollHeight - scroller.clientHeight, panelTop: Math.round(content.getBoundingClientRect().top), lastBottom: last.bottom, viewport: window.innerHeight };
  })()`;
  await sleep(500);
  const beforeSwipe = await session.evaluate(pickerState);
  assert(beforeSwipe.maxScroll > 0, `the emoji list is longer than the panel (${JSON.stringify(beforeSwipe)})`);
  const grid = await session.stableRect(testId('emoji-picker'));
  const from = await session.toDevicePixels(grid.x + grid.width / 2, grid.y + grid.height * 0.7);
  const to = await session.toDevicePixels(grid.x + grid.width / 2, grid.y + grid.height * 0.2);
  adb('shell', 'input', 'swipe', String(from.x), String(from.y), String(to.x), String(to.y), '400');
  await sleep(1200);
  const afterSwipe = await session.evaluate(pickerState);
  assert(afterSwipe.scrollTop > 50, `swiping scrolls the emoji list (${JSON.stringify(afterSwipe)})`);
  assertEqual(afterSwipe.panelTop, beforeSwipe.panelTop, 'the panel stays in place while the list scrolls');
  await session.evaluate(`document.querySelector('${testId('emoji-picker')}').scrollToBottom(0)`);
  await sleep(300);
  const atBottom = await session.evaluate(pickerState);
  assert(atBottom.lastBottom <= atBottom.viewport, `the last emoji is reachable (${JSON.stringify(atBottom)})`);
  await session.evaluate(`document.querySelector('${testId('emoji-picker')}').scrollToTop(0)`);
  await sleep(300);

  for (const index of [1, 2, 3, 4]) {
    await session.tap(`${testId('emoji-option')}:nth-of-type(${index})`);
  }

  await session.tap(testId('emoji-save'));
  await session.waitFor(`!document.querySelector('${testId('emoji-picker')}')`);
  await sleep(300);
  assertEqual(currentPack().stickers[0].emojis, ['\u{1F60D}', '\u{1F618}', '\u{1F495}'], 'emoji tags');
  assert(currentPack().imageDataVersion > versionBefore, 'changing emoji tags bumps the data version so WhatsApp reads the pack again');
});

await step('sticker library reuses an existing sticker as source', async () => {
  await steps.chooseSource(session, 'add-sticker', 'library');
  await session.waitForSelector(testId('library-sticker'));
  shot('07-library');
  await session.tap(testId('library-sticker'));
  await session.waitForSelector(testId('cut-canvas'));
  await steps.waitIdle(session);
  await session.tap(testId('cut-select-all'));
  await saveSticker(8);
});

await step('delete a sticker after confirmation', async () => {
  await session.tap(`${testId('sticker-slot')}:nth-of-type(8)`);
  await session.tap(testId('sheet-item-delete'));
  await session.tap(testId('confirm-ok'));
  await steps.waitForStickerCount(session, 7);
});

await step('all static stickers are 512x512 WebP within 100 KB', async () => {
  shot('08-maker-static');
  const pack = currentPack();
  assertEqual(pack.stickers.length, 7, 'sticker count');
  for (const sticker of pack.stickers) {
    const bytes = readAppFile(`packs/${pack.id}/${sticker.file}`);
    assertEqual(bytes.subarray(0, 4).toString() + bytes.subarray(8, 12).toString(), 'RIFFWEBP', `${sticker.file} signature`);
    assert(bytes.length <= 100 * 1024, `${sticker.file} is ${bytes.length} bytes`);
    assertEqual(bytes.length, sticker.size, `${sticker.file} recorded size`);
  }
});

await step('rename the pack', async () => {
  await session.tap(testId('maker-menu'));
  await session.tap(testId('sheet-item-rename'));
  await session.type(testId('pack-name'), 'Cat Pack 2');
  await session.tap(testId('pack-form-submit'));
  await session.waitFor(`document.querySelector('${testId('maker-title')}').textContent.includes('Cat Pack 2')`);
  await session.tap(testId('maker-back'));
  await session.waitFor(`!document.querySelector('${testId('maker-screen')}')`);
  shot('09-home');
});

await step('animated sticker from a GIF', async () => {
  await steps.createPack(session, 'Anim Pack', 'Tester');
  await steps.chooseSource(session, 'add-sticker', 'file', { path: `${FIXTURES}/cat.gif`, name: 'cat.gif', type: 'image/gif' });
  await steps.waitForStickerCount(session, 1, 300000);
});

await step('animated sticker from an MP4 video', async () => {
  await steps.chooseSource(session, 'add-sticker', 'file', { path: `${FIXTURES}/clip.mp4`, name: 'clip.mp4', type: 'video/mp4' });
  await steps.waitForStickerCount(session, 2, 300000);
});

await step('animated WebP: 512x512 input is kept as is, other sizes are re-encoded', async () => {
  const pack = currentPack();
  const existing = readAppFile(`packs/${pack.id}/${pack.stickers[0].file}`);
  writeFileSync(`${OUTPUT}/from-gif.webp`, existing);
  await steps.chooseSource(session, 'add-sticker', 'file', { path: `${OUTPUT}/from-gif.webp`, name: 'a.webp', type: 'image/webp' });
  await steps.waitForStickerCount(session, 3, 300000);
  const copied = currentPack().stickers[2];
  assertEqual(copied.size, existing.length, 'identical bytes for a 512x512 animated WebP');

  await steps.chooseSource(session, 'add-sticker', 'file', { path: `${FIXTURES}/small-anim.webp`, name: 'small.webp', type: 'image/webp' });
  await steps.waitForStickerCount(session, 4, 300000);
});

await step('a static sticker can live next to animated ones', async () => {
  await openEditorWithPhoto();
  await session.tap(testId('cut-select-all'));
  await saveSticker(5);
  shot('10-maker-animated');
  const pack = currentPack();
  assertEqual(pack.stickers.map((sticker) => sticker.animated), [true, true, true, true, false], 'animated flags');
  for (const sticker of pack.stickers.filter((item) => item.animated)) {
    assert(sticker.size <= 500 * 1024, `${sticker.file} is ${sticker.size} bytes`);
  }
});

const failed = results.filter((result) => !result.ok);
const errors = session.consoleLines.filter((line) => /^\[exception\]/.test(line));
if (errors.length > 0) {
  console.log(`\nuncaught exceptions in the page:\n${errors.join('\n')}`);
}

console.log(`\n${results.length - failed.length} passed, ${failed.length} failed`);
session.close();
process.exit(failed.length > 0 || errors.length > 0 ? 1 : 0);
