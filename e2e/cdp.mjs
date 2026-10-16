// Forwards the WebView debugging port over adb and drives the app on a real device or emulator via the Chrome DevTools Protocol.
import { execFileSync, spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

export const APP_ID = 'com.ppeely.stickers';

const ADB = process.env.ADB ?? 'adb';
const PORT = Number(process.env.CDP_PORT ?? 9222);
const COMMAND_TIMEOUT_MS = 60000;
const PROBE_TIMEOUT_MS = 5000;
const KEYBOARD_TIMEOUT_MS = 5000;
const TAP_SETTLE_MS = 150;

const ADB_TIMEOUT_MS = 120000;

export function adb(...args) {
  return execFileSync(ADB, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: ADB_TIMEOUT_MS });
}

export function adbBinary(...args) {
  return execFileSync(ADB, args, { maxBuffer: 64 * 1024 * 1024, timeout: ADB_TIMEOUT_MS });
}

// Runs a command that may be expected to fail and returns combined stdout and stderr without throwing.
export function adbOutput(...args) {
  const result = spawnSync(ADB, args, { encoding: 'utf8', timeout: ADB_TIMEOUT_MS });

  return `${result.stdout ?? ''}${result.stderr ?? ''}`;
}

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function launchApp({ clear = false } = {}) {
  if (clear) {
    adb('shell', 'pm', 'clear', APP_ID);
  } else {
    adb('shell', 'am', 'force-stop', APP_ID);
  }

  adb('shell', 'am', 'start', '-W', '-n', `${APP_ID}/.MainActivity`);
}

export async function connect({ timeoutMs = 90000 } = {}) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const session = await openSession();
    // Right after the device boots, the app's first start is slow, and now and then a page that is already listed stops answering
    // during setup. Only hand out a session whose page answers the setup commands; otherwise reconnect.
    if (session && (await session.init().catch(() => null))) {
      return session;
    }

    session?.close();
    await sleep(500);
  }

  throw new Error('WebView page not found or not responding; is the debug build running?');
}

async function openSession() {
  const pid = adb('shell', 'pidof', APP_ID).trim();
  if (!pid) {
    return null;
  }

  adb('forward', `tcp:${PORT}`, `localabstract:webview_devtools_remote_${pid}`);

  let target;
  try {
    const pages = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
    target = pages.find((page) => page.type === 'page' && page.url.startsWith('https://localhost'));
  } catch {
    // The WebView debugging socket isn't ready yet; retry shortly.
  }

  if (!target) {
    return null;
  }

  const socket = new WebSocket(target.webSocketDebuggerUrl);
  const opened = await new Promise((resolve) => {
    socket.addEventListener('open', () => resolve(true), { once: true });
    socket.addEventListener('error', () => resolve(false), { once: true });
  });

  return opened ? new Session(socket, target.id) : null;
}

// Whether the input method window is on screen.
function keyboardVisible() {
  return /isVisible=true/.test(adbOutput('shell', 'dumpsys', 'window', 'InputMethod'));
}

// The page description includes the WebView's position on screen, needed to convert coordinates for taps. It is read again
// for every conversion: shortly after the device boots, the system bar insets arrive late and move the WebView down.
async function viewOffset(targetId) {
  const pages = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
  const placement = JSON.parse(pages.find((page) => page.id === targetId)?.description || '{}');

  return { x: placement.screenX ?? 0, y: placement.screenY ?? 0 };
}

export class Session {
  constructor(socket, targetId) {
    this.socket = socket;
    this.targetId = targetId;
    this.nextId = 1;
    this.pending = new Map();
    this.consoleLines = [];

    socket.addEventListener('message', (event) => this.onMessage(JSON.parse(event.data)));
  }

  async init() {
    await this.send('Runtime.enable', {}, PROBE_TIMEOUT_MS);
    await this.send('Page.enable', {}, PROBE_TIMEOUT_MS);
    await this.send('Runtime.evaluate', { expression: '1' }, PROBE_TIMEOUT_MS);

    return this;
  }

