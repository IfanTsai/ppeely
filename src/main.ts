import { IonicVue } from '@ionic/vue';
import { createApp } from 'vue';
import App from './App.vue';
import { setLanguagePreference, t } from './i18n';
import { loadCustomFonts } from './lib/fonts';
import { initFilesystem } from './lib/fs';
import { loadPacks } from './lib/packs';
import { getSettings, loadSettings, subscribeSettings } from './lib/settings';
import { router } from './router';

import '@ionic/vue/css/core.css';
import '@ionic/vue/css/normalize.css';
import '@ionic/vue/css/structure.css';
import '@ionic/vue/css/typography.css';
import '@ionic/vue/css/padding.css';
import '@ionic/vue/css/flex-utils.css';
import '@ionic/vue/css/palettes/dark.system.css';
import './styles.css';

async function start(): Promise<void> {
  await initFilesystem();
  await Promise.all([loadSettings(), loadPacks(), loadCustomFonts()]);
  setLanguagePreference(getSettings().language);
  subscribeSettings(() => setLanguagePreference(getSettings().language));

  // Ionic reads the back button text (shown on iOS only) when the button renders, so a language change applies to pages opened afterwards.
  const app = createApp(App).use(IonicVue, { backButtonText: t.back }).use(router);
  await router.isReady();
  app.mount('#app');
}

// When startup fails the Vue app is not mounted yet, so the error and a retry button are rendered directly with the DOM to avoid a blank screen.
function showStartupError(error: unknown): void {
  console.error(error);

  const root = document.getElementById('app');
  if (!root) {
    return;
  }

  const message = document.createElement('p');
  message.textContent = t.startupFailed;

  const retry = document.createElement('button');
  retry.type = 'button';
  retry.textContent = t.retry;
  retry.addEventListener('click', () => location.reload());

  const panel = document.createElement('div');
  panel.className = 'startup-error';
  panel.setAttribute('role', 'alert');
  panel.append(message, retry);
  root.replaceChildren(panel);
}

start().catch(showStartupError);
