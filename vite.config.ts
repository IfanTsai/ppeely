import vue from '@vitejs/plugin-vue';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import packageJson from './package.json' with { type: 'json' };
import { thirdPartyNotices } from './scripts/third-party-notices';

export default defineConfig({
  base: './',
  plugins: [vue(), thirdPartyNotices(fileURLToPath(new URL('.', import.meta.url)))],
  define: {
    __APP_VERSION__: JSON.stringify(packageJson.version),
  },
  build: {
    target: 'es2020',
    outDir: 'dist',
    assetsInlineLimit: 0,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
