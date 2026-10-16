// Pixel checks for outline results, shared by both test suites. File dimensions and byte size alone can't catch a wrongly drawn outline, so this counts the pixels of the stage base image directly.

// Expression evaluated in the page: the share of outline-colored pixels on the base image canvas, the share of semi-transparent pixels, and the number of opaque pixels in the outermost ring of the canvas.
export function outlineStatsExpression([red, green, blue]) {
  return `(() => {
    const canvas = document.querySelector('[data-testid="stage-base"]');
    const { width, height } = canvas;
    const data = canvas.getContext('2d').getImageData(0, 0, width, height).data;
    let outline = 0;
    let soft = 0;
    let edge = 0;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        if (data[i + 3] === 0) continue;
        if (x === 0 || y === 0 || x === width - 1 || y === height - 1) edge++;
        if (data[i + 3] < 248) soft++;
        if (data[i + 3] > 250 && Math.abs(data[i] - ${red}) < 8 && Math.abs(data[i + 1] - ${green}) < 8 && Math.abs(data[i + 2] - ${blue}) < 8) outline++;
      }
    }
    return { outlineFraction: outline / (width * height), softFraction: soft / (width * height), edgePixels: edge };
  })()`;
}

// The outline should be a ring around the shape: a small fraction of the canvas, semi-transparent only at its anti-aliased edges, and not touching the canvas border.
export function assertOutlineLooksRight(stats) {
  const summary = JSON.stringify(stats);
  if (!(stats.outlineFraction > 0.01 && stats.outlineFraction < 0.2)) {
    throw new Error(`outline covers an unexpected share of the canvas: ${summary}`);
  }

  if (!(stats.softFraction < 0.02)) {
    throw new Error(`too many semi-transparent pixels for a solid outline: ${summary}`);
  }

  if (stats.edgePixels !== 0) {
    throw new Error(`outline touches the canvas edge: ${summary}`);
  }
}
