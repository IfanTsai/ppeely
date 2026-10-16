// Sticker specifications. Limits come from WhatsApp's requirements for third-party sticker packs; the other values are this app's choices.

// Sticker canvas side length, in pixels. WhatsApp requires stickers to be exactly 512×512.
export const STICKER_SIZE = 512;

// Tray icon side length, in pixels. WhatsApp requires the tray icon to be a 96×96 PNG.
export const TRAY_ICON_SIZE = 96;

// Initial encoding quality for static stickers; lowered step by step when the size limit is exceeded.
export const STATIC_STICKER_QUALITY = 70;

// WhatsApp's size limit for static stickers: 100 KB.
export const STATIC_STICKER_MAX_BYTES = 100 * 1024;

// WhatsApp's size limit for animated stickers: 500 KB.
export const ANIMATED_STICKER_MAX_BYTES = 500 * 1024;

// Stop raising the quality of an animated sticker once its size reaches 90% of the limit: one more step would likely exceed the limit for little gain.
export const ANIMATED_STICKER_GOOD_ENOUGH_RATIO = 0.9;

// WhatsApp's size limit for the tray icon: 50 KB.
export const TRAY_ICON_MAX_BYTES = 50 * 1024;

// Duration limit for animated stickers, in seconds. WhatsApp's limit is 10 seconds; this leaves a 1-second margin.
export const ANIMATED_STICKER_MAX_SECONDS = 9;

// Frame count limit for animated stickers; the latter applies when the "Allow up to 100 frames" setting is on. More frames mean lower quality per frame at the same size.
export const ANIMATED_STICKER_MAX_FRAMES = 60;
export const ANIMATED_STICKER_MAX_FRAMES_EXTENDED = 100;

// WhatsApp requires each frame of an animated sticker to be shown for at least 8 ms.
export const ANIMATED_STICKER_MIN_FRAME_MS = 8;

// Allowed number of stickers per sticker pack: WhatsApp requires 3 to 30.
// Sticker packs with fewer than 3 stickers are padded with transparent stickers when handed to WhatsApp or exported.
export const PACK_MAX_STICKERS = 30;
export const PACK_MIN_STICKERS_FOR_WHATSAPP = 3;

// Allowed length of sticker pack name and author, counted in characters after trimming whitespace.
export const PACK_TEXT_MIN_LENGTH = 3;
export const PACK_TEXT_MAX_LENGTH = 30;

// Maximum number of emojis tagged on each sticker. WhatsApp's limit is 3.
export const STICKER_MAX_EMOJIS = 3;

// File extension and MIME type of sticker pack files.
export const PACK_FILE_EXTENSION = '.wastickers';
export const PACK_FILE_MIME = 'application/wastickers';
