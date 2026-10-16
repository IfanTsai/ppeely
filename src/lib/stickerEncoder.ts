// Encodes editing results into sticker files that meet WhatsApp's specifications.
import {
  STATIC_STICKER_MAX_BYTES,
  STATIC_STICKER_QUALITY,
  STICKER_SIZE,
  TRAY_ICON_MAX_BYTES,
  TRAY_ICON_SIZE,
} from './constants';
import { canvasToPng, canvasToRgba, createCanvas, fitToSquare, trimTransparent } from './image';
import { encodeWebp } from './webp';

// How much to lower the quality each time the size limit is exceeded, and the lowest quality allowed.
const QUALITY_STEP = 10;
const QUALITY_FLOOR = 10;

// Trims transparent edges, then scales proportionally to 512×512 and centers, so the sticker content fills the canvas.
export function normalizeSticker(source: HTMLCanvasElement): HTMLCanvasElement {
  const trimmed = trimTransparent(source);
  if (!trimmed) {
    throw new Error('sticker image is fully transparent');
  }

  return fitToSquare(trimmed, trimmed.width, trimmed.height, STICKER_SIZE);
}

// Encodes a static sticker. First encode at the default quality; WhatsApp rejects static stickers larger than 100 KB,
// so when over the limit, lower the quality step by step and re-encode.
export async function encodeStaticSticker(sticker: HTMLCanvasElement): Promise<Uint8Array> {
  if (sticker.width !== STICKER_SIZE || sticker.height !== STICKER_SIZE) {
    throw new Error(`sticker canvas must be ${STICKER_SIZE}x${STICKER_SIZE}`);
  }

  const rgba = canvasToRgba(sticker);
  let encoded = await encodeWebp(rgba, STICKER_SIZE, STICKER_SIZE, STATIC_STICKER_QUALITY);

  for (
    let quality = STATIC_STICKER_QUALITY - QUALITY_STEP;
    encoded.length > STATIC_STICKER_MAX_BYTES && quality >= QUALITY_FLOOR;
    quality -= QUALITY_STEP
  ) {
    encoded = await encodeWebp(rgba, STICKER_SIZE, STICKER_SIZE, quality);
  }

  if (encoded.length > STATIC_STICKER_MAX_BYTES) {
    throw new Error('sticker is too complex to fit in 100 KB');
  }

  return encoded;
}

// Generates a 96×96 PNG tray icon.
export async function encodeTrayIcon(source: CanvasImageSource, sourceWidth: number, sourceHeight: number): Promise<Uint8Array> {
  const icon = fitToSquare(source, sourceWidth, sourceHeight, TRAY_ICON_SIZE);

  const png = await canvasToPng(icon);
  if (png.length > TRAY_ICON_MAX_BYTES) {
    throw new Error('tray icon exceeds 50 KB');
  }

  return png;
}

// A fully transparent 512×512 sticker, used to pad sticker packs with fewer than 3 stickers to the count WhatsApp requires.
export async function encodeBlankSticker(): Promise<Uint8Array> {
  const canvas = createCanvas(STICKER_SIZE, STICKER_SIZE);

  return encodeWebp(canvasToRgba(canvas), STICKER_SIZE, STICKER_SIZE, STATIC_STICKER_QUALITY);
}
