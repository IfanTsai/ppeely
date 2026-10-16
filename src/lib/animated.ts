// Creates animated stickers from GIFs, videos, or existing animated WebP files.
//
// Done in two steps: first extract frames, scale them proportionally and pad with transparency to 512×512, then use libwebp's (WASM) animation encoder
// to find the highest possible quality within the size limit. Decoding uses browser APIs.
import { decompressFrames, parseGIF } from 'gifuct-js';
import {
  ANIMATED_STICKER_GOOD_ENOUGH_RATIO,
  ANIMATED_STICKER_MAX_BYTES,
  ANIMATED_STICKER_MAX_FRAMES,
  ANIMATED_STICKER_MAX_FRAMES_EXTENDED,
  ANIMATED_STICKER_MAX_SECONDS,
  ANIMATED_STICKER_MIN_FRAME_MS,
  STICKER_SIZE,
} from './constants';
import { clipToDuration, decimate, halve, type TimedFrame } from './frames';
import { canvasToRgba, containRect, context2d, createCanvas, rgbaToCanvas } from './image';
import { decodeAnimatedWebp, encodeAnimatedWebp } from './webp';
import { isWebp, readWebpInfo, type WebpInfo } from './webpContainer';

export interface AnimatedOptions {
  // Corresponds to the "prioritize quality" setting: when on, encode several times to find the highest quality within the size limit; when off, encode once at the lowest quality.
  preferQuality: boolean;
  // Corresponds to the "allow more than 60 frames" setting.
  extendedFrameLimit: boolean;
  onProgress?: (stage: AnimatedStage) => void;
}

export type AnimatedStage = 'decoding' | 'encoding' | 'optimizing' | 'optimizing-more';

type Frame = TimedFrame<Uint8Array>;

// Available encoding quality levels, from low to high. Animated stickers have many frames, so higher quality quickly exceeds the size limit; the highest level is 45.
const QUALITY_LEVELS = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45];

// How many times to retry by halving the frame count when even the lowest quality exceeds the size limit.
const MAX_FRAME_REDUCTIONS = 2;

// Frame rate for extracting frames from video. The browser can only grab frames at given time points, so sample at a fixed frame rate.
const VIDEO_SAMPLE_FPS = 12;

const VIDEO_EXTENSIONS = ['mp4', 'webm', 'mkv', 'mov', 'm4v', '3gp', '3gpp', 'avi'];

// Decides whether a source needs the animated sticker flow:
// the MIME type starts with video/ or contains gif, or the extension is a known animated image or video format.
export function isAnimatedSource(name: string, mime: string): boolean {
  const extension = name.split('.').pop()?.toLowerCase() ?? '';

  return mime.startsWith('video/') || mime.includes('gif') || extension === 'gif' || VIDEO_EXTENSIONS.includes(extension);
}

// Multi-frame WebP is also treated as an animated source; single-frame WebP is a static image.
export function isAnimatedWebp(bytes: Uint8Array): boolean {
  return isWebp(bytes) && readWebpInfo(bytes).animated;
}

export async function createAnimatedSticker(file: Blob, name: string, options: AnimatedOptions): Promise<Uint8Array> {
  options.onProgress?.('decoding');

  const bytes = new Uint8Array(await file.arrayBuffer());
  const maxFrames = options.extendedFrameLimit ? ANIMATED_STICKER_MAX_FRAMES_EXTENDED : ANIMATED_STICKER_MAX_FRAMES;

  // An existing animated WebP is used as is, without re-encoding, when its dimensions, size, frame count and duration all meet the requirements.
  if (isWebp(bytes) && isDeliverableAsIs(readWebpInfo(bytes), bytes.length, maxFrames)) {
    return bytes;
  }

  const decoded = await decodeFrames(bytes, file, name, maxFrames);
  const frames = decimate(clipToDuration(decoded, ANIMATED_STICKER_MAX_SECONDS * 1000), maxFrames).map((frame) => ({
    image: frame.image,
    duration: Math.max(ANIMATED_STICKER_MIN_FRAME_MS, Math.round(frame.duration)),
  }));

  if (frames.length < 2) {
    throw new Error('source has fewer than two frames');
  }

  return encodeWithinLimit(frames, options);
}

