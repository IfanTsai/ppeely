import { unzipSync, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { textToBytes } from './bytes';
import { buildPackArchive, InvalidPackFileError, parsePackArchive } from './wastickers';

const bytes = (...values: number[]) => new Uint8Array(values);
const blank = bytes(9, 9, 9);

describe('buildPackArchive', () => {
  it('writes title, author, tray icon and stickers at the top level', () => {
    const archive = buildPackArchive(
      { name: 'Cats', author: 'Me', trayIcon: bytes(1), stickers: [bytes(2), bytes(3), bytes(4)] },
      blank,
    );

    const entries = unzipSync(archive);

    expect(Object.keys(entries).sort()).toEqual(['author.txt', 'sticker_1.webp', 'sticker_2.webp', 'sticker_3.webp', 'title.txt', 'tray.png']);
    expect(new TextDecoder().decode(entries['title.txt'])).toBe('Cats\n');
  });

  it('pads the archive with blank stickers up to three', () => {
    const archive = buildPackArchive({ name: 'Cats', author: 'Me', trayIcon: bytes(1), stickers: [bytes(2)] }, blank);

    const names = Object.keys(unzipSync(archive)).filter((name) => name.endsWith('.webp'));

    expect(names.sort()).toEqual(['placeholder_2.webp', 'placeholder_3.webp', 'sticker_1.webp']);
  });
});

describe('parsePackArchive', () => {
  it('round-trips an exported pack and drops the blank padding', () => {
    const archive = buildPackArchive({ name: 'Cats', author: 'Me', trayIcon: bytes(1), stickers: [bytes(2)] }, blank);

    const pack = parsePackArchive(archive);

    expect(pack).toEqual({ name: 'Cats', author: 'Me', trayIcon: bytes(1), stickers: [bytes(2)] });
  });

  it('accepts entry names with a leading slash and orders stickers by name length then name', () => {
    const archive = zipSync({
      '/title.txt': textToBytes(' Dogs \n'),
      '/author.txt': textToBytes('You'),
      '/small.png': bytes(1),
      '/big.png': bytes(1, 2, 3),
      '/10.webp': bytes(10),
      '/2.webp': bytes(2),
      '/1.webp': bytes(1),
      'nested/3.webp': bytes(3),
    });

    const pack = parsePackArchive(archive);

    expect(pack.name).toBe('Dogs');
    expect(pack.trayIcon).toEqual(bytes(1, 2, 3));
    expect(pack.stickers).toEqual([bytes(1), bytes(2), bytes(10)]);
  });

  it('rejects files that are not sticker packs', () => {
    expect(() => parsePackArchive(bytes(1, 2, 3))).toThrow(InvalidPackFileError);
    expect(() => parsePackArchive(zipSync({ 'title.txt': textToBytes('x') }))).toThrow('no stickers');
  });
});
