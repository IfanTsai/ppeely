<script setup lang="ts">
import { IonBackButton, IonButton, IonButtons, IonContent, IonFooter, IonHeader, IonIcon, IonPage, IonTitle, IonToolbar, modalController, onIonViewWillEnter, useIonRouter } from '@ionic/vue';
import { add, createOutline, ellipsisVertical, happyOutline, shareOutline, trashOutline } from 'ionicons/icons';
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import EmojiPickerModal from '../components/EmojiPickerModal.vue';
import StickerImage from '../components/StickerImage.vue';
import { usePack } from '../composables/stores';
import { addToSlot, describeError } from '../flows';
import { t } from '../i18n';
import { PACK_MAX_STICKERS } from '../lib/constants';
import { addPackToWhatsApp, PackNotReadyError, sharePackFile } from '../lib/delivery';
import { platform, StickerBridge } from '../lib/native';
import { deletePack, removeSticker, renamePack, setStickerEmojis } from '../lib/packs';
import type { Sticker } from '../lib/types';
import { alert, askPackDetails, chooseFromSheet, confirm, toast, withBusy } from '../ui/overlays';

const props = defineProps<{ id: string }>();

const ionRouter = useIonRouter();
const pack = usePack(props.id);
const added = ref(false);

const emptySlots = computed(() => PACK_MAX_STICKERS - (pack.value?.stickers.length ?? 0));

// Ask WhatsApp whether this sticker pack has already been added, which decides the button text; ask again after returning from WhatsApp (when the app comes back to the foreground).
function refreshAdded(): void {
  StickerBridge.isPackAdded({ id: props.id })
    .then((result) => {
      added.value = result.consumer || result.business;
    })
    .catch(() => {
      added.value = false;
    });
}

onMounted(() => document.addEventListener('visibilitychange', refreshAdded));
onUnmounted(() => document.removeEventListener('visibilitychange', refreshAdded));
onIonViewWillEnter(refreshAdded);
watch(() => pack.value?.imageDataVersion, refreshAdded);

async function runGuarded(task: () => Promise<unknown>): Promise<void> {
  try {
    await task();
  } catch (error) {
    console.error(error);
    const message = error instanceof PackNotReadyError ? t.needOneSticker : describeError(error);
    await alert({ title: t.error, message, okLabel: t.ok });
  }
}

async function openMenu(): Promise<void> {
  const current = pack.value;
  if (!current) {
    return;
  }

  const action = await chooseFromSheet<'share' | 'rename' | 'delete'>(current.name, [
    { value: 'share', label: t.sharePack, icon: shareOutline },
    { value: 'rename', label: t.renamePack, icon: createOutline },
    { value: 'delete', label: t.delete, icon: trashOutline, danger: true },
  ]);

  if (action === 'share') {
    await runGuarded(() => withBusy(t.loading, (_update, release) => sharePackFile(current.id, t.sharePack, release)));
  } else if (action === 'rename') {
    const details = await askPackDetails({ title: t.renamePack, confirmLabel: t.save, name: current.name, author: current.author });
    if (details) {
      await renamePack(current.id, details.name, details.author);
    }
  } else if (action === 'delete') {
    const yes = await confirm({ title: t.deletePackTitle, message: t.deletePackMessage, confirmLabel: t.delete, cancelLabel: t.cancel, danger: true });
    if (yes) {
      ionRouter.back();
      await deletePack(current.id);
    }
  }
}

function addToWhatsApp(): Promise<void> {
  return runGuarded(async () => {
    const status = await StickerBridge.getWhatsAppStatus();
    if (platform !== 'web' && !status.consumerInstalled && !status.businessInstalled) {
      await alert({ title: t.error, message: t.whatsAppMissing, okLabel: t.ok });

      return;
    }

    const result = await withBusy(t.loading, (_update, release) => addPackToWhatsApp(props.id, release));
    if (result.added) {
      void toast(added.value ? t.packUpdated : t.packAdded, 3600);
      added.value = true;
    } else if (result.validationError) {
      await alert({ title: t.whatsAppRejected, message: result.validationError, okLabel: t.ok });
    }
  });
}

