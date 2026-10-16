export interface Sticker {
  // Sticker file name, inside the sticker pack directory.
  file: string;
  // Emoji tags, at most 3.
  emojis: string[];
  // Whether this is a multi-frame animated sticker.
  animated: boolean;
  // File size in bytes.
  size: number;
  // True means this is a static sticker wrapped as an animation file with two identical frames so it can go into an animated sticker pack.
  wrapped?: boolean;
}

export interface StickerPack {
  // Identifier, also used as the directory name on disk; contains only letters, digits and underscores.
  id: string;
  name: string;
  author: string;
  // Tray icon file name; null when not set yet, in which case one is generated from the first sticker before handing the pack to WhatsApp.
  trayIcon: string | null;
  stickers: Sticker[];
  // Whether the pack contains animated stickers. WhatsApp doesn't allow static and animated stickers in the same pack, so the format is unified before delivery.
  animated: boolean;
  // Incremented every time the sticker content changes; WhatsApp uses it to decide whether to refresh its cache.
  imageDataVersion: number;
  // File names of the transparent filler stickers used to pad packs with fewer than 3 stickers; only used when handing the pack to WhatsApp, never shown in the UI.
  fillers: string[];
  // Whether the pack was created by the import flow.
  imported: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface PackIndex {
  version: 1;
  packs: StickerPack[];
}
