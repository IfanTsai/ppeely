// Geometry and cutout logic for the cut step. All coordinates are pixel coordinates of the working image, independent of on-screen zoom.
import { createCanvas, context2d, fitToSquare, trimTransparent } from './image';

export type SelectorType = 'freehand' | 'rect' | 'ellipse' | 'polygon';

export interface Point {
  x: number;
  y: number;
}

// Side length of the cutout result, in pixels; twice the sticker side length, to leave precision for the later outline and scaling.
export const CUTOUT_SIZE = 1024;

// Minimum number of points a freehand drawing must collect; this many or fewer is treated as an accidental touch.
export const FREEHAND_MIN_POINTS = 5;

// Freehand outline: quadratic Bézier curves using the sample points as control points and the midpoints between adjacent points as anchors, closing back to the start.
export function freehandPath(points: Point[]): Path2D {
  const path = new Path2D();
  if (points.length === 0) {
    return path;
  }

  const first = points[0];
  let previous = first;
  path.moveTo(first.x, first.y);

  for (let i = 1; i < points.length; i++) {
    const point = points[i];
    path.quadraticCurveTo(previous.x, previous.y, (previous.x + point.x) / 2, (previous.y + point.y) / 2);
    previous = point;
  }

  path.quadraticCurveTo((previous.x + first.x) / 2, (previous.y + first.y) / 2, first.x, first.y);
  path.closePath();

  return path;
}

// Rectangles and ellipses are defined by the press point and release point as opposite corners; width and height need not be equal.
export function rectPath(a: Point, b: Point): Path2D {
  const path = new Path2D();
  path.rect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(a.x - b.x), Math.abs(a.y - b.y));

  return path;
}

export function ellipsePath(a: Point, b: Point): Path2D {
  const path = new Path2D();
  path.ellipse((a.x + b.x) / 2, (a.y + b.y) / 2, Math.abs(a.x - b.x) / 2, Math.abs(a.y - b.y) / 2, 0, 0, Math.PI * 2);

  return path;
}

export function polygonPath(points: Point[]): Path2D {
  const path = new Path2D();
  points.forEach((point, index) => (index === 0 ? path.moveTo(point.x, point.y) : path.lineTo(point.x, point.y)));
  path.closePath();

  return path;
}

// Rotates 90° clockwise.
export function rotateClockwise(image: HTMLCanvasElement): HTMLCanvasElement {
  const rotated = createCanvas(image.height, image.width);
  const context = context2d(rotated);
  context.translate(rotated.width, 0);
  context.rotate(Math.PI / 2);
  context.drawImage(image, 0, 0);

  return rotated;
}

// Cuts out along a path: fill the path with anti-aliasing, then draw the original image with source-in, making pixels outside the path transparent.
// A null `path` means select-all. The result is trimmed of transparent edges, then scaled proportionally and centered on 1024×1024; returns null when the selection has no content.
export function cutoutWithPath(image: HTMLCanvasElement, path: Path2D | null): HTMLCanvasElement | null {
  const canvas = createCanvas(image.width, image.height);
  const context = context2d(canvas, true);

  if (path) {
    context.fillStyle = '#000';
    context.fill(path);
    context.globalCompositeOperation = 'source-in';
  }

  context.drawImage(image, 0, 0);

  return finishCutout(canvas);
}

// Cuts out by mask: `mask` is a canvas the same size as the image, and only its alpha channel is used.
export function cutoutWithMask(image: HTMLCanvasElement, mask: HTMLCanvasElement): HTMLCanvasElement | null {
  const canvas = createCanvas(image.width, image.height);
  const context = context2d(canvas, true);
  context.drawImage(image, 0, 0);
  context.globalCompositeOperation = 'destination-in';
  context.drawImage(mask, 0, 0, image.width, image.height);

  return finishCutout(canvas);
}

function finishCutout(canvas: HTMLCanvasElement): HTMLCanvasElement | null {
  const trimmed = trimTransparent(canvas);
  if (!trimmed) {
    return null;
  }

  return fitToSquare(trimmed, trimmed.width, trimmed.height, CUTOUT_SIZE);
}
