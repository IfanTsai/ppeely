// Copies third-party binaries that must be loaded from their original paths at runtime into public/, so they are not committed to the repository.
import { copyFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const files = [
  ['node_modules/@mediapipe/tasks-vision/wasm/vision_wasm_internal.js', 'public/mediapipe/vision_wasm_internal.js'],
  ['node_modules/@mediapipe/tasks-vision/wasm/vision_wasm_internal.wasm', 'public/mediapipe/vision_wasm_internal.wasm'],
];

for (const [from, to] of files) {
  const source = resolve(root, from);
  const target = resolve(root, to);

  if (existsSync(target) && statSync(target).size === statSync(source).size) {
    continue;
  }

  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(source, target);
  console.log(`copied ${to}`);
}
