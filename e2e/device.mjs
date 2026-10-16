// Drives the system UI outside the WebView: finds views with uiautomator and taps them.
import { adb, sleep } from './cdp.mjs';

export function dumpUi() {
  adb('shell', 'uiautomator', 'dump', '/sdcard/window_dump.xml');

  return adb('shell', 'cat', '/sdcard/window_dump.xml');
}

// Finds a view in the current window whose text or description matches and returns its center (physical pixels); returns null if none is found.
export function findNode(pattern) {
  const xml = dumpUi();
  for (const match of xml.matchAll(/<node [^>]*>/g)) {
    const node = match[0];
    const text = /text="([^"]*)"/.exec(node)?.[1] ?? '';
    const description = /content-desc="([^"]*)"/.exec(node)?.[1] ?? '';
    if (pattern.test(text) || pattern.test(description)) {
      const [, left, top, right, bottom] = /bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/.exec(node).map(Number);

      return { x: (left + right) / 2, y: (top + bottom) / 2, text: text || description };
    }
  }

  return null;
}

// Waits for a matching view to appear. WebView content only enters the view hierarchy after accessibility is first queried, so this retries.
export async function waitForNode(pattern, { timeoutMs = 20000 } = {}) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const node = findNode(pattern);
    if (node) {
      return node;
    }

    await sleep(500);
  }

  throw new Error(`system UI element not found: ${pattern}`);
}

export async function tapNode(pattern, { timeoutMs = 15000 } = {}) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const node = findNode(pattern);
    if (node) {
      adb('shell', 'input', 'tap', String(Math.round(node.x)), String(Math.round(node.y)));

      return node;
    }

    await sleep(500);
  }

  throw new Error(`system UI element not found: ${pattern}`);
}

// Taps the `index`-th view of the given class in the current window, e.g. the first text field.
export async function tapNodeOfClass(className, index = 0, { timeoutMs = 15000 } = {}) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const nodes = [...dumpUi().matchAll(/<node [^>]*>/g)].map((match) => match[0]).filter((node) => node.includes(`class="${className}"`));
    if (nodes.length > index) {
      const [, left, top, right, bottom] = /bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/.exec(nodes[index]).map(Number);
      adb('shell', 'input', 'tap', String(Math.round((left + right) / 2)), String(Math.round((top + bottom) / 2)));

      return;
    }

    await sleep(500);
  }

  throw new Error(`system UI element not found: ${className} #${index}`);
}

export const pressBack = () => adb('shell', 'input', 'keyevent', '4');

export const tapScreen = (x, y) => adb('shell', 'input', 'tap', String(Math.round(x)), String(Math.round(y)));

export function foregroundPackage() {
  const output = adb('shell', 'dumpsys', 'activity', 'activities');

  return /topResumedActivity=.*? ([\w.]+)\//.exec(output)?.[1] ?? /mResumedActivity.*? ([\w.]+)\//.exec(output)?.[1] ?? '';
}