// Takes the first frame of an animated source, for entering the static editor when making a tray icon.
export async function extractFirstFrame(file: Blob, name: string): Promise<HTMLCanvasElement> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const frames = await decodeFrames(bytes, file, name, 1);
  if (frames.length === 0) {
    throw new Error('source has no frames');
  }

  return rgbaToCanvas(frames[0].image, STICKER_SIZE, STICKER_SIZE);
}

async function encodeWithinLimit(initial: Frame[], options: AnimatedOptions): Promise<Uint8Array> {
  let frames = initial;

  for (let attempt = 0; ; attempt++) {
    options.onProgress?.('encoding');

    const lowest = await encode(frames, QUALITY_LEVELS[0]);
    if (lowest.length <= ANIMATED_STICKER_MAX_BYTES) {
      return options.preferQuality ? raiseQuality(frames, lowest, options) : lowest;
    }

    if (attempt >= MAX_FRAME_REDUCTIONS || frames.length <= 2) {
      throw new Error('animation is too large to fit in 500 KB');
    }

    frames = halve(frames);
  }
}

// Searches the quality levels for a result: the target is the lowest level whose size exceeds 90% of the limit; use it if it is within the limit, otherwise use the previous level.
// Size grows monotonically with quality, so a binary search settles it in about 4 encodes without trying every level.
async function raiseQuality(frames: Frame[], lowest: Uint8Array, options: AnimatedOptions): Promise<Uint8Array> {
  const goodEnough = ANIMATED_STICKER_MAX_BYTES * ANIMATED_STICKER_GOOD_ENOUGH_RATIO;
  const results = new Map<number, Uint8Array>([[0, lowest]]);

  const encodeLevel = async (level: number): Promise<Uint8Array> => {
    let result = results.get(level);
    if (!result) {
      options.onProgress?.(results.size >= 3 ? 'optimizing-more' : 'optimizing');
      result = await encode(frames, QUALITY_LEVELS[level]);
      results.set(level, result);
    }

    return result;
  };

  // Find the lowest level whose size exceeds goodEnough; if none exists, low ends up equal to the number of levels.
  let low = lowest.length > goodEnough ? 0 : 1;
  let high = lowest.length > goodEnough ? 0 : QUALITY_LEVELS.length;

  while (low < high) {
    const middle = (low + high) >> 1;
    if ((await encodeLevel(middle)).length > goodEnough) {
      high = middle;
    } else {
      low = middle + 1;
    }
  }

  if (low < QUALITY_LEVELS.length) {
    const candidate = await encodeLevel(low);
    if (candidate.length <= ANIMATED_STICKER_MAX_BYTES) {
      return candidate;
    }
  }

  return encodeLevel(Math.max(0, low - 1));
}

function encode(frames: Frame[], quality: number): Promise<Uint8Array> {
  return encodeAnimatedWebp(
    frames.map((frame) => ({ data: frame.image, duration: frame.duration })),
    STICKER_SIZE,
    STICKER_SIZE,
    quality,
  );
}

async function decodeFrames(bytes: Uint8Array, file: Blob, name: string, maxFrames: number): Promise<Frame[]> {
  if (isWebp(bytes)) {
    return decodeWebpFrames(bytes);
  }

  if (isGif(bytes)) {
    return decodeGifFrames(bytes);
  }

  return decodeVideoFrames(file, name, maxFrames);
}

function isGif(bytes: Uint8Array): boolean {
  return bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46;
}

async function decodeWebpFrames(bytes: Uint8Array): Promise<Frame[]> {
  const frames = await decodeAnimatedWebp(bytes);

  return frames.map((frame) => ({
    image: canvasToRgba(placeOnSticker(rgbaToCanvas(frame.data, frame.width, frame.height), frame.width, frame.height)),
    duration: frame.duration,
  }));
}

