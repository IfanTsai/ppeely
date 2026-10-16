import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.ppeely.stickers',
  appName: 'Ppeely',
  webDir: 'dist',
  // Both native projects live under native/ instead of Capacitor's default project root.
  android: {
    path: 'native/android',
    allowMixedContent: false,
  },
  ios: {
    path: 'native/ios',
    contentInset: 'always',
  },
  // `cap sync` regenerates config.xml for both platforms' Cordova compatibility layer every time, and the file itself can't be removed;
  // this project uses no Cordova plugins, so leaving this empty keeps the default `<access origin="*" />` out of the generated file.
  cordova: {
    accessOrigins: [],
  },
};

export default config;
