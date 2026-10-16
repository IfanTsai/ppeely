// UI actions reused across the end-to-end tests.
import { sleep } from './cdp.mjs';
import { queueFile, testId } from './helpers.mjs';

export async function createPack(session, name, author) {
  await session.tap(testId('create-pack'));
  await session.type(testId('pack-name'), name);
  await session.type(testId('pack-author'), author);
  await session.tap(testId('pack-form-submit'));
  await session.waitForSelector(testId('maker-screen'));
}

// Taps a slot and picks a source; when `file` is given, hands it to the file input.
export async function chooseSource(session, slot, source, file) {
  if (file) {
    await queueFile(session, file.path, file.name, file.type);
  }

  await session.tap(testId(slot));
  await session.tap(testId(`sheet-item-${source}`));
}

// A validation message appears in the create or rename dialog.
export async function waitForPackFormError(session) {
  await session.waitFor(`(document.querySelector('${testId('pack-form')} .alert-message')?.textContent ?? '').trim().length > 0`);
}

// Sets the value of an Ionic range and fires, in order, the events for a user drag (ionInput) and release (ionChange).
export async function setRange(session, selector, value) {
  await session.evaluate(`(() => {
    const range = document.querySelector(${JSON.stringify(selector)});
    range.value = ${value};
    range.dispatchEvent(new CustomEvent('ionInput', { detail: { value: ${value} } }));
    range.dispatchEvent(new CustomEvent('ionChange', { detail: { value: ${value} } }));
  })()`);
}

// Reads the text of the current toast; returns an empty string if there is no toast.
export const toastMessage = `(document.querySelector('${testId('toast')}')?.message ?? '')`;

export async function waitIdle(session, timeoutMs = 120000) {
  await sleep(150);
  await session.waitFor(`!document.querySelector('${testId('busy')}')`, { timeoutMs });
}

// Drags a path on the cut canvas through the given relative coordinates (0–1).
export async function dragOnCanvas(session, selector, relativePoints) {
  const rect = await session.stableRect(selector);
  const points = relativePoints.map(([x, y]) => ({ x: rect.x + rect.width * x, y: rect.y + rect.height * y }));
  await session.touchPath(points);
}

export function circlePoints(centerX, centerY, radiusX, radiusY, count = 48) {
  return Array.from({ length: count }, (_, index) => {
    const angle = (index / count) * Math.PI * 2;

    return [centerX + Math.cos(angle) * radiusX, centerY + Math.sin(angle) * radiusY];
  });
}

export async function stickerCount(session) {
  return session.evaluate(`document.querySelectorAll('${testId('sticker-slot')}').length`);
}

export async function waitForStickerCount(session, count, timeoutMs = 180000) {
  await session.waitFor(`document.querySelectorAll('${testId('sticker-slot')}').length === ${count} && !document.querySelector('${testId('busy')}')`, { timeoutMs });
}

// Confirms the text input and waits for its modal to fully close (closing is animated, and the input stays in the page meanwhile).
export async function saveText(session) {
  await session.tap(testId('text-save'));
  await session.waitFor(`!document.querySelector('${testId('text-editor')}')`);
}

export async function addText(session, text, { styleClicks = 0, fontClicks = 0, colorIndex = 0 } = {}) {
  if (!(await session.evaluate(`!!document.querySelector('${testId('text-editor')}')`))) {
    await session.tap(testId('add-text'));
  }

  await session.waitForSelector(testId('text-input'));
  await session.type(testId('text-input'), text);
  for (let i = 0; i < styleClicks; i++) {
    await session.tap(testId('text-style'));
  }

  for (let i = 0; i < fontClicks; i++) {
    await session.tap(testId('text-font'));
  }

  if (colorIndex > 0) {
    await session.tap(`${testId('text-color')}:nth-of-type(${colorIndex + 1})`);
  }

  await session.waitForSelector(testId('text-preview'));
}
