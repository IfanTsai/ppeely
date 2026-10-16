// Reading and writing `.wastickers` sticker pack files, a format commonly used to exchange sticker packs between sticker apps: a ZIP archive whose top level contains
//   title.txt    sticker pack name (UTF-8)
//   author.txt   author (UTF-8)
//   *.png        tray icon (exactly one)
//   *.webp       stickers (3 to 30)
// The file does not store emoji tags, the animated flag, or the identifier.
import { unzipSync, zipSync } from 'fflate';
import { bytesToText, textToBytes } from './bytes';
import { PACK_MAX_STICKERS, PACK_MIN_STICKERS_FOR_WHATSAPP } from './constants';

export interface PackArchive {
  name: string;
  author: string;
  trayIcon: Uint8Array;
  stickers: Uint8Array[];
}

export class InvalidPackFileError extends Error {
  constructor(reason: string) {
    super(`invalid sticker pack file: ${reason}`);
    this.name = 'InvalidPackFileError';
  }
}

// `blankSticker` pads the pack when it has fewer than 3 stickers, so the file meets the "at least 3 stickers" structural requirement.
export function buildPackArchive(pack: PackArchive, blankSticker: Uint8Array): Uint8Array {
  const entries: Record<string, Uint8Array> = {
    'title.txt': textToBytes(`${pack.name}\n`),
    'author.txt': textToBytes(`${pack.author}\n`),
    'tray.png': pack.trayIcon,
  };

  pack.stickers.forEach((sticker, index) => {
    entries[`sticker_${index + 1}.webp`] = sticker;
  });

  for (let index = pack.stickers.length; index < PACK_MIN_STICKERS_FOR_WHATSAPP; index++) {
    entries[`placeholder_${index + 1}.webp`] = blankSticker;
  }

  // The images are already compressed, so DEFLATE gains nothing; store them as is.
  return zipSync(entries, { level: 0 });
}

export function parsePackArchive(bytes: Uint8Array): PackArchive {
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(bytes);
  } catch {
    throw new InvalidPackFileError('not a ZIP archive');
  }

  // Only look at top-level files; some apps export entry names with a leading slash, so strip it before checking.
  const files = Object.entries(entries)
    .map(([path, data]) => ({ name: path.replace(/^\/+/, ''), data }))
    .filter((file) => file.name !== '' && !file.name.includes('/'));

  const stickers = files
    .filter((file) => extension(file.name) === 'webp' && !isBlankSticker(file.name))
    .sort((a, b) => a.name.length - b.name.length || a.name.localeCompare(b.name))
    .slice(0, PACK_MAX_STICKERS)
    .map((file) => file.data);
  if (stickers.length === 0) {
    throw new InvalidPackFileError('no stickers');
  }

  // When there are several PNGs, use the largest one as the tray icon.
  const trayIcon = files
    .filter((file) => extension(file.name) === 'png')
    .sort((a, b) => b.data.length - a.data.length)[0];
  if (!trayIcon) {
    throw new InvalidPackFileError('no tray icon');
  }

  return {
    name: readTextEntry(files, 'title'),
    author: readTextEntry(files, 'author'),
    trayIcon: trayIcon.data,
    stickers,
  };
}

function readTextEntry(files: { name: string; data: Uint8Array }[], baseName: string): string {
  const file = files.find((item) => item.name.replace(/\.[^.]*$/, '').toLowerCase() === baseName);
  if (!file) {
    throw new InvalidPackFileError(`missing ${baseName}.txt`);
  }

  return bytesToText(file.data).trim();
}

function extension(name: string): string {
  return name.split('.').pop()?.toLowerCase() ?? '';
}

// Filler stickers added to reach 3 should not become real stickers on import; `blanksticker` is a filler file name commonly used by other apps.
function isBlankSticker(name: string): boolean {
  return /^(placeholder_|blanksticker)\d+\.webp$/i.test(name);
}
