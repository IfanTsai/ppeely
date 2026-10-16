// Generates the app icon and splash images for both platforms from the shapes defined below:
// a white sticker with its corner peeling back and a lowercase "p" on it.
// Run it through ./scripts/generate-icons.sh, which renders inside the Playwright Docker image.
//
// Outputs: the Android adaptive icon (vector foreground plus background color), legacy launcher PNGs and splash
// PNGs; the iOS app icon and splash PNGs; resources/icon.svg for documentation. All of them are committed.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crc32, deflateSync } from 'node:zlib';
import { chromium } from 'playwright-core';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const androidRes = resolve(root, 'native/android/app/src/main/res');
const iosAssets = resolve(root, 'native/ios/App/App/Assets.xcassets');

const GREEN = '#16A05C';
const WHITE = '#FFFFFF';
// The underside of the peeled corner.
const FLAP = '#D4EADD';
const SPLASH_BACKGROUND = '#FFFFFF';

// Shapes on the 108×108 canvas of an Android adaptive icon. Launchers crop it to various shapes but always show
// the central 66×66 circle, so everything stays within 33 units of the center. The sticker is a rounded square
// whose bottom-right corner is folded back along the line x + y = 138; the flap is that corner mirrored over it.
const STICKER = 'M40,30 H68 A10,10 0 0 1 78,40 V60 L60,78 H40 A10,10 0 0 1 30,68 V40 A10,10 0 0 1 40,30 Z';
const FLAP_PATH = 'M78,60 H70 A10,10 0 0 0 60,70 V78 Z';
const STEM = 'M44,43 V69';
const BOWL = 'M60,50.5 A8,8 0 1 1 44,50.5 A8,8 0 1 1 60,50.5 Z';
const STROKE = 7;
const TILT = -8;

// Full icons show the central 72×72 of the adaptive canvas, the area a launcher displays.
const ICON_VIEW = '18 18 72 72';

const LEGACY_ICONS = [
  ['mdpi', 48],
  ['hdpi', 72],
  ['xhdpi', 96],
  ['xxhdpi', 144],
  ['xxxhdpi', 192],
];

const ANDROID_SPLASHES = [
  ['drawable', 480, 320],
  ['drawable-land-mdpi', 480, 320],
  ['drawable-land-hdpi', 800, 480],
  ['drawable-land-xhdpi', 1280, 720],
  ['drawable-land-xxhdpi', 1600, 960],
  ['drawable-land-xxxhdpi', 1920, 1280],
  ['drawable-port-mdpi', 320, 480],
  ['drawable-port-hdpi', 480, 800],
  ['drawable-port-xhdpi', 720, 1280],
  ['drawable-port-xxhdpi', 960, 1600],
  ['drawable-port-xxxhdpi', 1280, 1920],
];

// The splash shows the rounded icon at this fraction of the shorter side.
const SPLASH_ICON_RATIO = 0.28;

const browser = await chromium.launch();
const page = await browser.newPage();

writeAndroidAdaptiveIcon();

for (const [density, size] of LEGACY_ICONS) {
  await writePng(`${androidRes}/mipmap-${density}/ic_launcher.png`, iconSvg('rounded', size), size, size, true);
  await writePng(`${androidRes}/mipmap-${density}/ic_launcher_round.png`, iconSvg('round', size), size, size, true);
  // The adaptive icon now uses the vector foreground; the old bitmap foregrounds are no longer referenced.
  rmSync(`${androidRes}/mipmap-${density}/ic_launcher_foreground.png`, { force: true });
}

for (const [directory, width, height] of ANDROID_SPLASHES) {
  await writePng(`${androidRes}/${directory}/splash.png`, splashSvg(width, height), width, height, false);
}

// The App Store rejects icons with an alpha channel; iOS applies the rounded mask itself.
await writePng(`${iosAssets}/AppIcon.appiconset/AppIcon-512@2x.png`, iconSvg('square', 1024), 1024, 1024, false);
for (const name of ['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png']) {
  await writePng(`${iosAssets}/Splash.imageset/${name}`, splashSvg(2732, 2732), 2732, 2732, false);
}

mkdirSync(resolve(root, 'resources'), { recursive: true });
writeFileSync(resolve(root, 'resources/icon.svg'), `${iconSvg('rounded', 512)}\n`);

await browser.close();

function foreground() {
  return [
    `<g transform="rotate(${TILT} 54 54)">`,
    `  <path d="${STICKER}" fill="${WHITE}"/>`,
    `  <path d="${FLAP_PATH}" fill="${FLAP}"/>`,
    `  <path d="${STEM}" fill="none" stroke="${GREEN}" stroke-width="${STROKE}" stroke-linecap="round"/>`,
    `  <path d="${BOWL}" fill="none" stroke="${GREEN}" stroke-width="${STROKE}"/>`,
    '</g>',
  ].join('\n');
}