  send(method, params = {}, timeoutMs = COMMAND_TIMEOUT_MS) {
    const id = this.nextId++;

    return new Promise((resolve, reject) => {
      // A command gets no reply if the page is suspended or the connection drops; fail after a timeout so the whole test does not hang forever.
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${method}: no response from the page`));
      }, timeoutMs);

      this.pending.set(id, { resolve, reject, method, timer });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  // Evaluates an expression in the page and returns a serializable result; the expression may be a Promise.
  async evaluate(expression) {
    const response = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true,
    });

    if (response.exceptionDetails) {
      const detail = response.exceptionDetails;
      throw new Error(`evaluate failed: ${detail.exception?.description ?? detail.text}`);
    }

    return response.result.value;
  }

  async waitFor(expression, { timeoutMs = 20000, intervalMs = 150 } = {}) {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      const value = await this.evaluate(expression);
      if (value) {
        return value;
      }

      await sleep(intervalMs);
    }

    throw new Error(`timeout waiting for: ${expression}`);
  }

  waitForSelector(selector, options) {
    return this.waitFor(`!!document.querySelector(${JSON.stringify(selector)})`, options);
  }

  async rect(selector) {
    const rect = await this.evaluate(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return null;
      el.scrollIntoView({ block: 'center', inline: 'center' });
      const r = el.getBoundingClientRect();
      return { x: r.left, y: r.top, width: r.width, height: r.height };
    })()`);

    if (!rect) {
      throw new Error(`element not found: ${selector}`);
    }

    return rect;
  }

  // Returns only once the element position has settled: enter animations and relayouts caused by the soft keyboard opening or closing make earlier measurements stale.
  // It counts as stable after three consecutive measurements (120 ms apart) give the same position and the same viewport height.
  async stableRect(selector, { timeoutMs = 8000 } = {}) {
    const deadline = Date.now() + timeoutMs;
    const measure = async () => JSON.stringify([await this.rect(selector), await this.evaluate('[window.innerHeight, window.visualViewport?.height ?? 0]')]);
    let previous = await measure();
    let stableCount = 0;

    while (Date.now() < deadline && stableCount < 2) {
      await sleep(120);
      const current = await measure();
      stableCount = current === previous ? stableCount + 1 : 0;
      previous = current;
    }

    return JSON.parse(previous)[0];
  }

  // Taps the element center. The tap is injected with `adb shell input tap`: down and up happen back to back on the device, with a consistent interval.
  // Sending down and up as two DevTools protocol commands lets high host load stretch the interval until it registers as a long press, and the page never gets a click.
  async tap(selector) {
    await this.waitForSelector(selector);
    const rect = await this.stableRect(selector);
    const point = await this.toDevicePixels(rect.x + rect.width / 2, rect.y + rect.height / 2);

    adb('shell', 'input', 'tap', String(point.x), String(point.y));
    await sleep(TAP_SETTLE_MS);
  }

  // Converts page coordinates (CSS pixels) to screen coordinates (physical pixels): multiply by the device pixel ratio, then add the WebView's offset on screen.
  async toDevicePixels(x, y) {
    const ratio = await this.evaluate('window.devicePixelRatio');
    const offset = await viewOffset(this.targetId);

    return { x: Math.round(x * ratio + offset.x), y: Math.round(y * ratio + offset.y) };
  }

  async touchPath(points, { stepDelayMs = 8 } = {}) {
    const [first, ...rest] = points;

    await this.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: first.x, y: first.y }] });
    for (const point of rest) {
      await this.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: point.x, y: point.y }] });
      await sleep(stepDelayMs);
    }

    await this.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  }

  // Focuses the field, selects its existing content, then writes the new content the way an input method commits text.
  // It doesn't focus by touch: the soft keyboard opening relayouts the page, so a tap at the old coordinates could hit another element.
  // `selector` may point at a native input or at an Ionic input component (the actual input lives inside the component).
  async type(selector, text) {
    const field = `(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      return !el ? null : el.matches('input, textarea') ? el : el.querySelector('input, textarea');
    })()`;

    await this.waitFor(`!!${field}`);
    const keyboardWasOpen = keyboardVisible();
    const heightBefore = await this.evaluate('window.innerHeight');

    // Ionic reassigns focus when the modal enter animation finishes; if focus moves away between "focus" and "insert", the text is lost, so verify after writing and retry.
    for (let attempt = 0; attempt < 4; attempt++) {
      await this.evaluate(`(() => {
        const el = ${field};
        el.focus();
        el.select();
      })()`);
      await this.send('Input.insertText', { text });

      if ((await this.evaluate(`${field}.value`)) === text) {
        if (!keyboardWasOpen) {
          await this.waitForKeyboard(heightBefore);
        }

        return;
      }

      await sleep(300);
    }

    throw new Error(`could not type into ${selector}`);
  }

  // Focusing a field opens the soft keyboard, which shrinks the WebView and moves dialogs up. The first time after the
  // device boots, the keyboard can take seconds to appear; a tap measured before that would land on the keyboard.
  // Waits until the keyboard is shown and the page has made room for it; a device without a soft keyboard just times out.
  async waitForKeyboard(heightBefore) {
    const deadline = Date.now() + KEYBOARD_TIMEOUT_MS;

    while (Date.now() < deadline) {
      if (keyboardVisible() && (await this.evaluate('window.innerHeight')) < heightBefore) {
        return;
      }

      await sleep(150);
    }
  }

  async screenshot(path) {
    const { data } = await this.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(path, Buffer.from(data, 'base64'));

    return path;
  }

  close() {
    this.socket.close();
  }

  onMessage(message) {
    if (message.id) {
      const entry = this.pending.get(message.id);
      this.pending.delete(message.id);
      clearTimeout(entry?.timer);

      if (message.error) {
        entry?.reject(new Error(`${entry.method}: ${message.error.message}`));
      } else {
        entry?.resolve(message.result);
      }

      return;
    }

    if (message.method === 'Runtime.consoleAPICalled') {
      const text = message.params.args.map((arg) => arg.value ?? arg.description ?? '').join(' ');
      this.consoleLines.push(`[${message.params.type}] ${text}`);
    }

    if (message.method === 'Runtime.exceptionThrown') {
      const detail = message.params.exceptionDetails;
      this.consoleLines.push(`[exception] ${detail.exception?.description ?? detail.text}`);
    }
  }
}

// Full-screen device screenshot (including system UI and native windows), used to check content outside the WebView.
export function deviceScreenshot(path) {
  writeFileSync(path, adbBinary('exec-out', 'screencap', '-p'));

  return path;
}
