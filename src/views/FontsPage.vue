<script setup lang="ts">
import { IonBackButton, IonButton, IonButtons, IonContent, IonFooter, IonHeader, IonIcon, IonItem, IonLabel, IonList, IonPage, IonTitle, IonToolbar } from '@ionic/vue';
import { add, textOutline, trashOutline } from 'ionicons/icons';
import { useCustomFonts } from '../composables/stores';
import { t } from '../i18n';
import { blobToBytes } from '../lib/bytes';
import { addCustomFont, removeCustomFont, type FontChoice } from '../lib/fonts';
import { pickFile } from '../lib/pickers';
import { alert, confirm } from '../ui/overlays';

// Types accepted by the file picker: several common font MIME types, plus file extensions.
const FONT_ACCEPT = '.ttf,.otf,font/ttf,font/otf,application/x-font-ttf,application/x-font-otf,application/octet-stream';

const fonts = useCustomFonts();

async function addFont(): Promise<void> {
  const picked = await pickFile(FONT_ACCEPT);
  if (!picked) {
    return;
  }

  try {
    await addCustomFont(picked.name, await blobToBytes(picked.blob));
  } catch {
    await alert({ title: t.error, message: t.fontInvalid, okLabel: t.ok });
  }
}

async function removeFont(font: FontChoice): Promise<void> {
  const yes = await confirm({ title: t.fontDeleteTitle, message: font.label, confirmLabel: t.delete, cancelLabel: t.cancel, danger: true });
  if (yes) {
    await removeCustomFont(font);
  }
}
</script>

<template>
  <ion-page data-testid="fonts-screen">
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button data-testid="fonts-back" default-href="/settings" />
        </ion-buttons>
        <ion-title>{{ t.fontsTitle }}</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      <div v-if="fonts.length === 0" class="empty" data-testid="fonts-empty">
        <strong>{{ t.fontsEmptyTitle }}</strong>
        {{ t.fontsEmptyText }}
      </div>
      <ion-list v-else>
        <ion-item v-for="font in fonts" :key="font.id" data-testid="font-row">
          <ion-icon slot="start" :icon="textOutline" />
          <ion-label>{{ font.label }}</ion-label>
          <ion-button slot="end" fill="clear" color="danger" data-testid="font-delete" :aria-label="t.delete" @click="removeFont(font)">
            <ion-icon slot="icon-only" :icon="trashOutline" />
          </ion-button>
        </ion-item>
      </ion-list>
    </ion-content>
    <ion-footer>
      <ion-toolbar>
        <ion-button expand="block" class="ion-margin-horizontal" data-testid="font-add" @click="addFont()">
          <ion-icon slot="start" :icon="add" />
          {{ t.fontsAdd }}
        </ion-button>
      </ion-toolbar>
    </ion-footer>
  </ion-page>
</template>
