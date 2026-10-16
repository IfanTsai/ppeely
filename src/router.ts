import { createRouter, createWebHashHistory } from '@ionic/vue-router';
import FontsPage from './views/FontsPage.vue';
import HomePage from './views/HomePage.vue';
import LicensesPage from './views/LicensesPage.vue';
import MakerPage from './views/MakerPage.vue';
import SettingsPage from './views/SettingsPage.vue';

// Use hash routing: the app is loaded from local files, and there is no server to handle path-style URLs.
export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', component: HomePage },
    { path: '/pack/:id', component: MakerPage, props: true },
    { path: '/settings', component: SettingsPage },
    { path: '/settings/fonts', component: FontsPage },
    { path: '/settings/licenses', component: LicensesPage },
  ],
});
