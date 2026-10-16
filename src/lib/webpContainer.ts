// Parsing and reassembling the WebP container (RIFF). Only handles the chunk structure, not pixel encoding or decoding.
// Specification: https://developers.google.com/speed/webp/docs/riff_container

export interface WebpInfo {
  width: number;
  height: number;
  frameCount: number;
  animated: boolean;
  // Sum of all frame durations of the animation and the duration of the shortest frame, in milliseconds; both are 0 for static images.
  durationMs: number;
  minFrameMs: number;
}

interface Chunk {
  type: string;
  payload: Uint8Array;
}

const VP8X_FLAG_ANIMATION = 0x02;
const VP8X_FLAG_ALPHA = 0x10;

// Bit 1 of the ANMF frame flags: when set, the frame overwrites the canvas instead of blending with the previous frame.
const ANMF_FLAG_NO_BLEND = 0x02;

// Duration of each frame when a static sticker is wrapped as an animation, in milliseconds; equivalent to 25 frames per second.
const WRAPPED_FRAME_MS = 40;

export function isWebp(bytes: Uint8Array): boolean {
  return bytes.length >= 12 && ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP';
}

export function readWebpInfo(bytes: Uint8Array): WebpInfo {
  const chunks = parseChunks(bytes);

  const extended = chunks.find((chunk) => chunk.type === 'VP8X');
  const frames = chunks.filter((chunk) => chunk.type === 'ANMF');
  const size = extended
    ? { width: readUint24(extended.payload, 4) + 1, height: readUint24(extended.payload, 7) + 1 }
    : bitstreamSize(chunks);

  // Bytes 12 to 14 of the ANMF chunk header hold the frame's display duration.
  const durations = frames.map((frame) => readUint24(frame.payload, 12));

  return {
    ...size,
    frameCount: Math.max(1, frames.length),
    animated: frames.length > 1,
    durationMs: durations.reduce((total, duration) => total + duration, 0),
    minFrameMs: durations.length > 0 ? Math.min(...durations) : 0,
  };
}

// Wraps a static WebP as an animated WebP with two identical frames.
// WhatsApp requires every sticker in an animated sticker pack to be a multi-frame animation, so a static sticker must be wrapped as an animation to go into an animated pack.
// The container is reassembled directly instead of re-encoding: libwebp's animation encoder merges identical adjacent frames into one, which would not yield two frames.
export function wrapStaticAsAnimation(bytes: Uint8Array): Uint8Array {
  const chunks = parseChunks(bytes);
  if (chunks.some((chunk) => chunk.type === 'ANMF')) {
    throw new Error('image is already animated');
  }

  const frameData = chunks.filter((chunk) => chunk.type === 'ALPH' || chunk.type === 'VP8 ' || chunk.type === 'VP8L');
  if (frameData.length === 0) {
    throw new Error('WebP image has no bitstream');
  }

  const { width, height } = readWebpInfo(bytes);

  const header = new Uint8Array(10);
  header[0] = VP8X_FLAG_ANIMATION | (hasAlpha(frameData) ? VP8X_FLAG_ALPHA : 0);
  writeUint24(header, 4, width - 1);
  writeUint24(header, 7, height - 1);

  // ANIM: 4 bytes of background color (all 0, transparent) plus 2 bytes of loop count (0 means loop forever).
  const animation = new Uint8Array(6);

  const frameHeader = new Uint8Array(16);
  writeUint24(frameHeader, 6, width - 1);
  writeUint24(frameHeader, 9, height - 1);
  writeUint24(frameHeader, 12, WRAPPED_FRAME_MS);
  frameHeader[15] = ANMF_FLAG_NO_BLEND;

  const frame = concat([frameHeader, ...frameData.map(serializeChunk)]);

  return serializeFile([
    { type: 'VP8X', payload: header },
    { type: 'ANIM', payload: animation },
    { type: 'ANMF', payload: frame },
    { type: 'ANMF', payload: frame },
  ]);
}

