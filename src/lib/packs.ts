// Sticker pack store: the in-memory list of sticker packs plus persistence to disk.
//
// Disk layout (relative to the app-private directory):
//   packs/index.json          metadata of all sticker packs
//   packs/<id>/<file>         sticker files and tray icon of that sticker pack
// The native side only reads these files; all writes go through this module.
import { PACK_MAX_STICKERS, PACK_TEXT_MAX_LENGTH, PACK_TEXT_MIN_LENGTH, STICKER_MAX_EMOJIS } from './constants';
import { readText, removeDirectory, removeFile, writeBytes, writeText } from './fs';
import type { PackIndex, Sticker, StickerPack } from './types';

export const PACKS_ROOT = 'packs';

const INDEX_PATH = `${PACKS_ROOT}/index.json`;

export type PackTextError = 'too-short' | 'too-long';

let packs: StickerPack[] = [];
let writeQueue: Promise<void> = Promise.resolve();

const listeners = new Set<() => void>();

export function subscribePacks(listener: () => void): () => void {
  listeners.add(listener);

  return () => listeners.delete(listener);
}

export function getPacks(): StickerPack[] {
  return packs;
}

export function getPack(id: string): StickerPack | undefined {
  return packs.find((pack) => pack.id === id);
}

export function packFilePath(packId: string, file: string): string {
  return `${PACKS_ROOT}/${packId}/${file}`;
}

export async function loadPacks(): Promise<void> {
  const text = await readText(INDEX_PATH);
  if (text === null) {
    packs = [];
    notify();

    return;
  }

  try {
    const index = JSON.parse(text) as PackIndex;
    packs = index.packs.map(normalizePack);
  } catch {
    // When the index is corrupted, don't overwrite what is on disk; just start with an empty list so data that could still be recovered by hand is not wiped.
    packs = [];
  }

  notify();
}

// Validation shared by name and author: after trimming whitespace, the length must be between 3 and 30.
export function validatePackText(value: string): PackTextError | null {
  const length = [...value.trim()].length;
  if (length < PACK_TEXT_MIN_LENGTH) {
    return 'too-short';
  }

  if (length > PACK_TEXT_MAX_LENGTH) {
    return 'too-long';
  }

  return null;
}

export async function createPack(name: string, author: string, options: { imported?: boolean } = {}): Promise<StickerPack> {
  const now = Date.now();
  const pack: StickerPack = {
    id: newIdentifier('pack'),
    name: name.trim(),
    author: author.trim(),
    trayIcon: null,
    stickers: [],
    animated: false,
    imageDataVersion: 1,
    fillers: [],
    imported: options.imported ?? false,
    createdAt: now,
    updatedAt: now,
  };

  // New sticker packs go to the top.
  packs = [pack, ...packs];
  await persist();

  return pack;
}

export async function renamePack(id: string, name: string, author: string): Promise<void> {
  await updatePack(id, (pack) => ({ ...pack, name: name.trim(), author: author.trim() }));
}

export async function deletePack(id: string): Promise<void> {
  packs = packs.filter((pack) => pack.id !== id);
  await persist();
  await removeDirectory(`${PACKS_ROOT}/${id}`);
}

export async function deleteAllPacks(): Promise<void> {
  const ids = packs.map((pack) => pack.id);
  packs = [];
  await persist();

  for (const id of ids) {
    await removeDirectory(`${PACKS_ROOT}/${id}`);
  }
}

export async function addSticker(
  packId: string,
  bytes: Uint8Array,
  options: { animated: boolean; emojis?: string[]; wrapped?: boolean },
): Promise<Sticker> {
  const pack = requirePack(packId);
  if (pack.stickers.length >= PACK_MAX_STICKERS) {
    throw new Error(`a sticker pack can hold at most ${PACK_MAX_STICKERS} stickers`);
  }

  const sticker: Sticker = {
    file: `${newIdentifier('sticker')}.webp`,
    emojis: (options.emojis ?? []).slice(0, STICKER_MAX_EMOJIS),
    animated: options.animated,
    size: bytes.length,
    ...(options.wrapped ? { wrapped: true } : {}),
  };

  await writeBytes(packFilePath(packId, sticker.file), bytes);
  await updatePack(packId, (current) => contentChanged({ ...current, stickers: [...current.stickers, sticker] }));

  return sticker;
}

