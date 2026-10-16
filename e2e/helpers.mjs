// Shared end-to-end test utilities: assertions, fixture injection, and pulling app files from the device.
import { readFileSync } from 'node:fs';
import { adbBinary, adbOutput, APP_ID } from './cdp.mjs';

export function assert(condition, message) {
  if (!condition) {
    throw new Error(`assertion failed: ${message}`);
  }
}

export function assertEqual(actual, expected, message) {
  assert(JSON.stringify(actual) === JSON.stringify(expected), `${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

// Makes the app's file input receive the given file directly during tests instead of opening the system file picker.
// Only the click behavior of <input type="file"> in the page is replaced; the app's own code path is unchanged.
export async function installFilePicker(session) {
  await session.evaluate(`(() => {
    if (window.__e2eFiles) return;
    window.__e2eFiles = [];
    // Records recent touch and click events, used on test failure to tell whether a tap reached the page.
    window.__e2eEvents = [];
    for (const type of ['touchstart', 'touchend', 'touchcancel', 'click']) {
      document.addEventListener(type, (event) => {
        const target = event.target.closest?.('[data-testid]')?.dataset.testid ?? event.target.nodeName;
        window.__e2eEvents.push(type + ':' + target);
        window.__e2eEvents.splice(0, window.__e2eEvents.length - 12);
      }, true);
    }
    const originalClick = HTMLInputElement.prototype.click;
    HTMLInputElement.prototype.click = function () {
      const next = this.type === 'file' ? window.__e2eFiles.shift() : undefined;
      if (!next) return originalClick.call(this);
      const binary = atob(next.base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const transfer = new DataTransfer();
      transfer.items.add(new File([bytes], next.name, { type: next.type }));
      this.files = transfer.files;
      this.dispatchEvent(new Event('change'));
    };
  })()`);
}

export async function queueFile(session, path, name, type) {
  const base64 = readFileSync(path).toString('base64');
  await session.evaluate(`window.__e2eFiles.push(${JSON.stringify({ base64, name, type })})`);
}

// Location of the app-private directory on the device. Tests run adb as root and read this directory directly,
// so both the debug build and the release build (not debuggable, so no run-as) can be tested.
const APP_DATA = `/data/data/${APP_ID}`;

// Runs a shell command in the app-private directory and returns its output; paths in `command` are relative to that directory.
export function appShell(command) {
  return adbOutput('shell', `cd ${APP_DATA} && ${command}`);
}

// Reads a file from the app-private directory; `relativePath` is relative to that directory, e.g. `files/packs/index.json`.
export function readAppPath(relativePath) {
  return adbBinary('exec-out', `cat '${APP_DATA}/${relativePath}'`);
}

export function readAppFile(relativePath) {
  return readAppPath(`files/${relativePath}`);
}

export function readPackIndex() {
  return JSON.parse(readAppFile('packs/index.json').toString('utf8'));
}

export const testId = (id) => `[data-testid="${id}"]`;