// Extracts the first frame of an animation and reassembles it into a static WebP; used to restore a wrapped sticker.
export function unwrapFirstFrame(bytes: Uint8Array): Uint8Array {
  const frame = parseChunks(bytes).find((chunk) => chunk.type === 'ANMF');
  if (!frame) {
    throw new Error('image is not animated');
  }

  const width = readUint24(frame.payload, 6) + 1;
  const height = readUint24(frame.payload, 9) + 1;
  const frameData = parseChunkList(frame.payload, 16);

  const header = new Uint8Array(10);
  header[0] = hasAlpha(frameData) ? VP8X_FLAG_ALPHA : 0;
  writeUint24(header, 4, width - 1);
  writeUint24(header, 7, height - 1);

  return serializeFile([{ type: 'VP8X', payload: header }, ...frameData]);
}

function parseChunks(bytes: Uint8Array): Chunk[] {
  if (!isWebp(bytes)) {
    throw new Error('not a WebP image');
  }

  return parseChunkList(bytes, 12);
}

function parseChunkList(bytes: Uint8Array, start: number): Chunk[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const chunks: Chunk[] = [];
  let offset = start;

  while (offset + 8 <= bytes.length) {
    const size = view.getUint32(offset + 4, true);
    const end = Math.min(bytes.length, offset + 8 + size);
    chunks.push({ type: ascii(bytes, offset, 4), payload: bytes.subarray(offset + 8, end) });

    // Chunks are aligned to even byte offsets; an odd length is followed by one padding byte.
    offset = end + (size & 1);
  }

  return chunks;
}

// Whether the frame data may carry an alpha channel: lossy encoding keeps alpha in a separate ALPH chunk, while lossless encoding (VP8L) can carry alpha itself.
function hasAlpha(frameData: Chunk[]): boolean {
  return frameData.some((chunk) => chunk.type === 'ALPH' || chunk.type === 'VP8L');
}

function bitstreamSize(chunks: Chunk[]): { width: number; height: number } {
  const lossy = chunks.find((chunk) => chunk.type === 'VP8 ');
  if (lossy) {
    const view = new DataView(lossy.payload.buffer, lossy.payload.byteOffset, lossy.payload.byteLength);

    return { width: view.getUint16(6, true) & 0x3fff, height: view.getUint16(8, true) & 0x3fff };
  }

  const lossless = chunks.find((chunk) => chunk.type === 'VP8L');
  if (lossless) {
    const view = new DataView(lossless.payload.buffer, lossless.payload.byteOffset, lossless.payload.byteLength);
    const bits = view.getUint32(1, true);

    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }

  throw new Error('WebP image has no bitstream');
}

function serializeChunk(chunk: Chunk): Uint8Array {
  const padded = chunk.payload.length + (chunk.payload.length & 1);
  const bytes = new Uint8Array(8 + padded);
  writeAscii(bytes, 0, chunk.type);
  new DataView(bytes.buffer).setUint32(4, chunk.payload.length, true);
  bytes.set(chunk.payload, 8);

  return bytes;
}

function serializeFile(chunks: Chunk[]): Uint8Array {
  const body = concat(chunks.map(serializeChunk));
  const bytes = new Uint8Array(12 + body.length);
  writeAscii(bytes, 0, 'RIFF');
  new DataView(bytes.buffer).setUint32(4, 4 + body.length, true);
  writeAscii(bytes, 8, 'WEBP');
  bytes.set(body, 12);

  return bytes;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const result = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }

  return result;
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(offset, offset + length));
}

function writeAscii(bytes: Uint8Array, offset: number, text: string): void {
  for (let i = 0; i < text.length; i++) {
    bytes[offset + i] = text.charCodeAt(i);
  }
}

function readUint24(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
}

function writeUint24(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >> 8) & 0xff;
  bytes[offset + 2] = (value >> 16) & 0xff;
}
