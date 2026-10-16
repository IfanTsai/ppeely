<script setup lang="ts">
// Text input layer: input box, 7 color pairs, style switch (background, outline, no background, rainbow) and font switch, with a live preview of the finished bitmap above.
import { IonButton, IonContent, IonIcon, IonTextarea, modalController } from '@ionic/vue';
import { checkmark, close, colorFilterOutline } from 'ionicons/icons';
import { ref, shallowRef, watch } from 'vue';
import { t } from '../i18n';
import { ensureFontLoaded, getFontChoices } from '../lib/fonts';
import { COLOR_PAIRS, DRAW_STYLES, renderText, type TextConfig } from '../lib/textRender';

const props = defineProps<{ initial: TextConfig }>();

const config = shallowRef<TextConfig>({ ...props.initial });
const preview = ref<string | null>(null);

watch(
  config,
  async (current) => {
    await ensureFontLoaded(current.font).catch(() => undefined);
    // The configuration may change again while the font loads; only show the preview for the latest configuration.
    if (config.value === current) {
      preview.value = renderText(current)?.toDataURL('image/png') ?? null;
    }
  },
  { immediate: true },
);

const update = (patch: Partial<TextConfig>) => {
  config.value = { ...config.value, ...patch };
};

function cycleStyle(): void {
  const index = DRAW_STYLES.indexOf(config.value.drawStyle);
  update({ drawStyle: DRAW_STYLES[(index + 1) % DRAW_STYLES.length] });
}

function cycleFont(): void {
  const fonts = getFontChoices();
  const index = fonts.findIndex((font) => font.id === config.value.font.id);
  update({ font: fonts[(index + 1) % fonts.length] });
}
</script>

<template>
  <ion-content class="text-editor-content" :scroll-y="false">
    <div class="text-editor" data-testid="text-editor">
      <div class="text-editor-bar">
        <ion-button fill="clear" color="light" data-testid="text-cancel" :aria-label="t.cancel" @click="modalController.dismiss()">
          <ion-icon slot="icon-only" :icon="close" />
        </ion-button>
        <ion-button fill="outline" color="light" data-testid="text-style" :data-style="config.drawStyle" @click="cycleStyle">
          <ion-icon slot="icon-only" :icon="colorFilterOutline" />
        </ion-button>
        <ion-button fill="outline" color="light" class="font-button" data-testid="text-font" :data-font="config.font.id" @click="cycleFont">
          {{ config.font.label }}
        </ion-button>
        <ion-button color="primary" data-testid="text-save" :aria-label="t.save" @click="modalController.dismiss(config)">
          <ion-icon slot="icon-only" :icon="checkmark" />
        </ion-button>
      </div>
      <div class="text-preview">
        <img v-if="preview" data-testid="text-preview" :src="preview" alt="" />
      </div>
      <ion-textarea
        class="text-input"
        data-testid="text-input"
        :model-value="config.text"
        :placeholder="t.textPlaceholder"
        :rows="2"
        :auto-grow="true"
        :autofocus="true"
        autocapitalize="off"
        :spellcheck="false"
        @ion-input="update({ text: String($event.detail.value ?? '') })"
      />
      <div class="color-row">
        <button
          v-for="pair in COLOR_PAIRS"
          :key="pair.color1"
          class="color-dot"
          :class="{ selected: pair.color1 === config.color1 }"
          data-testid="text-color"
          :style="{ background: pair.color1 }"
          @click="update(pair)"
        />
      </div>
    </div>
  </ion-content>
</template>
