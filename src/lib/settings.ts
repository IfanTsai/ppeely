// User settings and editor preferences, stored in Capacitor Preferences (SharedPreferences on Android, UserDefaults on iOS).
import { Preferences } from '@capacitor/preferences';
import type { LanguagePreference } from '../i18n';

export interface Settings {
  // UI language; follows the system by default. The Android sticker keyboard reads it too (AppLanguage.kt).
  language: LanguagePreference;
  // Prioritize quality for animated stickers; on by default.
  animationQuality: boolean;
  // Allow animated stickers to exceed 60 frames; off by default.
  animationFrameLimit: boolean;
  // Outline width, in pixels on the finished sticker: one value each for a regular cutout and select-all, remembering the user's last choice.
  // Select-all yields the whole rectangular image, so it has no outline by default.
  outlineWidth: number;
  outlineWidthSelectAll: number;
  // Outline color; white by default.
  outlineColor: string;
  // Author name prefilled when creating a sticker pack.
  lastAuthor: string;
}

const KEY = 'settings';

const defaults: Settings = {
  language: 'system',
  animationQuality: true,
  animationFrameLimit: false,
  outlineWidth: 6,
  outlineWidthSelectAll: 0,
  outlineColor: '#ffffff',
  lastAuthor: '',
};

let current: Settings = defaults;

const listeners = new Set<() => void>();

export async function loadSettings(): Promise<void> {
  const { value } = await Preferences.get({ key: KEY });
  if (!value) {
    return;
  }

  try {
    current = { ...defaults, ...(JSON.parse(value) as Partial<Settings>) };
  } catch {
    current = defaults;
  }
}

export function getSettings(): Settings {
  return current;
}

export async function updateSettings(patch: Partial<Settings>): Promise<void> {
  current = { ...current, ...patch };
  listeners.forEach((listener) => listener());
  await Preferences.set({ key: KEY, value: JSON.stringify(current) });
}

export function subscribeSettings(listener: () => void): () => void {
  listeners.add(listener);

  return () => listeners.delete(listener);
}
