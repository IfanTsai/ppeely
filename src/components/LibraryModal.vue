<script setup lang="ts">
// Sticker library: pick an existing sticker as source material for a new sticker.
// "My stickers" lists the stickers in all of this app's sticker packs; "Sent and received stickers" lists sticker files in WhatsApp's media directory (Android only, requires the user to grant access to that directory).
import { Capacitor } from '@capacitor/core';
import { Directory } from '@capacitor/filesystem';
import { IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonLabel, IonSegment, IonSegmentButton, IonTitle, IonToolbar, modalController } from '@ionic/vue';
import { arrowBack } from 'ionicons/icons';
import { computed, onMounted, ref, shallowRef, watch } from 'vue';
import { usePacks } from '../composables/stores';
import { t } from '../i18n';
import { bytesToBlob } from '../lib/bytes';
import { readBytes, removeFile } from '../lib/fs';
import { StickerBridge, type LibrarySticker } from '../lib/native';
import { packFilePath } from '../lib/packs';
import type { PickedFile } from '../lib/pickers';
import StickerImage from './StickerImage.vue';

const packs = usePacks();
const tab = ref<'mine' | 'received'>('mine');
const access = ref({ available: false, granted: false });
const received = shallowRef<LibrarySticker[]>([]);

const mine = computed(() => packs.value.flatMap((pack) => pack.stickers.map((sticker) => ({ pack, sticker }))));

onMounted(async () => {
  access.value = await StickerBridge.getStickerLibraryStatus();
});

watch([tab, () => access.value.granted], async ([currentTab, granted]) => {
  if (currentTab === 'received' && granted) {
    received.value = (await StickerBridge.listStickerLibrary()).stickers;
  }
});

const finish = (picked: PickedFile) => modalController.dismiss(picked);

async function pickMine(packId: string, file: string): Promise<void> {
  const bytes = await readBytes(packFilePath(packId, file));
  await finish({ blob: bytesToBlob(bytes, 'image/webp'), name: file, type: 'image/webp' });
}

async function pickReceived(sticker: LibrarySticker): Promise<void> {
  const { path } = await StickerBridge.copyDocumentToCache({ uri: sticker.uri });

  try {
    const bytes = await readBytes(path, Directory.Cache);
    await finish({ blob: bytesToBlob(bytes, 'image/webp'), name: sticker.name, type: 'image/webp' });
  } finally {
    await removeFile(path, Directory.Cache);
  }
}

async function requestAccess(): Promise<void> {
  const { granted } = await StickerBridge.requestStickerLibraryAccess();
  access.value = { ...access.value, granted };
}
</script>

<template>
  <ion-header data-testid="library-screen">
    <ion-toolbar>
      <ion-buttons slot="start">
        <ion-button data-testid="library-back" :aria-label="t.cancel" @click="modalController.dismiss()">
          <ion-icon slot="icon-only" :icon="arrowBack" />
        </ion-button>
      </ion-buttons>
      <ion-title>{{ t.libraryTitle }}</ion-title>
    </ion-toolbar>
    <ion-toolbar>
      <ion-segment :value="tab" @ion-change="tab = $event.detail.value as 'mine' | 'received'">
        <ion-segment-button value="mine" data-testid="library-tab-mine">
          <ion-label>{{ t.libraryMine }}</ion-label>
        </ion-segment-button>
        <ion-segment-button value="received" data-testid="library-tab-received">
          <ion-label>{{ t.libraryReceived }}</ion-label>
        </ion-segment-button>
      </ion-segment>
    </ion-toolbar>
  </ion-header>
  <ion-content class="ion-padding">
    <template v-if="tab === 'mine'">
      <div v-if="mine.length === 0" class="empty">{{ t.libraryEmpty }}</div>
      <div class="slot-grid">
        <button v-for="item in mine" :key="`${item.pack.id}/${item.sticker.file}`" class="slot checker" data-testid="library-sticker" @click="pickMine(item.pack.id, item.sticker.file)">
          <StickerImage :pack-id="item.pack.id" :file="item.sticker.file" :version="item.pack.imageDataVersion" />
        </button>
      </div>
    </template>
    <template v-else>
      <div v-if="!access.available" class="empty">{{ t.libraryUnavailable }}</div>
      <div v-else-if="!access.granted" class="empty" data-testid="library-need-access">
        {{ t.libraryNeedAccess }}
        <ion-button class="ion-margin-top" data-testid="library-allow" @click="requestAccess()">{{ t.allowAccess }}</ion-button>
      </div>
      <template v-else>
        <p class="note">{{ t.libraryPrivacy }}</p>
        <div v-if="received.length === 0" class="empty">{{ t.libraryEmpty }}</div>
        <div class="slot-grid">
          <button v-for="sticker in received" :key="sticker.uri" class="slot checker" data-testid="library-received-sticker" @click="pickReceived(sticker)">
            <img :src="Capacitor.convertFileSrc(sticker.uri)" alt="" loading="lazy" />
          </button>
        </div>
      </template>
    </template>
  </ion-content>
</template>
