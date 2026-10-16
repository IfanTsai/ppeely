// WebAssembly wrapper for libwebp. Android WebView can export static WebP from a canvas, but iOS WKWebView cannot,
// and neither platform has a browser API for animated WebP, so both use the WASM encoder to keep output identical across platforms.
import createWebpModule from 'wasm-webp/dist/esm/webp-wasm.js';

export interface RgbaFrame {
  data: Uint8Array;
  // Frame duration in milliseconds.
  duration: number;
}

export interface DecodedFrame extends RgbaFrame {
  width: number;
  height: number;
}

interface EncoderConfig {
  lossless: number;
  quality: number;
}

interface FrameVector {
  push_back(frame: { data: Uint8Array; duration: number; config: EncoderConfig; has_config: boolean }): void;
  delete(): void;
}

interface WebpModule {
  encode(data: Uint8Array, width: number, height: number, hasAlpha: boolean, config: EncoderConfig): Uint8Array | null;
  encodeAnimation(width: number, height: number, hasAlpha: boolean, frames: FrameVector): Uint8Array | null;
  decodeRGBA(data: Uint8Array): { width: number; height: number; data: Uint8Array } | null;
  decodeAnimation(data: Uint8Array, hasAlpha: boolean): DecodedFrame[] | null;
  VectorWebPAnimationFrame: new () => FrameVector;
}

let modulePromise: Promise<WebpModule> | null = null;

function loadModule(): Promise<WebpModule> {
  // Emscripten's factory function instantiates a fresh copy of the WASM module on every call; instantiate it once and reuse it.
  modulePromise ??= (createWebpModule as () => Promise<WebpModule>)();

  return modulePromise;
}

export async function encodeWebp(rgba: Uint8Array, width: number, height: number, quality: number): Promise<Uint8Array> {
  const module = await loadModule();

  const encoded = module.encode(rgba, width, height, true, { lossless: 0, quality: clampQuality(quality) });
  if (!encoded) {
    throw new Error('failed to encode WebP image');
  }

  // The return value is a view onto the WASM heap; copy it so later encodes don't overwrite the content.
  return encoded.slice();
}

export async function encodeAnimatedWebp(
  frames: RgbaFrame[],
  width: number,
  height: number,
  quality: number,
): Promise<Uint8Array> {
  if (frames.length === 0) {
    throw new Error('animation has no frames');
  }

  const module = await loadModule();
  const config = { lossless: 0, quality: clampQuality(quality) };
  const vector = new module.VectorWebPAnimationFrame();

  try {
    for (const frame of frames) {
      vector.push_back({ data: frame.data, duration: Math.round(frame.duration), config, has_config: true });
    }

    const encoded = module.encodeAnimation(width, height, true, vector);
    if (!encoded) {
      throw new Error('failed to encode animated WebP image');
    }

    return encoded.slice();
  } finally {
    vector.delete();
  }
}

export async function decodeAnimatedWebp(data: Uint8Array): Promise<DecodedFrame[]> {
  const module = await loadModule();

  const frames = module.decodeAnimation(data, true);
  if (!frames || frames.length === 0) {
    throw new Error('failed to decode animated WebP image');
  }

  return frames.map((frame) => ({ ...frame, data: frame.data.slice() }));
}

function clampQuality(quality: number): number {
  return Math.min(100, Math.max(0, Math.round(quality)));
}
