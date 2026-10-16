// Foreground segmentation for "smart select". The model is DeepLab v3 published by MediaPipe (MobileNetV2 backbone, the 21 PASCAL VOC classes);
// inference runs in WASM inside the WebView and needs no network access.
import { FilesetResolver, ImageSegmenter } from '@mediapipe/tasks-vision';
import { createCanvas, context2d } from './image';
import { largestRegionWithoutHoles } from './maskOps';

// Maximum side length the image is shrunk to before going into the model; the model's internal resolution is even lower, so a larger input gains nothing.
const SEGMENTATION_INPUT_SIZE = 513;

// PASCAL VOC class indices kept as foreground:
// 7 car, 8 cat, 10 cow, 12 dog, 13 horse, 14 motorbike, 15 person, 16 pottedplant.
const KEPT_CLASSES = new Set([7, 8, 10, 12, 13, 14, 15, 16]);

// Contrast gain applied to the edge transition band after upscaling the mask; higher values give sharper edges, and 3 corresponds to roughly 1 to 2 pixels of anti-aliased transition.
const EDGE_CONTRAST = 3;

let segmenterPromise: Promise<ImageSegmenter> | null = null;

// Returns a mask canvas the same size as the image (only the alpha channel is meaningful); returns null when the image has no recognizable subject.
export async function segmentSubject(image: HTMLCanvasElement): Promise<HTMLCanvasElement | null> {
  const segmenter = await loadSegmenter();

  const scale = Math.min(1, SEGMENTATION_INPUT_SIZE / Math.max(image.width, image.height));
  const input = createCanvas(image.width * scale, image.height * scale);
  context2d(input).drawImage(image, 0, 0, input.width, input.height);

  const result = segmenter.segment(input);

  let region: Uint8Array | null;
  let width: number;
  let height: number;

  try {
    const categories = result.categoryMask;
    if (!categories) {
      throw new Error('segmentation returned no category mask');
    }

    width = categories.width;
    height = categories.height;

    const labels = categories.getAsUint8Array();
    const kept = new Uint8Array(labels.length);
    for (let i = 0; i < labels.length; i++) {
      kept[i] = KEPT_CLASSES.has(labels[i]) ? 1 : 0;
    }

    region = largestRegionWithoutHoles(kept, width, height);
  } finally {
    result.close();
  }

  if (!region) {
    return null;
  }

  return upscaleMask(region, width, height, image.width, image.height);
}

// Upscales the low-resolution binary mask to the image size. Bilinear interpolation turns the edges into gradients, then raising the contrast narrows them into anti-aliased edges.
function upscaleMask(region: Uint8Array, width: number, height: number, targetWidth: number, targetHeight: number): HTMLCanvasElement {
  const small = createCanvas(width, height);
  const smallContext = context2d(small);
  const smallPixels = smallContext.createImageData(width, height);
  for (let i = 0; i < region.length; i++) {
    smallPixels.data[i * 4 + 3] = region[i] * 255;
  }

  smallContext.putImageData(smallPixels, 0, 0);

  const mask = createCanvas(targetWidth, targetHeight);
  const context = context2d(mask, true);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(small, 0, 0, targetWidth, targetHeight);

  const pixels = context.getImageData(0, 0, targetWidth, targetHeight);
  for (let i = 3; i < pixels.data.length; i += 4) {
    pixels.data[i] = (pixels.data[i] - 127.5) * EDGE_CONTRAST + 127.5;
  }

  context.putImageData(pixels, 0, 0);

  return mask;
}

function loadSegmenter(): Promise<ImageSegmenter> {
  segmenterPromise ??= createSegmenter().catch((error) => {
    segmenterPromise = null;
    throw error;
  });

  return segmenterPromise;
}

async function createSegmenter(): Promise<ImageSegmenter> {
  const base = new URL('.', document.baseURI).href;

  // Only the SIMD build of WASM is bundled; old WebViews without SIMD support get a clear error here instead of failing to load silently.
  if (!(await FilesetResolver.isSimdSupported())) {
    throw new Error('this WebView does not support WebAssembly SIMD');
  }

  return ImageSegmenter.createFromOptions(
    {
      wasmLoaderPath: `${base}mediapipe/vision_wasm_internal.js`,
      wasmBinaryPath: `${base}mediapipe/vision_wasm_internal.wasm`,
    },
    {
      baseOptions: { modelAssetPath: `${base}models/deeplab_v3.tflite`, delegate: 'CPU' },
      runningMode: 'IMAGE',
      outputCategoryMask: true,
      outputConfidenceMasks: false,
    },
  );
}
