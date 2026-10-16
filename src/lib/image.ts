// Basic bitmap helpers: decoding, trimming transparent edges, and scaling proportionally onto a square canvas.
import { blobToBytes } from './bytes';

// Maximum side length of images handled by the editor, in pixels; larger images are scaled down proportionally first to avoid using too much memory.
export const WORKING_IMAGE_MAX_SIZE = 2000;

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function createCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));

  return canvas;
}

export function context2d(canvas: HTMLCanvasElement, willReadFrequently = false): CanvasRenderingContext2D {
  const context = canvas.getContext('2d', { willReadFrequently });
  if (!context) {
    throw new Error('2D canvas context is not available');
  }

  return context;
}

// Decodes an image file into a canvas, scaling it down proportionally when the long side exceeds the limit; applies the EXIF orientation.
export async function decodeImage(blob: Blob, maxSize = WORKING_IMAGE_MAX_SIZE): Promise<HTMLCanvasElement> {
  const bitmap = await decodeBitmap(blob);

  try {
    const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
    const canvas = createCanvas(bitmap.width * scale, bitmap.height * scale);
    const context = context2d(canvas);
    context.imageSmoothingQuality = 'high';
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

    return canvas;
  } finally {
    if ('close' in bitmap) {
      bitmap.close();
    }
  }
}

// Finds the smallest bounding rectangle of non-transparent pixels and crops to it; returns null when the whole image is transparent.
export function trimTransparent(canvas: HTMLCanvasElement): HTMLCanvasElement | null {
  const bounds = opaqueBounds(context2d(canvas, true).getImageData(0, 0, canvas.width, canvas.height));
  if (!bounds) {
    return null;
  }

  const trimmed = createCanvas(bounds.width, bounds.height);
  context2d(trimmed).drawImage(canvas, -bounds.x, -bounds.y);

  return trimmed;
}

function opaqueBounds(image: ImageData): Rect | null {
  const { data, width, height } = image;
  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;

  for (let y = 0; y < height; y++) {
    const row = y * width * 4;
    for (let x = 0; x < width; x++) {
      if (data[row + x * 4 + 3] !== 0) {
        if (x < left) left = x;
        if (x > right) right = x;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
      }
    }
  }

  if (right < 0) {
    return null;
  }

  return { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
}

// Computes the target rectangle that fits source, scaled proportionally, entirely inside a size×size canvas and centered; small images are scaled up.
export function containRect(sourceWidth: number, sourceHeight: number, size: number): Rect {
  const scale = size / Math.max(sourceWidth, sourceHeight);
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));

  return { x: Math.round((size - width) / 2), y: Math.round((size - height) / 2), width, height };
}

// Scales proportionally by the long side into a transparent size×size canvas and centers it.
export function fitToSquare(source: CanvasImageSource, sourceWidth: number, sourceHeight: number, size: number): HTMLCanvasElement {
  const canvas = createCanvas(size, size);
  const rect = containRect(sourceWidth, sourceHeight, size);
  const context = context2d(canvas);
  context.imageSmoothingQuality = 'high';
  context.drawImage(source, rect.x, rect.y, rect.width, rect.height);

  return canvas;
}

export function canvasToRgba(canvas: HTMLCanvasElement): Uint8Array {
  const { data } = context2d(canvas, true).getImageData(0, 0, canvas.width, canvas.height);

  return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
}

export function rgbaToCanvas(rgba: Uint8Array, width: number, height: number): HTMLCanvasElement {
  const canvas = createCanvas(width, height);
  context2d(canvas).putImageData(new ImageData(new Uint8ClampedArray(rgba), width, height), 0, 0);

  return canvas;
}

export async function canvasToPng(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) {
    throw new Error('failed to encode PNG image');
  }

  return blobToBytes(blob);
}

async function decodeBitmap(blob: Blob): Promise<ImageBitmap | HTMLImageElement> {
  try {
    return await createImageBitmap(blob, { imageOrientation: 'from-image' });
  } catch {
    // A few formats (e.g. SVG on some WebViews) aren't supported by createImageBitmap; fall back to decoding with <img>.
    return decodeWithImageElement(blob);
  }
}

async function decodeWithImageElement(blob: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(blob);

  try {
    const image = new Image();
    image.src = url;
    await image.decode();

    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}
