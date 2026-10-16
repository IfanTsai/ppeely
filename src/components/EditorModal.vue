<script setup lang="ts">
// Sticker editor in two steps: cut first, then add an outline and text;
// without an image it is in text-only mode and goes straight to the second step. When done, it closes the modal with a 512×512 sticker canvas.
import { IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonTitle, IonToolbar, modalController, useBackButton } from '@ionic/vue';
import { arrowBack, close } from 'ionicons/icons';
import { computed, onUnmounted, shallowRef } from 'vue';
import { t } from '../i18n';
import { cutoutWithMask, cutoutWithPath, rotateClockwise } from '../lib/cutout';
import { segmentSubject } from '../lib/segmentation';
import { toast, withBusy } from '../ui/overlays';
import CutStep from './CutStep.vue';
import DecorateStep from './DecorateStep.vue';

const props = defineProps<{
  // The image to edit; null means a text-only sticker.
  image: HTMLCanvasElement | null;
}>();

interface Cutout {
  canvas: HTMLCanvasElement;
  selectAll: boolean;
}

const image = shallowRef(props.image);
const cutout = shallowRef<Cutout | null>(null);

const decorating = computed(() => cutout.value !== null || image.value === null);

// From the second step, going back returns to the cut step; in text-only mode and in the cut step, it exits the editor.
function back(): void {
  if (cutout.value) {
    cutout.value = null;
  } else {
    void modalController.dismiss();
  }
}

// The system back button handler must take priority over Ionic's default handling for closing modals (100).
// useBackButton doesn't unregister automatically when the component unmounts, so opening and closing the modal repeatedly would pile up handlers; it must be unregistered manually.
const backButton = useBackButton(110, back);
onUnmounted(() => backButton.unregister());

// Wait until the browser has painted the loading overlay before starting computation that occupies the main thread.
const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));

async function cut(path: Path2D | null): Promise<void> {
  const canvas = await withBusy(t.loading, async () => {
    await nextFrame();

    return cutoutWithPath(image.value!, path);
  });

  if (canvas) {
    cutout.value = { canvas, selectAll: path === null };
  } else {
    void toast(t.selectionEmpty);
  }
}

async function smartSelect(): Promise<void> {
  try {
    const canvas = await withBusy(t.smartSelecting, async () => {
      await nextFrame();
      const mask = await segmentSubject(image.value!);

      return mask ? cutoutWithMask(image.value!, mask) : null;
    });

    if (canvas) {
      cutout.value = { canvas, selectAll: false };
    } else {
      void toast(t.smartSelectFailed);
    }
  } catch (error) {
    console.error(error);
    void toast(t.smartSelectFailed);
  }
}

async function rotate(): Promise<void> {
  image.value = await withBusy(t.rotating, async () => {
    await nextFrame();

    return rotateClockwise(image.value!);
  });
}
</script>

<template>
  <ion-header>
    <ion-toolbar color="dark">
      <ion-buttons slot="start">
        <ion-button data-testid="editor-close" :aria-label="t.cancel" @click="back">
          <ion-icon slot="icon-only" :icon="cutout ? arrowBack : close" />
        </ion-button>
      </ion-buttons>
      <ion-title>{{ decorating ? t.saveSticker : t.freehand }}</ion-title>
    </ion-toolbar>
  </ion-header>
  <ion-content class="editor-content" :scroll-y="false" data-testid="editor-screen">
    <DecorateStep
      v-if="decorating"
      :cutout="cutout?.canvas ?? null"
      :select-all="cutout?.selectAll ?? false"
      @back="back"
      @done="modalController.dismiss($event)"
    />
    <CutStep v-else :image="image!" @rotate="rotate" @smart-select="smartSelect" @cut="cut" />
  </ion-content>
</template>
