<script setup lang="ts">
// List of third-party software licenses. It is generated at build time by scripts/third-party-notices.ts and placed at the root of the web assets.
import { IonBackButton, IonButtons, IonContent, IonHeader, IonPage, IonTitle, IonToolbar } from '@ionic/vue';
import { onMounted, ref } from 'vue';
import { t } from '../i18n';
import { parseNotices, type Notices } from '../lib/notices';

const notices = ref<Notices | null>(null);
const failed = ref(false);

onMounted(async () => {
  try {
    const response = await fetch('./third-party-notices.txt');
    if (!response.ok) {
      throw new Error(`failed to load third-party notices: HTTP ${response.status}`);
    }

    notices.value = parseNotices(await response.text());
  } catch (error) {
    // The dev server doesn't run the build step that generates the list, so the file can't be read.
    console.error(error);
    failed.value = true;
  }
});
</script>

<template>
  <ion-page data-testid="licenses-screen">
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button data-testid="licenses-back" default-href="/settings" />
        </ion-buttons>
        <ion-title>{{ t.licensesTitle }}</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content class="ion-padding">
      <div v-if="failed" class="empty">{{ t.licensesUnavailable }}</div>
      <div v-else-if="notices" class="licenses" data-testid="licenses-text">
        <p v-for="(paragraph, index) in notices.intro" :key="`intro-${index}`" class="licenses-intro">{{ paragraph }}</p>
        <section v-for="(section, index) in notices.sections" :key="index" class="licenses-section">
          <div v-for="component in section.components" :key="component.title" class="licenses-component">
            <strong>{{ component.title }}</strong>
            <span v-for="detail in component.details" :key="detail">{{ detail }}</span>
          </div>
          <p v-for="(paragraph, line) in section.paragraphs" :key="line" class="licenses-text">{{ paragraph }}</p>
          <template v-if="section.notice.length > 0">
            <p class="licenses-label">NOTICE</p>
            <p v-for="(paragraph, line) in section.notice" :key="`notice-${line}`" class="licenses-text">{{ paragraph }}</p>
          </template>
        </section>
      </div>
    </ion-content>
  </ion-page>
</template>
