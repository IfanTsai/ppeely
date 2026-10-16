<script setup lang="ts">
import { IonBackButton, IonButtons, IonContent, IonHeader, IonIcon, IonItem, IonLabel, IonList, IonListHeader, IonNote, IonPage, IonTitle, IonToggle, IonToolbar, onIonViewWillEnter, useIonRouter } from '@ionic/vue';
import { checkmarkOutline, cloudDownloadOutline, cloudUploadOutline, documentTextOutline, informationCircleOutline, keypadOutline, languageOutline, textOutline, trashOutline } from 'ionicons/icons';
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useSettings } from '../composables/stores';
import { describeError } from '../flows';
import { languageNames, t, type LanguagePreference } from '../i18n';
import { BACKUP_FILE_EXTENSION, isBackupFile, restoreBackup, shareBackup } from '../lib/backup';
import { blobToBytes } from '../lib/bytes';
import { platform, StickerBridge, type KeyboardStatus } from '../lib/native';
import { deleteAllPacks, getPacks } from '../lib/packs';
import { pickFile } from '../lib/pickers';
import { updateSettings } from '../lib/settings';
import { alert, chooseFromSheet, confirm, toast, withBusy } from '../ui/overlays';

const version = __APP_VERSION__;

const ionRouter = useIonRouter();
const settings = useSettings();
const importer = ref<boolean | null>(null);
const keyboard = ref<KeyboardStatus>({ available: false, enabled: false });

// Re-read the keyboard and file association status after returning from system settings (when the app comes back to the foreground).
function refresh(): void {
  void StickerBridge.getKeyboardStatus().then((status) => {
    keyboard.value = status;
  });
  void StickerBridge.getImporterEnabled().then((result) => {
    importer.value = result.enabled;
  });
}

onMounted(() => document.addEventListener('visibilitychange', refresh));
onUnmounted(() => document.removeEventListener('visibilitychange', refresh));
onIonViewWillEnter(refresh);

const languageLabel = computed(() => (settings.value.language === 'system' ? t.languageSystem : languageNames[settings.value.language]));

async function chooseLanguage(): Promise<void> {
  const options: { value: LanguagePreference; label: string }[] = [
    { value: 'system', label: t.languageSystem },
    { value: 'en', label: languageNames.en },
    { value: 'zh', label: languageNames.zh },
  ];
  const current = settings.value.language;
  const language = await chooseFromSheet(
    t.settingsLanguage,
    options.map((option) => ({ ...option, icon: option.value === current ? checkmarkOutline : undefined })),
  );
  if (language && language !== current) {
    await updateSettings({ language });
  }
}

async function toggleImporter(): Promise<void> {
  const enabled = !importer.value;
  await StickerBridge.setImporterEnabled({ enabled });
  importer.value = enabled;
}

async function backup(): Promise<void> {
  if (getPacks().length === 0) {
    void toast(t.backupEmpty);

    return;
  }

  try {
    await withBusy(t.creatingBackup, (_update, release) => shareBackup(t.settingsBackupCreate, release));
  } catch (error) {
    await alert({ title: t.error, message: describeError(error), okLabel: t.ok });
  }
}

async function restore(): Promise<void> {
  const picked = await pickFile(`${BACKUP_FILE_EXTENSION},application/zip,application/octet-stream`);
  if (!picked) {
    return;
  }

  const bytes = await blobToBytes(picked.blob);
  if (!isBackupFile(bytes)) {
    await alert({ title: t.error, message: t.backupInvalid, okLabel: t.ok });

    return;
  }

  try {
    const count = await withBusy(t.restoringBackup, () => restoreBackup(bytes));
    void toast(t.backupRestored(count), 3200);
  } catch (error) {
    await alert({ title: t.error, message: describeError(error), okLabel: t.ok });
  }
}

async function deleteAll(): Promise<void> {
  const yes = await confirm({ title: t.deleteAllTitle, message: t.deleteAllMessage, confirmLabel: t.delete, cancelLabel: t.cancel, danger: true });
  if (yes) {
    await deleteAllPacks();
    void toast(t.allDeleted);
  }
}
</script>