// Menu for an existing sticker: change emojis, delete.
async function openStickerMenu(sticker: Sticker): Promise<void> {
  const action = await chooseFromSheet<'emoji' | 'delete'>(sticker.emojis.join(' ') || t.changeEmoji, [
    { value: 'emoji', label: t.changeEmoji, icon: happyOutline },
    { value: 'delete', label: t.delete, icon: trashOutline, danger: true },
  ]);

  if (action === 'emoji') {
    const modal = await modalController.create({
      component: EmojiPickerModal,
      componentProps: { initial: sticker.emojis },
      breakpoints: [0, 0.75],
      initialBreakpoint: 0.75,
      // By default the content only scrolls when expanded to full screen, and swiping at the 0.75 height drags the whole sheet; make the content scrollable at the current height.
      expandToScroll: false,
    });
    await modal.present();

    const { data } = await modal.onDidDismiss<string[]>();
    if (data) {
      await setStickerEmojis(props.id, sticker.file, data);
    }
  } else if (action === 'delete') {
    const yes = await confirm({ title: t.deleteStickerTitle, message: t.deleteStickerMessage, confirmLabel: t.delete, cancelLabel: t.cancel, danger: true });
    if (yes) {
      await removeSticker(props.id, sticker.file);
    }
  }
}
</script>

<template>
  <ion-page data-testid="maker-screen" :data-pack-id="id">
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button data-testid="maker-back" default-href="/" />
        </ion-buttons>
        <ion-title v-if="pack">
          <div data-testid="maker-title">{{ pack.name }}</div>
          <div class="toolbar-subtitle">{{ pack.author }} · {{ t.stickerCount(pack.stickers.length) }}</div>
        </ion-title>
        <ion-buttons slot="end">
          <ion-button data-testid="maker-menu" @click="openMenu()">
            <ion-icon slot="icon-only" :icon="ellipsisVertical" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
    <ion-content v-if="pack" class="ion-padding">
      <div class="tray-row">
        <button class="slot checker" data-testid="tray-slot" @click="addToSlot(pack.id, 'tray')">
          <StickerImage v-if="pack.trayIcon" :pack-id="pack.id" :file="pack.trayIcon" :version="pack.imageDataVersion" />
          <ion-icon v-else :icon="add" />
        </button>
        <div>
          <strong>{{ t.trayIcon }}</strong>
          <small>{{ t.addTrayIconHint }}</small>
        </div>
      </div>
      <div class="slot-grid" data-testid="sticker-grid">
        <button
          v-for="sticker in pack.stickers"
          :key="sticker.file"
          class="slot checker"
          data-testid="sticker-slot"
          :data-file="sticker.file"
          :data-animated="sticker.animated && !sticker.wrapped"
          @click="openStickerMenu(sticker)"
        >
          <StickerImage :pack-id="pack.id" :file="sticker.file" :version="pack.imageDataVersion" />
          <span v-if="sticker.emojis.length > 0" class="slot-emojis">{{ sticker.emojis.join('') }}</span>
        </button>
        <button v-for="index in emptySlots" :key="index" class="slot empty-slot" :data-testid="index === 1 ? 'add-sticker' : undefined" @click="addToSlot(pack.id, 'sticker')">
          <ion-icon :icon="add" />
        </button>
      </div>
    </ion-content>
    <ion-footer>
      <ion-toolbar>
        <ion-button expand="block" class="ion-margin-horizontal" data-testid="add-to-whatsapp" @click="addToWhatsApp()">
          {{ added ? t.addChangesToWhatsApp : t.addToWhatsApp }}
        </ion-button>
      </ion-toolbar>
    </ion-footer>
  </ion-page>
</template>
