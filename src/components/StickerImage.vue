<script setup lang="ts">
// Shows an image from a sticker pack directory. Native platforms use the file URL directly; the browser environment reads the file contents and creates a temporary URL.
import { onUnmounted, ref, watchEffect } from 'vue';
import { bytesToBlob } from '../lib/bytes';
import { nativeFileUrl, readBytes } from '../lib/fs';
import { packFilePath } from '../lib/packs';

const props = defineProps<{ packId: string; file: string; version: number }>();

const source = ref<string | null>(null);
let objectUrl: string | null = null;

const release = () => {
  if (objectUrl) {
    URL.revokeObjectURL(objectUrl);
    objectUrl = null;
  }
};

watchEffect(async () => {
  const path = packFilePath(props.packId, props.file);
  const direct = nativeFileUrl(path, props.version);
  if (direct) {
    source.value = direct;

    return;
  }

  try {
    const bytes = await readBytes(path);
    release();
    objectUrl = URL.createObjectURL(bytesToBlob(bytes, props.file.endsWith('.png') ? 'image/png' : 'image/webp'));
    source.value = objectUrl;
  } catch {
    source.value = null;
  }
});

onUnmounted(release);
</script>

<template>
  <img v-if="source" :src="source" alt="" draggable="false" />
  <span v-else />
</template>
