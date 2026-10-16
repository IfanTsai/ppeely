// Delivering sticker packs outside the app: adding to WhatsApp, and exporting and importing `.wastickers` files.
import { Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { bytesToBlob } from './bytes';
import { PACK_FILE_EXTENSION, PACK_FILE_MIME, PACK_MIN_STICKERS_FOR_WHATSAPP, STICKER_SIZE } from './constants';
import { readBytes, removeFile, writeBytes } from './fs';
import { decodeImage } from './image';
import { platform, StickerBridge, type AddPackResult } from './native';
import {
  addSticker,
  createPack,
  getPack,
  packFilePath,
  replaceStickerFile,
  setPackDelivery,
  setTrayIcon,
  writePackFile,
} from './packs';
import { encodeBlankSticker, encodeStaticSticker, encodeTrayIcon, normalizeSticker } from './stickerEncoder';
import type { StickerPack } from './types';
import { buildPackArchive, parsePackArchive } from './wastickers';
import { isWebp, readWebpInfo, unwrapFirstFrame, wrapStaticAsAnimation } from './webpContainer';

export type PackProblem = 'no-stickers';

export class PackNotReadyError extends Error {
  constructor(readonly problem: PackProblem) {
    super(`sticker pack is not ready: ${problem}`);
    this.name = 'PackNotReadyError';
  }
}

const EXPORT_DIRECTORY = 'export';

// Preparation before delivery:
// 1. When there is no tray icon, generate one from the first frame of the first sticker;
// 2. when the pack mixes static and animated stickers, wrap static stickers as two-frame animations (WhatsApp doesn't allow mixing); when all are static, restore wrapped ones;
// 3. when there are fewer than 3 stickers, prepare transparent filler stickers (WhatsApp requires at least 3).
export async function preparePack(packId: string): Promise<StickerPack> {
  let pack = requirePack(packId);
  if (pack.stickers.length === 0) {
    throw new PackNotReadyError('no-stickers');
  }

  if (!pack.trayIcon) {
    const first = await readBytes(packFilePath(packId, pack.stickers[0].file));
    const image = await decodeImage(bytesToBlob(first, 'image/webp'));
    await setTrayIcon(packId, await encodeTrayIcon(image, image.width, image.height));
  }

  const animated = pack.stickers.some((sticker) => sticker.animated && !sticker.wrapped);

  for (const sticker of pack.stickers) {
    if (animated && !sticker.animated) {
      const bytes = await readBytes(packFilePath(packId, sticker.file));
      await replaceStickerFile(packId, sticker.file, wrapStaticAsAnimation(bytes), { animated: true, wrapped: true });
    } else if (!animated && sticker.wrapped) {
      const bytes = await readBytes(packFilePath(packId, sticker.file));
      await replaceStickerFile(packId, sticker.file, unwrapFirstFrame(bytes), { animated: false, wrapped: false });
    }
  }

  pack = requirePack(packId);

  const fillers: string[] = [];
  if (pack.stickers.length < PACK_MIN_STICKERS_FOR_WHATSAPP) {
    const blank = await encodeBlankSticker();
    const fillerBytes = animated ? wrapStaticAsAnimation(blank) : blank;

    for (let index = pack.stickers.length; index < PACK_MIN_STICKERS_FOR_WHATSAPP; index++) {
      const file = animated ? `filler_animated_${index}.webp` : `filler_${index}.webp`;

      await writePackFile(packId, file, fillerBytes);
      fillers.push(file);
    }
  }

  // Register the new filler stickers before deleting the old files: the native side may read the index at any time, and the index must never list a deleted file.
  const stale = pack.fillers.filter((file) => !fillers.includes(file));
  await setPackDelivery(packId, { animated, fillers });
  for (const file of stale) {
    await removeFile(packFilePath(packId, file));
  }

  return requirePack(packId);
}

// Prepares the sticker pack and opens WhatsApp's add screen. `onReady` is called once preparation is done, just before WhatsApp's screen opens.
export async function addPackToWhatsApp(packId: string, onReady?: () => Promise<void>): Promise<AddPackResult> {
  const pack = await preparePack(packId);
  await onReady?.();

  return StickerBridge.addStickerPack({ id: pack.id, name: pack.name });
}

// Exports to a `.wastickers` file and opens the system share sheet. Returns the size of the exported file in bytes. `onReady` is called once the file is ready, just before the share sheet opens.
export async function sharePackFile(packId: string, dialogTitle: string, onReady?: () => Promise<void>): Promise<number> {
  const pack = await preparePack(packId);

  const archive = buildPackArchive(
    {
      name: pack.name,
      author: pack.author,
      trayIcon: await readBytes(packFilePath(packId, pack.trayIcon!)),
      stickers: await Promise.all(pack.stickers.map((sticker) => readBytes(packFilePath(packId, sticker.file)))),
    },
    await encodeBlankSticker(),
  );

  await shareFile(`${safeFileName(pack.name)}${PACK_FILE_EXTENSION}`, archive, PACK_FILE_MIME, dialogTitle, onReady);

  return archive.length;
}

// Writes binary content to the cache directory and opens the system share sheet; downloads it instead in the browser debug environment. `onReady` is called once the file is written, just before the share sheet opens.
export async function shareFile(name: string, bytes: Uint8Array, mime: string, dialogTitle: string, onReady?: () => Promise<void>): Promise<void> {
  if (platform === 'web') {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(bytesToBlob(bytes, mime));
    link.download = name;
    link.click();
    URL.revokeObjectURL(link.href);

    return;
  }

  const path = `${EXPORT_DIRECTORY}/${name}`;
  const uri = await writeBytes(path, bytes, Directory.Cache);
  await onReady?.();

  try {
    await Share.share({ title: name, files: [uri], dialogTitle });
  } catch (error) {
    // The user cancelling in the share sheet is not a failure.
    if (!/cancel/i.test(String((error as Error)?.message))) {
      throw error;
    }
  }
}

// Imports a `.wastickers` file, creating and returning a new sticker pack.
// Only valid WebP is accepted, and static images that aren't 512×512 are re-encoded, so the imported pack is accepted by WhatsApp.
export async function importPackFile(bytes: Uint8Array, fallback: { name: string; author: string }): Promise<StickerPack> {
  const archive = parsePackArchive(bytes);

  const stickers: { bytes: Uint8Array; animated: boolean }[] = [];
  for (const sticker of archive.stickers) {
    const normalized = await normalizeImportedSticker(sticker);
    if (normalized) {
      stickers.push(normalized);
    }
  }

  if (stickers.length === 0) {
    throw new Error('sticker pack file contains no usable stickers');
  }

  const trayImage = await decodeImage(bytesToBlob(archive.trayIcon, 'image/png'));
  const trayIcon = await encodeTrayIcon(trayImage, trayImage.width, trayImage.height);

  const pack = await createPack(archive.name || fallback.name, archive.author || fallback.author, { imported: true });
  await setTrayIcon(pack.id, trayIcon);
  for (const sticker of stickers) {
    await addSticker(pack.id, sticker.bytes, { animated: sticker.animated });
  }

  return requirePack(pack.id);
}

async function normalizeImportedSticker(bytes: Uint8Array): Promise<{ bytes: Uint8Array; animated: boolean } | null> {
  if (!isWebp(bytes)) {
    return null;
  }

  let info;
  try {
    info = readWebpInfo(bytes);
  } catch {
    return null;
  }

  if (info.width === STICKER_SIZE && info.height === STICKER_SIZE) {
    return { bytes, animated: info.animated };
  }

  if (info.animated) {
    return null;
  }

  const image = await decodeImage(bytesToBlob(bytes, 'image/webp'));

  return { bytes: await encodeStaticSticker(normalizeSticker(image)), animated: false };
}

function requirePack(id: string): StickerPack {
  const pack = getPack(id);
  if (!pack) {
    throw new Error(`sticker pack not found: ${id}`);
  }

  return pack;
}

function safeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim() || 'stickers';
}
