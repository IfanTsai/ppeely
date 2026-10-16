// Fonts available for text stickers: built-in fonts plus custom fonts imported by the user.
//
// The built-in fonts are all open-source fonts licensed under the SIL Open Font License, plus a system default font.
import alfaSlabOne from '@fontsource/alfa-slab-one/files/alfa-slab-one-latin-400-normal.woff2?url';
import anton from '@fontsource/anton/files/anton-latin-400-normal.woff2?url';
import comicNeue from '@fontsource/comic-neue/files/comic-neue-latin-700-normal.woff2?url';
import cutiveMono from '@fontsource/cutive-mono/files/cutive-mono-latin-400-normal.woff2?url';
import dynaPuff from '@fontsource/dynapuff/files/dynapuff-latin-600-normal.woff2?url';
import freckleFace from '@fontsource/freckle-face/files/freckle-face-latin-400-normal.woff2?url';
import fredokaOne from '@fontsource/fredoka-one/files/fredoka-one-latin-400-normal.woff2?url';
import nunito from '@fontsource/nunito/files/nunito-latin-700-normal.woff2?url';
import sedgwickAveDisplay from '@fontsource/sedgwick-ave-display/files/sedgwick-ave-display-latin-400-normal.woff2?url';
import { listDirectory, readBytes, removeFile, writeBytes } from './fs';

export interface FontChoice {
  id: string;
  label: string;
  // CSS font family name; null for the system default font.
  family: string | null;
  // Built-in fonts are always drawn bold; custom fonts are drawn at regular weight.
  bold: boolean;
  custom: boolean;
}

export const CUSTOM_FONTS_DIRECTORY = 'custom-fonts';

const SYSTEM_FONT_STACK = "system-ui, -apple-system, Roboto, 'Noto Sans', sans-serif";

// Cycle order of the font switch button; `weight` is the weight of the font file itself.
const BUILTIN: { id: string; label: string; url: string; weight: string }[] = [
  { id: 'anton', label: 'Anton', url: anton, weight: '400' },
  { id: 'alfa-slab-one', label: 'Alfa Slab One', url: alfaSlabOne, weight: '400' },
  { id: 'dynapuff', label: 'DynaPuff', url: dynaPuff, weight: '700' },
  { id: 'cutive-mono', label: 'Cutive Mono', url: cutiveMono, weight: '400' },
  { id: 'fredoka-one', label: 'Fredoka One', url: fredokaOne, weight: '400' },
  { id: 'freckle-face', label: 'Freckle Face', url: freckleFace, weight: '400' },
  { id: 'sedgwick-ave-display', label: 'Sedgwick Ave Display', url: sedgwickAveDisplay, weight: '400' },
  { id: 'nunito', label: 'Nunito', url: nunito, weight: '700' },
  { id: 'comic-neue', label: 'Comic Neue', url: comicNeue, weight: '700' },
];

export const REGULAR_FONT: FontChoice = { id: 'regular', label: 'Regular', family: null, bold: true, custom: false };

const loaded = new Map<string, Promise<void>>();

let customFonts: FontChoice[] = [];

const listeners = new Set<() => void>();

// Cycle order of the font switch button: built-in fonts, the system default font, then custom fonts sorted by name.
export function getFontChoices(): FontChoice[] {
  const builtin = BUILTIN.map<FontChoice>((font) => ({
    id: font.id,
    label: font.label,
    family: familyName(font.id),
    bold: true,
    custom: false,
  }));

  return [...builtin, REGULAR_FONT, ...customFonts];
}

export function getCustomFonts(): FontChoice[] {
  return customFonts;
}

export function subscribeFonts(listener: () => void): () => void {
  listeners.add(listener);

  return () => listeners.delete(listener);
}

export function cssFont(font: FontChoice, sizePx: number): string {
  const family = font.family ? `"${font.family}", ${SYSTEM_FONT_STACK}` : SYSTEM_FONT_STACK;

  return `${font.bold ? 'bold' : 'normal'} ${sizePx}px ${family}`;
}

// The font must be loaded before drawing, otherwise the canvas silently falls back to the default font.
export async function ensureFontLoaded(font: FontChoice): Promise<void> {
  if (!font.family) {
    return;
  }

  let pending = loaded.get(font.id);
  if (!pending) {
    pending = loadFont(font).catch((error) => {
      loaded.delete(font.id);
      throw error;
    });
    loaded.set(font.id, pending);
  }

  await pending;
}

export async function loadCustomFonts(): Promise<void> {
  const files = await listDirectory(CUSTOM_FONTS_DIRECTORY);

  customFonts = files
    .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))
    .map((file) => ({
      id: `custom:${file}`,
      label: file.replace(/\.[^.]*$/, ''),
      family: familyName(`custom-${file}`),
      bold: false,
      custom: true,
    }));

  listeners.forEach((listener) => listener());
}

// Imports a font file. First try to parse it once in the browser; if parsing fails it is not a usable font, so reject it without writing it to disk.
export async function addCustomFont(name: string, bytes: Uint8Array): Promise<void> {
  const fileName = name.replace(/[\\/:*?"<>|]/g, '_');
  const probe = new FontFace(familyName(`probe-${Date.now()}`), bytes.slice().buffer);
  await probe.load();

  await writeBytes(`${CUSTOM_FONTS_DIRECTORY}/${fileName}`, bytes);
  loaded.delete(`custom:${fileName}`);
  await loadCustomFonts();
}

export async function removeCustomFont(font: FontChoice): Promise<void> {
  await removeFile(`${CUSTOM_FONTS_DIRECTORY}/${font.id.slice('custom:'.length)}`);
  await loadCustomFonts();
}

async function loadFont(font: FontChoice): Promise<void> {
  const family = font.family!;
  let face: FontFace;

  if (font.custom) {
    const bytes = await readBytes(`${CUSTOM_FONTS_DIRECTORY}/${font.id.slice('custom:'.length)}`);
    face = new FontFace(family, bytes.slice().buffer);
  } else {
    const builtin = BUILTIN.find((item) => item.id === font.id)!;
    face = new FontFace(family, `url(${builtin.url})`, { weight: builtin.weight });
  }

  document.fonts.add(await face.load());
}

function familyName(id: string): string {
  return `ppeely-${id.replace(/[^a-zA-Z0-9-]/g, '-')}`;
}