function decodeGifFrames(bytes: Uint8Array): Frame[] {
  const gif = parseGIF(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
  const patches = decompressFrames(gif, true);
  const width = gif.lsd.width;
  const height = gif.lsd.height;

  // Each GIF frame is only a patch on the canvas, so full images must be composited frame by frame according to the disposal method.
  const canvas = createCanvas(width, height);
  const context = context2d(canvas, true);
  const patchCanvas = createCanvas(1, 1);
  const patchContext = context2d(patchCanvas);
  const frames: Frame[] = [];

  for (const patch of patches) {
    const { left, top, width: patchWidth, height: patchHeight } = patch.dims;
    const beforePatch = patch.disposalType === 3 ? context.getImageData(0, 0, width, height) : null;

    patchCanvas.width = patchWidth;
    patchCanvas.height = patchHeight;
    patchContext.putImageData(new ImageData(new Uint8ClampedArray(patch.patch), patchWidth, patchHeight), 0, 0);
    context.drawImage(patchCanvas, left, top);

    frames.push({
      image: canvasToRgba(placeOnSticker(canvas, width, height)),
      // Browsers play frames with a duration of 0 at 100 ms; use the same convention here.
      duration: patch.delay > 0 ? patch.delay : 100,
    });

    if (patch.disposalType === 2) {
      context.clearRect(left, top, patchWidth, patchHeight);
    } else if (beforePatch) {
      context.putImageData(beforePatch, 0, 0);
    }
  }

  return frames;
}

async function decodeVideoFrames(file: Blob, name: string, maxFrames: number): Promise<Frame[]> {
  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';

  try {
    await new Promise<void>((resolve, reject) => {
      video.addEventListener('loadeddata', () => resolve(), { once: true });
      video.addEventListener('error', () => reject(new Error(`failed to decode video: ${name}`)), { once: true });
      video.src = url;
      video.load();
    });

    const duration = Math.min(Number.isFinite(video.duration) ? video.duration : 0, ANIMATED_STICKER_MAX_SECONDS);
    if (duration <= 0 || video.videoWidth === 0) {
      throw new Error(`failed to decode video: ${name}`);
    }

    const count = Math.max(1, Math.min(maxFrames, Math.round(duration * VIDEO_SAMPLE_FPS)));
    const interval = duration / count;
    const frames: Frame[] = [];

    for (let index = 0; index < count; index++) {
      await seek(video, index * interval);
      frames.push({
        image: canvasToRgba(placeOnSticker(video, video.videoWidth, video.videoHeight)),
        duration: interval * 1000,
      });
    }

    return frames;
  } finally {
    video.removeAttribute('src');
    video.load();
    URL.revokeObjectURL(url);
  }
}

// Uses the same limits as the re-encoding path: 512×512, size, frame count, total duration, and minimum frame duration.
function isDeliverableAsIs(info: WebpInfo, byteLength: number, maxFrames: number): boolean {
  return (
    info.animated &&
    info.width === STICKER_SIZE &&
    info.height === STICKER_SIZE &&
    byteLength <= ANIMATED_STICKER_MAX_BYTES &&
    info.frameCount <= maxFrames &&
    info.durationMs <= ANIMATED_STICKER_MAX_SECONDS * 1000 &&
    info.minFrameMs >= ANIMATED_STICKER_MIN_FRAME_MS
  );
}

function seek(video: HTMLVideoElement, time: number): Promise<void> {
  // When the target time equals the current frame (e.g. the first frame at time=0), setting currentTime does not fire seeked on some WebViews,
  // so return the frame that is already ready to avoid hanging forever.
  if (Math.abs(video.currentTime - time) < 1e-3) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    video.addEventListener('seeked', () => resolve(), { once: true });
    video.addEventListener('error', () => reject(new Error('failed to seek video')), { once: true });
    video.currentTime = time;
  });
}

// Scales proportionally to fit exactly inside 512×512 and centers, padding with transparency; frames smaller than 512 are scaled up.
function placeOnSticker(source: CanvasImageSource, width: number, height: number): HTMLCanvasElement {
  const canvas = createCanvas(STICKER_SIZE, STICKER_SIZE);
  const context = context2d(canvas, true);
  const rect = containRect(width, height, STICKER_SIZE);
  context.imageSmoothingQuality = 'high';
  context.drawImage(source, rect.x, rect.y, rect.width, rect.height);

  return canvas;
}
