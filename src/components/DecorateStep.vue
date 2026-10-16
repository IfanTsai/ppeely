<script setup lang="ts">
// Second editor step: add an outline to the cutout, overlay text layers, then composite the sticker.
import { IonButton, IonIcon, IonRange, modalController } from '@ionic/vue';
import { checkmark, close, radioButtonOnOutline, textOutline, trashOutline } from 'ionicons/icons';
import { onMounted, onUnmounted, ref, shallowRef, watch } from 'vue';
import { t } from '../i18n';
import { composeSticker, LAYER_MAX_SCALE, LAYER_MIN_SCALE, type TextLayer } from '../lib/compose';
import { STICKER_SIZE } from '../lib/constants';
import { CUTOUT_SIZE } from '../lib/cutout';
import { ensureFontLoaded, REGULAR_FONT } from '../lib/fonts';
import { applyOutline } from '../lib/outline';
import { getSettings, updateSettings } from '../lib/settings';
import { COLOR_PAIRS, renderText, type TextConfig } from '../lib/textRender';
import { toast } from '../ui/overlays';
import TextEditorModal from './TextEditorModal.vue';

const props = defineProps<{
  // The 1024×1024 cutout; null in text-only mode.
  cutout: HTMLCanvasElement | null;
  selectAll: boolean;
}>();

const emit = defineEmits<{
  back: [];
  done: [sticker: HTMLCanvasElement];
}>();

interface StageLayer extends TextLayer {
  url: string;
}

interface Point {
  x: number;
  y: number;
}

// Upper bound of the outline width slider, in pixels on the finished sticker (the sticker is 512 pixels per side).
const OUTLINE_MAX_PIXELS = 24;

// Margin around the base image, in CSS pixels.
const STAGE_PADDING = 30;

// Maximum movement distance and duration for a gesture to count as a "tap" rather than a "drag".
const TAP_SLOP = 8;
const TAP_TIMEOUT_MS = 350;

const settings = getSettings();
const outlineValue = ref(props.selectAll ? settings.outlineWidthSelectAll : settings.outlineWidth);
const outlineColor = ref(settings.outlineColor);
const outlineOpen = ref(false);
const layers = shallowRef<StageLayer[]>([]);
const unit = ref(0.3);
const dragging = ref(false);
const overDelete = ref(false);

const stageRef = ref<HTMLDivElement | null>(null);
const baseCanvasRef = ref<HTMLCanvasElement | null>(null);
const deleteRef = ref<HTMLDivElement | null>(null);

let rendered: { key: string; canvas: HTMLCanvasElement } | null = null;
let lastConfig: TextConfig = { text: '', ...COLOR_PAIRS[0], drawStyle: 'background', font: REGULAR_FONT };
let nextLayerId = 1;
let frame = 0;
let observer: ResizeObserver | null = null;

const gesture = { layerId: 0, pointers: new Map<number, Point>(), startedAt: 0, moved: 0 };

// Renders the base image with the current outline parameters; reuses the previous result when the parameters haven't changed.
// Also called on save: on slower devices the user may tap save before the on-screen outline finishes rendering.
function renderBase(): HTMLCanvasElement | null {
  if (!props.cutout) {
    return null;
  }

  const key = `${outlineValue.value}/${outlineColor.value}`;
  if (rendered?.key !== key) {
    const canvas = applyOutline(props.cutout, { width: outlineValue.value / STICKER_SIZE, color: hexToRgb(outlineColor.value) });
    rendered = { key, canvas };
  }

  return rendered.canvas;
}

// Re-render the base image when the outline parameters change; run it on the next frame so dragging the slider only renders the latest value.
function scheduleBase(): void {
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(() => {
    const base = renderBase();
    const context = baseCanvasRef.value?.getContext('2d');
    if (base && context) {
      context.clearRect(0, 0, CUTOUT_SIZE, CUTOUT_SIZE);
      context.drawImage(base, 0, 0);
    }
  });
}

// CSS pixels per stage unit: makes the 1024-unit base image fit exactly in the stage after leaving the margin.
function measure(): void {
  const stage = stageRef.value;
  if (stage && stage.clientWidth > 0) {
    unit.value = Math.max(0.05, (Math.min(stage.clientWidth, stage.clientHeight) - STAGE_PADDING * 2) / CUTOUT_SIZE);
  }
}

onMounted(() => {
  measure();
  observer = new ResizeObserver(measure);
  observer.observe(stageRef.value!);
  scheduleBase();

  // In text-only mode, open text input right after entering the page.
  if (!props.cutout) {
    void editText(null);
  }
});
onUnmounted(() => {
  observer?.disconnect();
  cancelAnimationFrame(frame);
});
watch([outlineValue, outlineColor], scheduleBase);

