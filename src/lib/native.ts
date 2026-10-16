// Interface of the native bridge plugin. Android implements it in Kotlin (StickerBridgePlugin.kt), iOS in Swift (StickerBridgePlugin.swift);
// the browser debug environment has no native implementation, so every method returns an "unavailable" result.
import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';

export interface WhatsAppStatus {
  consumerInstalled: boolean;
  businessInstalled: boolean;
}

export interface AddPackResult {
  added: boolean;
  // The reason WhatsApp gave for rejecting the sticker pack (Android only).
  validationError?: string;
  // On iOS WhatsApp returns no result; we only know whether the sticker pack was handed to WhatsApp.
  handedOff?: boolean;
}

export interface IncomingFile {
  // Path relative to the cache directory.
  path: string;
  name: string;
  size: number;
}

export interface KeyboardStatus {
  // Whether the platform provides the sticker keyboard (Android only).
  available: boolean;
  enabled: boolean;
}

export interface LibrarySticker {
  uri: string;
  name: string;
}

export interface StickerBridgePlugin {
  getWhatsAppStatus(): Promise<WhatsAppStatus>;
  isPackAdded(options: { id: string }): Promise<{ consumer: boolean; business: boolean }>;
  addStickerPack(options: { id: string; name: string }): Promise<AddPackResult>;
  consumeIncomingFile(): Promise<{ file: IncomingFile | null }>;
  getImporterEnabled(): Promise<{ enabled: boolean }>;
  setImporterEnabled(options: { enabled: boolean }): Promise<void>;
  getKeyboardStatus(): Promise<KeyboardStatus>;
  openKeyboardSettings(): Promise<void>;
  showKeyboardPicker(): Promise<void>;
  // Reads the access status and contents of the directory holding WhatsApp's sent and received stickers (Android only).
  getStickerLibraryStatus(): Promise<{ available: boolean; granted: boolean }>;
  requestStickerLibraryAccess(): Promise<{ granted: boolean }>;
  listStickerLibrary(): Promise<{ stickers: LibrarySticker[] }>;
  // Copies a content:// document into the cache directory and returns its path relative to the cache directory.
  copyDocumentToCache(options: { uri: string }): Promise<{ path: string }>;
  addListener(event: 'incomingFile', listener: () => void): Promise<PluginListenerHandle>;
}

const unavailable: StickerBridgePlugin = {
  getWhatsAppStatus: async () => ({ consumerInstalled: false, businessInstalled: false }),
  isPackAdded: async () => ({ consumer: false, business: false }),
  addStickerPack: async () => {
    throw new Error('WhatsApp is not available on this platform');
  },
  consumeIncomingFile: async () => ({ file: null }),
  getImporterEnabled: async () => ({ enabled: false }),
  setImporterEnabled: async () => undefined,
  getKeyboardStatus: async () => ({ available: false, enabled: false }),
  openKeyboardSettings: async () => undefined,
  showKeyboardPicker: async () => undefined,
  getStickerLibraryStatus: async () => ({ available: false, granted: false }),
  requestStickerLibraryAccess: async () => ({ granted: false }),
  listStickerLibrary: async () => ({ stickers: [] }),
  copyDocumentToCache: async () => {
    throw new Error('documents are not available on this platform');
  },
  addListener: async () => ({ remove: async () => undefined }),
};

export const StickerBridge: StickerBridgePlugin = Capacitor.isNativePlatform()
  ? registerPlugin<StickerBridgePlugin>('StickerBridge')
  : unavailable;

export const platform = Capacitor.getPlatform() as 'android' | 'ios' | 'web';