// Replaces a sticker with new file contents, keeping its position in the list and its emoji tags.
export async function replaceStickerFile(
  packId: string,
  file: string,
  bytes: Uint8Array,
  patch: Pick<Sticker, 'animated'> & Partial<Pick<Sticker, 'wrapped'>>,
): Promise<void> {
  const next: Sticker = { ...requireSticker(packId, file), ...patch, size: bytes.length };
  next.file = `${newIdentifier('sticker')}.webp`;

  await writeBytes(packFilePath(packId, next.file), bytes);
  await updatePack(packId, (pack) =>
    contentChanged({ ...pack, stickers: pack.stickers.map((sticker) => (sticker.file === file ? next : sticker)) }),
  );
  await removeFile(packFilePath(packId, file));
}

export async function removeSticker(packId: string, file: string): Promise<void> {
  await updatePack(packId, (pack) =>
    contentChanged({ ...pack, stickers: pack.stickers.filter((sticker) => sticker.file !== file) }),
  );
  await removeFile(packFilePath(packId, file));
}

export async function setStickerEmojis(packId: string, file: string, emojis: string[]): Promise<void> {
  const limited = emojis.slice(0, STICKER_MAX_EMOJIS);
  if (requireSticker(packId, file).emojis.join() === limited.join()) {
    return;
  }

  // Emojis are part of the data handed to WhatsApp: WhatsApp caches added sticker packs and only re-reads them when the version number changes.
  await updatePack(packId, (pack) =>
    contentChanged({
      ...pack,
      stickers: pack.stickers.map((sticker) => (sticker.file === file ? { ...sticker, emojis: limited } : sticker)),
    }),
  );
}

export async function setTrayIcon(packId: string, png: Uint8Array): Promise<void> {
  const previous = requirePack(packId).trayIcon;
  const file = `${newIdentifier('tray')}.png`;

  await writeBytes(packFilePath(packId, file), png);
  await updatePack(packId, (pack) => contentChanged({ ...pack, trayIcon: file }));

  if (previous) {
    await removeFile(packFilePath(packId, previous));
  }
}

export async function setPackDelivery(packId: string, patch: Pick<StickerPack, 'animated' | 'fillers'>): Promise<void> {
  await updatePack(packId, (pack) => contentChanged({ ...pack, ...patch }));
}

export async function writePackFile(packId: string, file: string, bytes: Uint8Array): Promise<void> {
  await writeBytes(packFilePath(packId, file), bytes);
}

export function newIdentifier(prefix: string): string {
  const random = Math.floor(Math.random() * 36 ** 6)
    .toString(36)
    .padStart(6, '0');

  // A timestamp alone can collide between two operations at the same moment, so add a random suffix.
  return `${prefix}_${Date.now().toString(36)}_${random}`;
}

function requirePack(id: string): StickerPack {
  const pack = getPack(id);
  if (!pack) {
    throw new Error(`sticker pack not found: ${id}`);
  }

  return pack;
}

function requireSticker(packId: string, file: string): Sticker {
  const sticker = requirePack(packId).stickers.find((item) => item.file === file);
  if (!sticker) {
    throw new Error(`sticker not found: ${packId}/${file}`);
  }

  return sticker;
}

async function updatePack(id: string, change: (pack: StickerPack) => StickerPack): Promise<void> {
  requirePack(id);
  packs = packs.map((pack) => (pack.id === id ? { ...change(pack), updatedAt: Date.now() } : pack));
  await persist();
}

function contentChanged(pack: StickerPack): StickerPack {
  return { ...pack, imageDataVersion: pack.imageDataVersion + 1 };
}

function normalizePack(pack: StickerPack): StickerPack {
  return { ...pack, fillers: pack.fillers ?? [], imported: pack.imported ?? false };
}

function persist(): Promise<void> {
  notify();

  // Write the index serially so a later change is never overwritten by an earlier write.
  const snapshot: PackIndex = { version: 1, packs };
  writeQueue = writeQueue.catch(() => undefined).then(() => writeText(INDEX_PATH, JSON.stringify(snapshot)));

  return writeQueue;
}

function notify(): void {
  listeners.forEach((listener) => listener());
}
