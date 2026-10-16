// Stage model and final compositing for the editor's second step.
//
// The stage coordinate system has its origin at the center of the base image, which occupies the square [-512, 512] (1024 units per side).
// Text layers are described by center position, scale and rotation, and may extend beyond the base image. Compositing draws the base image at the bottom and layers on top in stacking order,
// then trims transparent edges and scales to 512×512. Compositing happens on a fixed-resolution canvas, so the result does not depend on the device screen.
import { CUTOUT_SIZE } from './cutout';
import { context2d, createCanvas } from './image';
import { normalizeSticker } from './stickerEncoder';
import type { TextConfig } from './textRender';

export interface TextLayer {
  id: number;
  config: TextConfig;
  bitmap: HTMLCanvasElement;
  // Position of the layer center in stage coordinates.
  x: number;
  y: number;
  scale: number;
  // Rotation angle in radians.
  rotation: number;
}

// Allowed layer scale range.
export const LAYER_MIN_SCALE = 0.5;
export const LAYER_MAX_SCALE = 10;

// Maximum side length of the compositing canvas, in pixels.
const MAX_COMPOSE_SIZE = 4096;

// `base` is the 1024×1024 base image with its outline; null in text-only mode. Returns a 512×512 sticker canvas; throws when there is no visible content.
export function composeSticker(base: HTMLCanvasElement | null, layers: TextLayer[]): HTMLCanvasElement {
  const half = CUTOUT_SIZE / 2;

  // The canvas must hold the base image and all layers: estimate the extent from each layer's bounding circle after rotation and scaling.
  let extent = half;
  for (const layer of layers) {
    const reach = (Math.hypot(layer.bitmap.width, layer.bitmap.height) / 2) * layer.scale;
    extent = Math.max(extent, Math.abs(layer.x) + reach, Math.abs(layer.y) + reach);
  }

  // The extent can get large when layers are scaled up or dragged far away, so cap the compositing canvas size and draw everything scaled down when it is exceeded.
  const fit = Math.min(1, MAX_COMPOSE_SIZE / (extent * 2));
  const size = Math.ceil(extent * 2 * fit);
  const canvas = createCanvas(size, size);
  const context = context2d(canvas, true);
  context.imageSmoothingQuality = 'high';
  context.translate(size / 2, size / 2);
  context.scale(fit, fit);

  if (base) {
    context.drawImage(base, -half, -half, CUTOUT_SIZE, CUTOUT_SIZE);
  }

  for (const layer of layers) {
    context.save();
    context.translate(layer.x, layer.y);
    context.rotate(layer.rotation);
    context.scale(layer.scale, layer.scale);
    context.drawImage(layer.bitmap, -layer.bitmap.width / 2, -layer.bitmap.height / 2);
    context.restore();
  }

  return normalizeSticker(canvas);
}
