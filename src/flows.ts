// Flows that span several pages: pick an image source → edit → save as a sticker or tray icon; plus importing sticker pack files.
import { Directory } from '@capacitor/filesystem';
import { modalController, type ModalOptions } from '@ionic/vue';
import { cameraOutline, folderOutline, gridOutline, imageOutline, textOutline } from 'ionicons/icons';
import EditorModal from './components/EditorModal.vue';
import LibraryModal from './components/LibraryModal.vue';
import { t } from './i18n';
import { createAnimatedSticker, extractFirstFrame, isAnimatedSource, isAnimatedWebp, type AnimatedStage } from './lib/animated';
import { blobToBytes } from './lib/bytes';
import { PACK_FILE_EXTENSION, PACK_MAX_STICKERS } from './lib/constants';
import { importPackFile } from './lib/delivery';
import { readBytes, removeFile } from './lib/fs';
import { decodeImage } from './lib/image';
import { StickerBridge } from './lib/native';
import { addSticker, getPack, setTrayIcon } from './lib/packs';
import { pickFile, pickPhoto, takePhoto, type PickedFile } from './lib/pickers';
import { getSettings } from './lib/settings';
import { encodeStaticSticker, encodeTrayIcon } from './lib/stickerEncoder';
import { InvalidPackFileError } from './lib/wastickers';
import { router } from './router';
import { alert, chooseFromSheet, toast, withBusy } from './ui/overlays';

export type SlotTarget = 'tray' | 'sticker';

type Source = 'camera' | 'gallery' | 'file' | 'library' | 'text';

// Built on each call so the messages follow the current UI language.
function stageMessage(stage: AnimatedStage): string {
  const messages: Record<AnimatedStage, string> = {
    decoding: t.creatingAnimated,
    encoding: t.encodingAnimated,
    optimizing: t.optimizingQuality,
    'optimizing-more': t.optimizingQualityMore,
  };

  return messages[stage];
}

export function openMaker(packId: string): void {
  void router.push(`/pack/${packId}`);
}

// Opens the sticker editor. A null `image` means a text-only sticker; resolves to a 512×512 sticker canvas when done, or null when cancelled.
export function openEditor(image: HTMLCanvasElement | null): Promise<HTMLCanvasElement | null> {
  return presentModal<HTMLCanvasElement>(EditorModal, { image }, 'editor-modal');
}

// Opens the sticker library to pick an existing sticker as source material.
export function openLibrary(): Promise<PickedFile | null> {
  return presentModal<PickedFile>(LibraryModal, {}, 'page-modal');
}

async function presentModal<T>(component: ModalOptions['component'], props: Record<string, unknown>, cssClass: string): Promise<T | null> {
  const modal = await modalController.create({ component, componentProps: props, cssClass, backdropDismiss: false });
  await modal.present();

  const { data } = await modal.onDidDismiss<T>();

  return data ?? null;
}

// The full flow after tapping an empty slot: pick a source, go through the editor if needed, then save.
export async function addToSlot(packId: string, target: SlotTarget): Promise<void> {
  const pack = getPack(packId);
  if (!pack) {
    return;
  }

  if (target === 'sticker' && pack.stickers.length >= PACK_MAX_STICKERS) {
    void toast(t.packFull);

    return;
  }

  const source = await chooseFromSheet<Source>(t.pickImageFrom, [
    { value: 'camera', label: t.takePhoto, icon: cameraOutline },
    { value: 'gallery', label: t.openGallery, icon: imageOutline },
    { value: 'file', label: `${t.selectFile} (${t.selectFileHint})`, icon: folderOutline },
    { value: 'library', label: t.stickerLibrary, icon: gridOutline },
    { value: 'text', label: t.textOnly, icon: textOutline },
  ]);
  if (!source) {
    return;
  }

  try {
    if (source === 'text') {
      await editAndSave(packId, target, null);

      return;
    }

    const picked = await pickFrom(source);
    if (picked) {
      await handlePickedFile(packId, target, picked);
    }
  } catch (error) {
    console.error(error);
    await alert({ title: t.error, message: describeError(error), okLabel: t.ok });
  }
}

function pickFrom(source: Exclude<Source, 'text'>): Promise<PickedFile | null> {
  switch (source) {
    case 'camera':
      return takePhoto();
    case 'gallery':
      return pickPhoto();
    case 'file':
      return pickFile('*/*');
    case 'library':
      return openLibrary();
  }
}

// Routes by source type:
// animated sources are converted straight into animated stickers without the editor; when the target is the tray icon, only the first frame goes into the editor; everything else goes into the static editor.
async function handlePickedFile(packId: string, target: SlotTarget, picked: PickedFile): Promise<void> {
  const bytes = await blobToBytes(picked.blob);
  const animated = isAnimatedSource(picked.name, picked.type) || isAnimatedWebp(bytes);

  if (animated && target === 'sticker') {
    const settings = getSettings();
    let sticker: Uint8Array;

    try {
      sticker = await withBusy(t.creatingAnimated, (update) =>
        createAnimatedSticker(picked.blob, picked.name, {
          preferQuality: settings.animationQuality,
          extendedFrameLimit: settings.animationFrameLimit,
          onProgress: (stage) => update(stageMessage(stage)),
        }),
      );
    } catch (error) {
      console.error(error);
      await alert({ title: t.error, message: t.animatedFailed, okLabel: t.ok });

      return;
    }

    await addSticker(packId, sticker, { animated: true });

    return;
  }

  let image: HTMLCanvasElement;
  try {
    image = await withBusy(t.loadingImage, () => (animated ? extractFirstFrame(picked.blob, picked.name) : decodeImage(picked.blob)));
  } catch (error) {
    console.error(error);
    await alert({ title: t.error, message: t.unableToLoadImage, okLabel: t.ok });

    return;
  }

  await editAndSave(packId, target, image);
}

async function editAndSave(packId: string, target: SlotTarget, image: HTMLCanvasElement | null): Promise<void> {
  const sticker = await openEditor(image);
  if (!sticker) {
    return;
  }

  await withBusy(t.savingSticker, async () => {
    if (target === 'tray') {
      await setTrayIcon(packId, await encodeTrayIcon(sticker, sticker.width, sticker.height));
    } else {
      await addSticker(packId, await encodeStaticSticker(sticker), { animated: false });
    }
  });
}

// Picks a `.wastickers` file from the import button on the home screen and imports it.
export async function importFromPicker(): Promise<void> {
  const picked = await pickFile(`${PACK_FILE_EXTENSION},application/zip,application/octet-stream`);
  if (picked) {
    await importBytes(await blobToBytes(picked.blob));
  }
}

// Handles files handed over by other apps through "Open with" or "Share".
export async function importIncomingFile(): Promise<void> {
  const { file } = await StickerBridge.consumeIncomingFile();
  if (!file) {
    return;
  }

  try {
    await importBytes(await readBytes(file.path, Directory.Cache));
  } finally {
    await removeFile(file.path, Directory.Cache);
  }
}

async function importBytes(bytes: Uint8Array): Promise<void> {
  try {
    const pack = await withBusy(t.importing, () => importPackFile(bytes, { name: t.defaultPackName, author: t.defaultAuthor }));
    void toast(t.imported, 3600);
    openMaker(pack.id);
  } catch (error) {
    console.error(error);
    await alert({ title: t.error, message: error instanceof InvalidPackFileError ? t.importInvalid : describeError(error), okLabel: t.ok });
  }
}

export function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
