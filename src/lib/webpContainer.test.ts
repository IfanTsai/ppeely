import { describe, expect, it } from 'vitest';
import createWebpModule from 'wasm-webp/dist/esm/webp-wasm.js';
import { isWebp, readWebpInfo, unwrapFirstFrame, wrapStaticAsAnimation } from './webpContainer';

interface TestModule {
  encodeRGB(data: Uint8Array, width: number, height: number, quality: number): Uint8Array;
  encode(data: Uint8Array, width: number, height: number, hasAlpha: boolean, config: object): Uint8Array;
  decodeAnimation(data: Uint8Array, hasAlpha: boolean): { width: number; height: number; duration: number; data: Uint8Array }[];
  decodeRGBA(data: Uint8Array): { width: number; height: number; data: Uint8Array };
}

// The extended format header (VP8X chunk) flags byte follows the 12-byte RIFF header and the 8-byte chunk header.
const VP8X_FLAGS_OFFSET = 20;
const VP8X_FLAG_ALPHA = 0x10;

async function encodeSample(width: number, height: number): Promise<{ module: TestModule; webp: Uint8Array }> {
  const module = (await (createWebpModule as () => Promise<unknown>)()) as TestModule;
  const rgba = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const visible = i % width > width / 4;
    rgba.set([200, (i * 7) % 256, 40, visible ? 255 : 0], i * 4);
  }

  return { module, webp: module.encode(rgba, width, height, true, { lossless: 0, quality: 70 }).slice() };
}

describe('webpContainer', () => {
  it('reads the size of a static image', async () => {
    const { webp } = await encodeSample(512, 512);

    expect(isWebp(webp)).toBe(true);
    expect(readWebpInfo(webp)).toEqual({ width: 512, height: 512, frameCount: 1, animated: false, durationMs: 0, minFrameMs: 0 });
  });

  it('wraps a static image into a two-frame animation that libwebp can decode', async () => {
    const { module, webp } = await encodeSample(512, 512);

    const wrapped = wrapStaticAsAnimation(webp);

    expect(readWebpInfo(wrapped)).toEqual({ width: 512, height: 512, frameCount: 2, animated: true, durationMs: 80, minFrameMs: 40 });
    expect(wrapped[VP8X_FLAGS_OFFSET] & VP8X_FLAG_ALPHA).not.toBe(0);
    const frames = module.decodeAnimation(wrapped, true);
    expect(frames).toHaveLength(2);
    expect(frames[0].width).toBe(512);
    expect(frames[0].duration).toBe(40);
    expect(Array.from(frames[0].data.slice(0, 4000))).toEqual(Array.from(frames[1].data.slice(0, 4000)));
  });

  it('restores the first frame of a wrapped image as a static image', async () => {
    const { module, webp } = await encodeSample(512, 512);

    const restored = unwrapFirstFrame(wrapStaticAsAnimation(webp));

    expect(readWebpInfo(restored)).toEqual({ width: 512, height: 512, frameCount: 1, animated: false, durationMs: 0, minFrameMs: 0 });
    const original = module.decodeRGBA(webp).data.slice();
    expect(Array.from(module.decodeRGBA(restored).data.slice(0, 4000))).toEqual(Array.from(original.slice(0, 4000)));
  });

  it('does not mark a wrapped image as transparent when the source has no alpha', async () => {
    const { module } = await encodeSample(8, 8);
    const opaque = module.encodeRGB(new Uint8Array(512 * 512 * 3).fill(128), 512, 512, 70).slice();

    const wrapped = wrapStaticAsAnimation(opaque);

    expect(wrapped[VP8X_FLAGS_OFFSET] & VP8X_FLAG_ALPHA).toBe(0);
    expect(module.decodeAnimation(wrapped, false)).toHaveLength(2);
  });

  it('rejects data that is not WebP', () => {
    expect(() => readWebpInfo(new Uint8Array(32))).toThrow('not a WebP image');
  });
});
