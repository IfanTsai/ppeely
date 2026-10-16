// Rendering for text layers: draws the text into a bitmap in one of four styles, used as a draggable layer.
import { cssFont, type FontChoice } from './fonts';
import { context2d, createCanvas, trimTransparent } from './image';

// The four drawing styles, in the order they are cycled through.
export const DRAW_STYLES = ['background', 'stroke', 'plain', 'rainbow'] as const;

export type DrawStyle = (typeof DRAW_STYLES)[number];

export interface ColorPair {
  // Background or outline color; the text fill color in the rainbow style.
  color1: string;
  // Text color; the inner outline color in the rainbow style.
  color2: string;
}

export interface TextConfig extends ColorPair {
  text: string;
  drawStyle: DrawStyle;
  font: FontChoice;
}

const INK = '#16181d';
const WHITE = '#ffffff';

// The 8 color pairs of the color palette: ink and white first, then hues from red to purple.
// `color1` is the background or outline color; `color2` is the matching text color, whichever of ink or white has higher contrast with `color1`,
// and every pair has a contrast ratio of at least 4.5:1 (the WCAG requirement for body text).
export const COLOR_PAIRS: ColorPair[] = [
  { color1: INK, color2: WHITE },
  { color1: WHITE, color2: INK },
  { color1: '#d93036', color2: WHITE },
  { color1: '#f2811d', color2: INK },
  { color1: '#f5c518', color2: INK },
  { color1: '#1f9d55', color2: INK },
  { color1: '#2463eb', color2: WHITE },
  { color1: '#8b3fd9', color2: WHITE },
];

// Gradient colors of the rainbow style: the 6 palette colors from red to purple, evenly spaced with smooth transitions.
const RAINBOW_COLORS = COLOR_PAIRS.slice(2).map((pair) => pair.color1);

// The sizes below are in stage units: the base image on the stage is 1024 units per side.
// The font size is about one tenth of the base image side; outline width and background padding use the same value so both styles extend equally far.
export const TEXT_SIZE = 104;
const OUTLINE_WIDTH = 26;
const BACKGROUND_PADDING = OUTLINE_WIDTH;
const BACKGROUND_RADIUS = 14;
const LINE_HEIGHT = 1.28;
// The rainbow style has two outline layers: the outer one is the rainbow gradient, and the inner one is a solid color that separates the text from the gradient.
// The outer layer is wider than a regular outline, so each layer shows about 10 units.
const RAINBOW_OUTER_WIDTH = 40;
const RAINBOW_INNER_WIDTH = 20;

// Renders text into a bitmap trimmed of transparent edges; returns null when the text is empty or entirely invisible. The font must be loaded before calling.
export function renderText(config: TextConfig): HTMLCanvasElement | null {
  const lines = config.text.replace(/\r/g, '').split('\n');
  if (lines.every((line) => line.trim() === '')) {
    return null;
  }

  const font = cssFont(config.font, TEXT_SIZE);
  const measure = context2d(createCanvas(1, 1));
  measure.font = font;

  const widths = lines.map((line) => measure.measureText(line).width);
  const lineHeight = Math.ceil(TEXT_SIZE * LINE_HEIGHT);
  const margin = BACKGROUND_PADDING + OUTLINE_WIDTH;
  const canvas = createCanvas(Math.max(...widths) + margin * 2, lineHeight * lines.length + margin * 2);
  const context = context2d(canvas, true);
  const centerX = canvas.width / 2;

  context.font = font;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.lineJoin = 'round';

  const drawLines = (draw: (line: string, x: number, y: number) => void) => {
    lines.forEach((line, index) => draw(line, centerX, margin + lineHeight * (index + 0.5)));
  };
  const strokeLines = (style: string | CanvasGradient, width: number) => {
    context.strokeStyle = style;
    context.lineWidth = width;
    drawLines((line, x, y) => context.strokeText(line, x, y));
  };
  const fillLines = (style: string) => {
    context.fillStyle = style;
    drawLines((line, x, y) => context.fillText(line, x, y));
  };

  switch (config.drawStyle) {
    case 'background':
      context.fillStyle = config.color1;
      context.fill(backgroundPath(lines, widths, centerX, margin, lineHeight));
      fillLines(config.color2);
      break;

    case 'stroke':
      // Stroke first, then fill: half of the line width falls inside the glyphs and is covered by the fill, so the visible extension is half the line width.
      strokeLines(config.color1, OUTLINE_WIDTH);
      fillLines(config.color2);
      break;

    case 'plain':
      fillLines(config.color2);
      break;

    case 'rainbow': {
      // The gradient spans the widest line horizontally, so every line shows the full color band.
      const half = Math.max(...widths) / 2 + RAINBOW_OUTER_WIDTH / 2;
      const gradient = context.createLinearGradient(centerX - half, 0, centerX + half, 0);
      RAINBOW_COLORS.forEach((color, index) => gradient.addColorStop(index / (RAINBOW_COLORS.length - 1), color));

      strokeLines(gradient, RAINBOW_OUTER_WIDTH);
      strokeLines(config.color2, RAINBOW_INNER_WIDTH);
      fillLines(config.color1);
      break;
    }
  }

  return trimTransparent(canvas);
}