// shape: 'square' fills the whole image, 'rounded' is a rounded square, 'round' is a circle.
function iconBody(shape) {
  const background = {
    square: `<rect x="18" y="18" width="72" height="72" fill="${GREEN}"/>`,
    rounded: `<rect x="18" y="18" width="72" height="72" rx="16" fill="${GREEN}"/>`,
    round: `<circle cx="54" cy="54" r="36" fill="${GREEN}"/>`,
  }[shape];

  return `${background}\n${foreground()}`;
}

function iconSvg(shape, size) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="${ICON_VIEW}">\n${iconBody(shape)}\n</svg>`;
}

function splashSvg(width, height) {
  const size = Math.min(width, height) * SPLASH_ICON_RATIO;
  const scale = size / 72;
  const left = (width - size) / 2;
  const top = (height - size) / 2;

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<rect width="${width}" height="${height}" fill="${SPLASH_BACKGROUND}"/>`,
    `<g transform="translate(${left} ${top}) scale(${scale}) translate(-18 -18)">`,
    iconBody('rounded'),
    '</g>',
    '</svg>',
  ].join('\n');
}

function writeAndroidAdaptiveIcon() {
  const vector = [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<!-- Generated by scripts/generate-icons.mjs; change the shapes there and rerun it instead of editing this file. -->',
    '<vector xmlns:android="http://schemas.android.com/apk/res/android"',
    '    android:width="108dp"',
    '    android:height="108dp"',
    '    android:viewportWidth="108"',
    '    android:viewportHeight="108">',
    `    <group android:rotation="${TILT}" android:pivotX="54" android:pivotY="54">`,
    `        <path android:fillColor="${WHITE}" android:pathData="${STICKER}" />`,
    `        <path android:fillColor="${FLAP}" android:pathData="${FLAP_PATH}" />`,
    `        <path android:strokeColor="${GREEN}" android:strokeWidth="${STROKE}" android:strokeLineCap="round" android:pathData="${STEM}" />`,
    `        <path android:strokeColor="${GREEN}" android:strokeWidth="${STROKE}" android:pathData="${BOWL}" />`,
    '    </group>',
    '</vector>',
    '',
  ].join('\n');
  writeFileSync(`${androidRes}/drawable/ic_launcher_foreground.xml`, vector);

  const color = [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<!-- Generated by scripts/generate-icons.mjs. -->',
    '<resources>',
    `    <color name="ic_launcher_background">${GREEN}</color>`,
    '</resources>',
    '',
  ].join('\n');
  writeFileSync(`${androidRes}/values/ic_launcher_background.xml`, color);

  const adaptive = [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">',
    '    <background android:drawable="@color/ic_launcher_background" />',
    '    <foreground android:drawable="@drawable/ic_launcher_foreground" />',
    '</adaptive-icon>',
    '',
  ].join('\n');
  writeFileSync(`${androidRes}/mipmap-anydpi-v26/ic_launcher.xml`, adaptive);
  writeFileSync(`${androidRes}/mipmap-anydpi-v26/ic_launcher_round.xml`, adaptive);
}

// Rasterizes the SVG in the browser and encodes the pixels as PNG, with or without an alpha channel.
async function writePng(path, svg, width, height, alpha) {
  const base64 = await page.evaluate(
    async ({ svg, width, height }) => {
      const image = new Image();
      image.src = `data:image/svg+xml;base64,${btoa(svg)}`;
      await image.decode();

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      context.drawImage(image, 0, 0, width, height);

      const pixels = context.getImageData(0, 0, width, height).data;
      let binary = '';
      for (let offset = 0; offset < pixels.length; offset += 0x8000) {
        binary += String.fromCharCode(...pixels.subarray(offset, offset + 0x8000));
      }

      return btoa(binary);
    },
    { svg, width, height },
  );

  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, encodePng(Buffer.from(base64, 'base64'), width, height, alpha));
  console.log(`${path.slice(root.length + 1)} ${width}x${height}`);
}

function encodePng(rgba, width, height, alpha) {
  const channels = alpha ? 4 : 3;
  const stride = width * channels + 1;
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    // Each scanline starts with filter type 0 (none).
    for (let x = 0; x < width; x++) {
      const source = (y * width + x) * 4;
      const target = y * stride + 1 + x * channels;
      rgba.copy(raw, target, source, source + channels);
    }
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = alpha ? 6 : 2;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function pngChunk(type, data) {
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(body));

  return Buffer.concat([length, body, checksum]);
}