// While dragging the slider only update the preview (ionInput); write the setting on release (ionChange), to avoid writing to persistent storage every frame.
function previewOutline(value: number, color: string): void {
  outlineValue.value = value;
  outlineColor.value = color;
}

function changeOutline(value: number, color: string): void {
  previewOutline(value, color);
  void updateSettings(props.selectAll ? { outlineWidthSelectAll: value, outlineColor: color } : { outlineWidth: value, outlineColor: color });
}

async function editText(layer: StageLayer | null): Promise<void> {
  const modal = await modalController.create({
    component: TextEditorModal,
    componentProps: { initial: layer?.config ?? { ...lastConfig, text: '' } },
    cssClass: 'text-editor-modal',
    backdropDismiss: false,
  });
  await modal.present();

  const { data: config } = await modal.onDidDismiss<TextConfig>();
  if (!config) {
    return;
  }

  lastConfig = config;
  await ensureFontLoaded(config.font).catch(() => undefined);

  const bitmap = renderText(config);
  if (!bitmap) {
    // The text was cleared: remove the layer being edited along with it.
    if (layer) {
      layers.value = layers.value.filter((item) => item.id !== layer.id);
    }

    return;
  }

  const url = bitmap.toDataURL('image/png');
  if (layer) {
    layers.value = layers.value.map((item) => (item.id === layer.id ? { ...item, config, bitmap, url } : item));
  } else {
    layers.value = [...layers.value, { id: nextLayerId++, config, bitmap, url, x: 0, y: 0, scale: 1, rotation: 0 }];
  }
}

function save(): void {
  if (!props.cutout && layers.value.length === 0) {
    void toast(t.nothingToSave);

    return;
  }

  try {
    emit('done', composeSticker(renderBase(), layers.value));
  } catch {
    void toast(t.nothingToSave);
  }
}

function stagePoint(event: PointerEvent): Point {
  const rect = stageRef.value!.getBoundingClientRect();

  return { x: event.clientX - rect.left - rect.width / 2, y: event.clientY - rect.top - rect.height / 2 };
}

function insideDeleteZone(event: PointerEvent): boolean {
  const rect = deleteRef.value?.getBoundingClientRect();

  return !!rect && event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom;
}

function updateLayer(id: number, change: (layer: StageLayer) => StageLayer): void {
  layers.value = layers.value.map((layer) => (layer.id === id ? change(layer) : layer));
}

function onPointerDown(event: PointerEvent): void {
  const target = (event.target as HTMLElement).closest<HTMLElement>('[data-layer-id]');

  if (gesture.pointers.size === 0) {
    if (!target) {
      return;
    }

    gesture.layerId = Number(target.dataset.layerId);
    gesture.startedAt = Date.now();
    gesture.moved = 0;
    dragging.value = true;
    // Bring the touched layer to the top.
    layers.value = [...layers.value.filter((layer) => layer.id !== gesture.layerId), ...layers.value.filter((layer) => layer.id === gesture.layerId)];
  }

  stageRef.value!.setPointerCapture(event.pointerId);
  gesture.pointers.set(event.pointerId, stagePoint(event));
}

function onPointerMove(event: PointerEvent): void {
  const previous = gesture.pointers.get(event.pointerId);
  if (!previous) {
    return;
  }

  const point = stagePoint(event);
  const scale = unit.value;
  gesture.moved += Math.hypot(point.x - previous.x, point.y - previous.y);

  if (gesture.pointers.size === 1) {
    updateLayer(gesture.layerId, (layer) => ({ ...layer, x: layer.x + (point.x - previous.x) / scale, y: layer.y + (point.y - previous.y) / scale }));
    overDelete.value = insideDeleteZone(event);
  } else {
    // Two fingers: scale and rotate around the midpoint between them, while panning to follow the midpoint.
    const other = [...gesture.pointers.entries()].find(([id]) => id !== event.pointerId)![1];
    const before = { x: (previous.x + other.x) / 2, y: (previous.y + other.y) / 2 };
    const after = { x: (point.x + other.x) / 2, y: (point.y + other.y) / 2 };
    const zoom = Math.hypot(point.x - other.x, point.y - other.y) / Math.max(1, Math.hypot(previous.x - other.x, previous.y - other.y));
    const turn = Math.atan2(point.y - other.y, point.x - other.x) - Math.atan2(previous.y - other.y, previous.x - other.x);

    updateLayer(gesture.layerId, (layer) => {
      const nextScale = Math.min(LAYER_MAX_SCALE, Math.max(LAYER_MIN_SCALE, layer.scale * zoom));
      const applied = nextScale / layer.scale;
      const offsetX = layer.x * scale - before.x;
      const offsetY = layer.y * scale - before.y;
      const cos = Math.cos(turn) * applied;
      const sin = Math.sin(turn) * applied;

      return {
        ...layer,
        scale: nextScale,
        rotation: layer.rotation + turn,
        x: (after.x + offsetX * cos - offsetY * sin) / scale,
        y: (after.y + offsetX * sin + offsetY * cos) / scale,
      };
    });
  }

  gesture.pointers.set(event.pointerId, point);
}

