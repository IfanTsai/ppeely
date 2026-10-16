<script setup lang="ts">
import { App as CapacitorApp } from '@capacitor/app';
import { IonApp, IonRouterOutlet, useBackButton, useIonRouter } from '@ionic/vue';
import { onMounted, onUnmounted } from 'vue';
import { importIncomingFile } from './flows';
import { StickerBridge } from './lib/native';

const ionRouter = useIonRouter();

// System back button: Ionic handles going back in dialogs and pages; on the home screen, move the app to the background.
useBackButton(-1, () => {
  if (!ionRouter.canGoBack()) {
    void CapacitorApp.minimizeApp();
  }
});

// Sticker pack files handed over by other apps, both at startup and while running.
const incoming = StickerBridge.addListener('incomingFile', () => void importIncomingFile());

onMounted(() => void importIncomingFile());
onUnmounted(() => void incoming.then((handle) => handle.remove()));
</script>

<template>
  <ion-app>
    <ion-router-outlet />
  </ion-app>
</template>