// Background blocks: one block per line, as wide as the text (plus padding) and centered line by line; adjacent non-empty lines join into one shape,
// lines of different widths transition with rounded corners, and empty lines break the block.
function backgroundPath(lines: string[], widths: number[], centerX: number, top: number, lineHeight: number): Path2D {
  const path = new Path2D();
  let group: { half: number; top: number; bottom: number }[] = [];

  const flush = () => {
    if (group.length > 0) {
      addRoundedPolygon(path, steppedOutline(group, centerX), BACKGROUND_RADIUS);
      group = [];
    }
  };

  lines.forEach((line, index) => {
    if (line.trim() === '') {
      flush();

      return;
    }

    group.push({
      half: widths[index] / 2 + BACKGROUND_PADDING,
      top: top + lineHeight * index,
      bottom: top + lineHeight * (index + 1),
    });
  });
  flush();

  return path;
}

// The outer contour of a set of vertically adjacent, horizontally centered rectangles, in clockwise order.
function steppedOutline(rows: { half: number; top: number; bottom: number }[], centerX: number): [number, number][] {
  const right: [number, number][] = [];
  const left: [number, number][] = [];

  rows.forEach((row, index) => {
    const previous = rows[index - 1];
    if (!previous || previous.half !== row.half) {
      right.push([centerX + row.half, row.top]);
      left.push([centerX - row.half, row.top]);
    }

    const next = rows[index + 1];
    if (!next || next.half !== row.half) {
      right.push([centerX + row.half, row.bottom]);
      left.push([centerX - row.half, row.bottom]);
    }
  });

  return [...right, ...left.reverse()];
}

// Rounds every vertex of a polygon; the corner radius is at most half the length of either adjacent edge, and works for both convex and concave corners.
function addRoundedPolygon(path: Path2D, points: [number, number][], radius: number): void {
  const count = points.length;
  const distance = (a: [number, number], b: [number, number]) => Math.hypot(a[0] - b[0], a[1] - b[1]);

  for (let i = 0; i < count; i++) {
    const previous = points[(i + count - 1) % count];
    const current = points[i];
    const next = points[(i + 1) % count];
    const limit = Math.min(radius, distance(previous, current) / 2, distance(current, next) / 2);

    if (i === 0) {
      path.moveTo((previous[0] + current[0]) / 2, (previous[1] + current[1]) / 2);
    }

    path.arcTo(current[0], current[1], (current[0] + next[0]) / 2, (current[1] + next[1]) / 2, limit);
    path.lineTo((current[0] + next[0]) / 2, (current[1] + next[1]) / 2);
  }

  path.closePath();
}
