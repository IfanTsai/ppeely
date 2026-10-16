<script setup lang="ts">
// Emoji picker: arranged in the six categories of WhatsApp sticker search, in an 8-column grid, up to 3 selected; beyond that the last 3 selected are kept.
import { IonButton, IonButtons, IonContent, IonHeader, IonTitle, IonToolbar, modalController } from '@ionic/vue';
import { ref } from 'vue';
import { t } from '../i18n';
import { STICKER_MAX_EMOJIS } from '../lib/constants';
import { EMOJI_GROUPS } from '../lib/emoji';

const props = defineProps<{ initial: string[] }>();

const selected = ref([...props.initial]);

function toggle(emoji: string): void {
  selected.value = selected.value.includes(emoji) ? selected.value.filter((item) => item !== emoji) : [...selected.value, emoji].slice(-STICKER_MAX_EMOJIS);
}
</script>

<template>
  <ion-header>
    <ion-toolbar>
      <ion-buttons slot="start">
        <ion-button @click="modalController.dismiss()">{{ t.cancel }}</ion-button>
      </ion-buttons>
      <ion-title>{{ t.changeEmoji }}</ion-title>
      <ion-buttons slot="end">
        <ion-button data-testid="emoji-save" :strong="true" @click="modalController.dismiss(selected)">{{ t.save }}</ion-button>
      </ion-buttons>
    </ion-toolbar>
  </ion-header>
  <ion-content class="ion-padding" data-testid="emoji-picker">
    <p class="note">{{ t.changeEmojiHint }}</p>
    <template v-for="group in EMOJI_GROUPS" :key="group.id">
      <div class="emoji-group-title">{{ t.emojiGroups[group.id] }}</div>
      <div class="emoji-grid" :data-group="group.id">
        <button v-for="emoji in group.emojis" :key="emoji" class="emoji" :class="{ selected: selected.includes(emoji) }" data-testid="emoji-option" @click="toggle(emoji)">
          {{ emoji }}
        </button>
      </div>
    </template>
  </ion-content>
</template>