<template>
  <ion-page data-testid="settings-screen">
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button data-testid="settings-back" default-href="/" />
        </ion-buttons>
        <ion-title>{{ t.settings }}</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      <ion-list>
        <ion-list-header>{{ t.settingsGeneral }}</ion-list-header>
        <ion-item button :detail="false" data-testid="setting-language" @click="chooseLanguage()">
          <ion-icon slot="start" :icon="languageOutline" />
          <ion-label>{{ t.settingsLanguage }}</ion-label>
          <ion-note slot="end" data-testid="setting-language-value">{{ languageLabel }}</ion-note>
        </ion-item>
      </ion-list>

      <ion-list>
        <ion-list-header>{{ t.settingsAnimation }}</ion-list-header>
        <!-- The toggle state lives on the whole row (role and aria-checked); the ion-toggle inside the row is display-only. -->
        <ion-item button :detail="false" role="switch" :aria-checked="settings.animationQuality" data-testid="setting-animation-quality" @click="updateSettings({ animationQuality: !settings.animationQuality })">
          <ion-label class="ion-text-wrap">
            {{ t.settingsAnimationQuality }}
            <p>{{ t.settingsAnimationQualityHint }}</p>
          </ion-label>
          <ion-toggle slot="end" class="display-only" :checked="settings.animationQuality" :aria-label="t.settingsAnimationQuality" />
        </ion-item>
        <ion-item button :detail="false" role="switch" :aria-checked="settings.animationFrameLimit" data-testid="setting-frame-limit" @click="updateSettings({ animationFrameLimit: !settings.animationFrameLimit })">
          <ion-label class="ion-text-wrap">
            {{ t.settingsFrameLimit }}
            <p>{{ t.settingsFrameLimitHint }}</p>
          </ion-label>
          <ion-toggle slot="end" class="display-only" :checked="settings.animationFrameLimit" :aria-label="t.settingsFrameLimit" />
        </ion-item>
      </ion-list>

      <ion-list>
        <ion-list-header>{{ t.settingsFiles }}</ion-list-header>
        <ion-item v-if="platform === 'android' && importer !== null" button :detail="false" role="switch" :aria-checked="importer" data-testid="setting-importer" @click="toggleImporter()">
          <ion-label class="ion-text-wrap">
            {{ t.settingsImporter }}
            <p>{{ t.settingsImporterHint }}</p>
          </ion-label>
          <ion-toggle slot="end" class="display-only" :checked="importer" :aria-label="t.settingsImporter" />
        </ion-item>
        <ion-item button data-testid="setting-fonts" @click="ionRouter.push('/settings/fonts')">
          <ion-icon slot="start" :icon="textOutline" />
          <ion-label class="ion-text-wrap">
            {{ t.settingsCustomFonts }}
            <p>{{ t.settingsCustomFontsHint }}</p>
          </ion-label>
        </ion-item>
      </ion-list>

      <ion-list v-if="keyboard.available">
        <ion-list-header>{{ t.settingsKeyboard }}</ion-list-header>
        <ion-item button data-testid="setting-keyboard-enable" @click="StickerBridge.openKeyboardSettings()">
          <ion-icon slot="start" :icon="keypadOutline" />
          <ion-label class="ion-text-wrap">
            {{ t.settingsKeyboardEnable }}
            <p>{{ t.settingsKeyboardHint }} · {{ keyboard.enabled ? t.settingsKeyboardEnabled : t.settingsKeyboardDisabled }}</p>
          </ion-label>
        </ion-item>
        <ion-item v-if="keyboard.enabled" button :detail="false" data-testid="setting-keyboard-switch" @click="StickerBridge.showKeyboardPicker()">
          <ion-icon slot="start" :icon="keypadOutline" />
          <ion-label>{{ t.settingsKeyboardSwitch }}</ion-label>
        </ion-item>
      </ion-list>

      <ion-list>
        <ion-list-header>{{ t.settingsBackup }}</ion-list-header>
        <ion-item button :detail="false" data-testid="setting-backup" @click="backup()">
          <ion-icon slot="start" :icon="cloudUploadOutline" />
          <ion-label class="ion-text-wrap">
            {{ t.settingsBackupCreate }}
            <p>{{ t.settingsBackupCreateHint }}</p>
          </ion-label>
        </ion-item>
        <ion-item button :detail="false" data-testid="setting-restore" @click="restore()">
          <ion-icon slot="start" :icon="cloudDownloadOutline" />
          <ion-label class="ion-text-wrap">
            {{ t.settingsBackupRestore }}
            <p>{{ t.settingsBackupRestoreHint }}</p>
          </ion-label>
        </ion-item>
      </ion-list>

      <ion-list>
        <ion-list-header>{{ t.settingsDanger }}</ion-list-header>
        <ion-item button :detail="false" data-testid="setting-delete-all" @click="deleteAll()">
          <ion-icon slot="start" color="danger" :icon="trashOutline" />
          <ion-label class="ion-text-wrap" color="danger">
            {{ t.settingsDeleteAll }}
            <p>{{ t.settingsDeleteAllHint }}</p>
          </ion-label>
        </ion-item>
      </ion-list>

      <ion-list>
        <ion-list-header>{{ t.about }}</ion-list-header>
        <ion-item data-testid="setting-about">
          <ion-icon slot="start" :icon="informationCircleOutline" />
          <ion-label class="ion-text-wrap">
            {{ t.appName }} {{ version }}
            <p>{{ t.aboutText }}</p>
            <p>{{ t.aboutDisclaimer }}</p>
          </ion-label>
        </ion-item>
        <ion-item button data-testid="setting-licenses" @click="ionRouter.push('/settings/licenses')">
          <ion-icon slot="start" :icon="documentTextOutline" />
          <ion-label>{{ t.licensesTitle }}</ion-label>
        </ion-item>
      </ion-list>
    </ion-content>
  </ion-page>
</template>
