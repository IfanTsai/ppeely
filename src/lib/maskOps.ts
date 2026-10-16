// Post-processing for binary masks: keep the largest connected region and fill its interior holes.
// Segmentation model output often has scattered small blobs and interior holes, while a sticker needs one complete subject.

// Non-zero values in `mask` are foreground. Returns a new mask with foreground set to 1; returns null when there is no foreground at all.
export function largestRegionWithoutHoles(mask: Uint8Array, width: number, height: number): Uint8Array | null {
  const labels = new Int32Array(mask.length);
  const queue = new Int32Array(mask.length);
  let bestLabel = 0;
  let bestSize = 0;
  let nextLabel = 0;

  for (let start = 0; start < mask.length; start++) {
    if (mask[start] === 0 || labels[start] !== 0) {
      continue;
    }

    nextLabel++;
    const size = floodFill(start, (index) => mask[index] !== 0 && labels[index] === 0, (index) => (labels[index] = nextLabel), queue, width, height);
    if (size > bestSize) {
      bestSize = size;
      bestLabel = nextLabel;
    }
  }

  if (bestLabel === 0) {
    return null;
  }

  // Mark every non-foreground pixel connected to the border, starting from all four edges; the remaining unmarked non-foreground pixels are holes.
  const outside = new Uint8Array(mask.length);
  const isOpen = (index: number) => labels[index] !== bestLabel && outside[index] === 0;
  const markOutside = (index: number) => (outside[index] = 1);

  for (let x = 0; x < width; x++) {
    for (const index of [x, (height - 1) * width + x]) {
      if (isOpen(index)) {
        floodFill(index, isOpen, markOutside, queue, width, height);
      }
    }
  }

  for (let y = 0; y < height; y++) {
    for (const index of [y * width, y * width + width - 1]) {
      if (isOpen(index)) {
        floodFill(index, isOpen, markOutside, queue, width, height);
      }
    }
  }

  const result = new Uint8Array(mask.length);
  for (let i = 0; i < result.length; i++) {
    result[i] = outside[i] === 0 ? 1 : 0;
  }

  return result;
}

// Four-connected breadth-first fill; `accept` decides whether a pixel belongs to the current region, and `mark` marks it (after marking, `accept` must return false).
function floodFill(
  start: number,
  accept: (index: number) => boolean,
  mark: (index: number) => void,
  queue: Int32Array,
  width: number,
  height: number,
): number {
  let head = 0;
  let tail = 0;
  queue[tail++] = start;
  mark(start);

  while (head < tail) {
    const index = queue[head++];
    const x = index % width;
    const y = (index - x) / width;

    if (x > 0 && accept(index - 1)) {
      mark(index - 1);
      queue[tail++] = index - 1;
    }

    if (x < width - 1 && accept(index + 1)) {
      mark(index + 1);
      queue[tail++] = index + 1;
    }

    if (y > 0 && accept(index - width)) {
      mark(index - width);
      queue[tail++] = index - width;
    }

    if (y < height - 1 && accept(index + width)) {
      mark(index + width);
      queue[tail++] = index + width;
    }
  }

  return tail;
}