function onPointerUp(event: PointerEvent): void {
  if (!gesture.pointers.delete(event.pointerId) || gesture.pointers.size > 0) {
    return;
  }

  dragging.value = false;
  overDelete.value = false;

  const layer = layers.value.find((item) => item.id === gesture.layerId);
  if (!layer) {
    return;
  }

  if (insideDeleteZone(event)) {
    layers.value = layers.value.filter((item) => item.id !== layer.id);
  } else if (gesture.moved < TAP_SLOP && Date.now() - gesture.startedAt < TAP_TIMEOUT_MS) {
    void editText(layer);
  }
}

function hexToRgb(hex: string): [number, number, number] {
  const value = parseInt(hex.slice(1), 16);

  return [((value >> 16) & 0xff) / 255, ((value >> 8) & 0xff) / 255, (value & 0xff) / 255];
}
</script>

<template>
  <div class="decorate-step" data-testid="decorate-step">
    <div ref="stageRef" class="stage checker" data-testid="stage" @pointerdown="onPointerDown" @pointermove="onPointerMove" @pointerup="onPointerUp" @pointercancel="onPointerUp">
      <canvas
        v-if="cutout"
        ref="baseCanvasRef"
        class="stage-base"
        data-testid="stage-base"
        :width="CUTOUT_SIZE"
        :height="CUTOUT_SIZE"
        :style="{ width: `${CUTOUT_SIZE * unit}px`, height: `${CUTOUT_SIZE * unit}px` }"
      />
      <img
        v-for="layer in layers"
        :key="layer.id"
        class="stage-layer"
        data-testid="text-layer"
        :data-layer-id="layer.id"
        :src="layer.url"
        alt=""
        draggable="false"
        :style="{
          width: `${layer.bitmap.width * unit}px`,
          height: `${layer.bitmap.height * unit}px`,
          transform: `translate(-50%, -50%) translate(${layer.x * unit}px, ${layer.y * unit}px) rotate(${layer.rotation}rad) scale(${layer.scale})`,
        }"
      />
      <!-- The delete zone always stays in the component tree and is only shown while dragging a layer. -->
      <div ref="deleteRef" class="delete-zone" :class="{ visible: dragging, active: overDelete }" data-testid="delete-zone" :aria-label="t.dropToDelete">
        <ion-icon :icon="trashOutline" />
      </div>
    </div>
    <div v-if="outlineOpen && cutout" class="outline-panel" data-testid="outline-panel">
      <div class="panel-title">
        {{ t.outlineColor }}
        <ion-button fill="clear" color="light" size="small" data-testid="outline-close" @click="outlineOpen = false">
          <ion-icon slot="icon-only" :icon="close" />
        </ion-button>
      </div>
      <div class="color-row">
        <button
          v-for="pair in COLOR_PAIRS"
          :key="pair.color1"
          class="color-dot"
          :class="{ selected: pair.color1 === outlineColor }"
          data-testid="outline-color"
          :style="{ background: pair.color1 }"
          @click="changeOutline(outlineValue, pair.color1)"
        />
      </div>
      <div class="panel-title">{{ t.outlineWidth }}</div>
      <ion-range data-testid="outline-width" :aria-label="t.outlineWidth" :min="0" :max="OUTLINE_MAX_PIXELS" :value="outlineValue" @ion-input="previewOutline(Number($event.detail.value), outlineColor)" @ion-change="changeOutline(Number($event.detail.value), outlineColor)" />
    </div>
    <!-- While dragging a layer, hide the toolbar instead of removing it: removing it would change the stage height and make the layer jump under the finger. -->
    <div class="decorate-tools" :class="{ hidden: dragging }">
      <div class="tool-row">
        <ion-button color="medium" data-testid="add-text" @click="editText(null)">
          <ion-icon slot="start" :icon="textOutline" />
          {{ t.addText }}
        </ion-button>
        <ion-button v-if="cutout" color="medium" data-testid="open-outline" @click="outlineOpen = !outlineOpen">
          <ion-icon slot="start" :icon="radioButtonOnOutline" />
          {{ t.outline }}
        </ion-button>
      </div>
      <div class="tool-row">
        <ion-button color="medium" data-testid="decorate-back" @click="emit('back')">
          {{ cutout ? t.tryAgain : t.cancel }}
        </ion-button>
        <ion-button color="primary" data-testid="save-sticker" @click="save">
          <ion-icon slot="start" :icon="checkmark" />
          {{ t.saveSticker }}
        </ion-button>
      </div>
    </div>
  </div>
</template>
