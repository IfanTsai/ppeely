<script setup lang="ts">
import { IonButton, IonButtons, IonContent, IonFooter, IonHeader, IonIcon, IonPage, IonSearchbar, IonTitle, IonToolbar, useIonRouter } from '@ionic/vue';
import { add, downloadOutline, settingsOutline } from 'ionicons/icons';
import { computed, ref } from 'vue';
import StickerImage from '../components/StickerImage.vue';
import { usePacks } from '../composables/stores';
import { importFromPicker, openMaker } from '../flows';
import { t } from '../i18n';
import { createPack } from '../lib/packs';
import { getSettings, updateSettings } from '../lib/settings';
import { askPackDetails } from '../ui/overlays';

// Show the search box once the number of sticker packs reaches this count.
const SEARCH_THRESHOLD = 7;

const PREVIEW_COUNT = 5;

const ionRouter = useIonRouter();
const packs = usePacks();
const query = ref('');

const visible = computed(() => {
  const keyword = query.value.trim().toLowerCase();
  if (!keyword) {
    return packs.value;
  }

  return packs.value.filter((pack) => pack.name.toLowerCase().includes(keyword) || pack.author.toLowerCase().includes(keyword));
});

async function create(): Promise<void> {
  const details = await askPackDetails({ title: t.createPack, confirmLabel: t.create, name: '', author: getSettings().lastAuthor });
  if (!details) {
    return;
  }

  await updateSettings({ lastAuthor: details.author });
  const pack = await createPack(details.name, details.author);
  openMaker(pack.id);
}
</script>

<template>
  <ion-page data-testid="home-screen">
    <ion-header>
      <ion-toolbar>
        <ion-title>{{ t.appName }}</ion-title>
        <ion-buttons slot="end">
          <ion-button data-testid="home-import" :aria-label="t.importPack" @click="importFromPicker()">
            <ion-icon slot="icon-only" :icon="downloadOutline" />
          </ion-button>
          <ion-button data-testid="home-settings" :aria-label="t.settings" @click="ionRouter.push('/settings')">
            <ion-icon slot="icon-only" :icon="settingsOutline" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
      <ion-toolbar v-if="packs.length >= SEARCH_THRESHOLD">
        <ion-searchbar v-model="query" data-testid="pack-search" :placeholder="t.searchPacks" />
      </ion-toolbar>
    </ion-header>
    <ion-content class="ion-padding">
      <div v-if="packs.length === 0" class="empty" data-testid="home-empty">
        <strong>{{ t.homeEmptyTitle }}</strong>
        {{ t.homeEmptyText }}
      </div>
      <button v-for="pack in visible" :key="pack.id" class="pack-row" data-testid="pack-row" :data-pack-id="pack.id" @click="openMaker(pack.id)">
        <span class="pack-tray checker">
          <StickerImage v-if="pack.trayIcon" :pack-id="pack.id" :file="pack.trayIcon" :version="pack.imageDataVersion" />
        </span>
        <span class="pack-info">
          <strong>{{ pack.name }}</strong>
          <small>
            {{ pack.author }} · {{ t.stickerCount(pack.stickers.length) }}
            <em v-if="pack.stickers.some((sticker) => sticker.animated && !sticker.wrapped)" class="badge">{{ t.animatedBadge }}</em>
          </small>
          <span class="pack-preview">
            <StickerImage v-for="sticker in pack.stickers.slice(0, PREVIEW_COUNT)" :key="sticker.file" :pack-id="pack.id" :file="sticker.file" :version="pack.imageDataVersion" />
          </span>
        </span>
      </button>
    </ion-content>
    <ion-footer>
      <ion-toolbar>
        <ion-button expand="block" class="ion-margin-horizontal" data-testid="create-pack" @click="create()">
          <ion-icon slot="start" :icon="add" />
          {{ t.createPack }}
        </ion-button>
      </ion-toolbar>
    </ion-footer>
  </ion-page>
</template>
