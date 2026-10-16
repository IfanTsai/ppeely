// Dialogs, action sheets, toasts and loading overlays, wrapping Ionic's controllers in one place.
// Feature code calls them through an imperative API, e.g. `await confirm(...)`, so pages don't need to track open/closed state.
// Every element carries a `data-testid` for end-to-end tests to locate.
import { actionSheetController, alertController, loadingController, toastController } from '@ionic/vue';
import { t } from '../i18n';
import { PACK_TEXT_MAX_LENGTH } from '../lib/constants';
import { validatePackText } from '../lib/packs';

export interface SheetOption<T> {
  value: T;
  label: string;
  // An ionicons icon.
  icon?: string;
  danger?: boolean;
}

export interface PackFormResult {
  name: string;
  author: string;
}

let currentToast: HTMLIonToastElement | null = null;

export async function toast(message: string, duration = 2600): Promise<void> {
  await currentToast?.dismiss().catch(() => undefined);

  const element = await toastController.create({
    message,
    duration,
    position: 'bottom',
    htmlAttributes: { 'data-testid': 'toast' },
  });
  currentToast = element;
  void element.onDidDismiss().then(() => {
    if (currentToast === element) {
      currentToast = null;
    }
  });

  await element.present();
}

// Runs a long task under the loading overlay; `update` changes the message while the task is running.
// When the second half of the task hands off to a screen outside the app (WhatsApp's add screen, the system share sheet), call `release` first to close the loading overlay,
// otherwise it stays behind that screen.
export async function withBusy<T>(
  message: string,
  task: (update: (message: string) => void, release: () => Promise<void>) => Promise<T>,
): Promise<T> {
  const loading = await loadingController.create({
    message,
    animated: false,
    backdropDismiss: false,
    htmlAttributes: { 'data-testid': 'busy' },
  });
  await loading.present();

  let released = false;
  const release = async () => {
    if (!released) {
      released = true;
      await loading.dismiss();
    }
  };

  try {
    return await task((next) => {
      loading.message = next;
    }, release);
  } finally {
    await release();
  }
}

export async function confirm(options: {
  title: string;
  message?: string;
  confirmLabel: string;
  cancelLabel: string;
  danger?: boolean;
}): Promise<boolean> {
  const element = await alertController.create({
    header: options.title,
    message: options.message,
    htmlAttributes: { 'data-testid': 'confirm-dialog' },
    buttons: [
      { text: options.cancelLabel, role: 'cancel', htmlAttributes: { 'data-testid': 'confirm-cancel' } },
      {
        text: options.confirmLabel,
        role: options.danger ? 'destructive' : 'confirm',
        htmlAttributes: { 'data-testid': 'confirm-ok' },
      },
    ],
  });
  await element.present();

  const { role } = await element.onDidDismiss();

  return role === 'confirm' || role === 'destructive';
}

export async function alert(options: { title: string; message?: string; okLabel: string }): Promise<void> {
  const element = await alertController.create({
    header: options.title,
    message: options.message,
    htmlAttributes: { 'data-testid': 'alert-dialog' },
    buttons: [{ text: options.okLabel, role: 'confirm', htmlAttributes: { 'data-testid': 'alert-ok' } }],
  });
  await element.present();
  await element.onDidDismiss();
}

// An action sheet that slides up from the bottom; returns null when the user cancels.
export async function chooseFromSheet<T extends string>(title: string, options: SheetOption<T>[]): Promise<T | null> {
  const element = await actionSheetController.create({
    header: title,
    htmlAttributes: { 'data-testid': 'sheet' },
    buttons: options.map((option) => ({
      text: option.label,
      icon: option.icon,
      role: option.danger ? 'destructive' : undefined,
      data: option.value,
      htmlAttributes: { 'data-testid': `sheet-item-${option.value}` },
    })),
  });
  await element.present();

  const { data } = await element.onDidDismiss<T>();

  return data ?? null;
}

// Dialog shared by create and rename: two inputs, each limited to 30 characters, both needing at least 3 characters after trimming whitespace.
// Tapping the backdrop does not close it, to avoid losing typed input to an accidental tap.
export async function askPackDetails(options: {
  title: string;
  confirmLabel: string;
  name: string;
  author: string;
}): Promise<PackFormResult | null> {
  let result: PackFormResult | null = null;

  const element = await alertController.create({
    header: options.title,
    backdropDismiss: false,
    htmlAttributes: { 'data-testid': 'pack-form' },
    inputs: [
      {
        name: 'name',
        type: 'text',
        placeholder: t.packName,
        value: options.name,
        attributes: { maxlength: PACK_TEXT_MAX_LENGTH, 'data-testid': 'pack-name', 'aria-label': t.packName },
      },
      {
        name: 'author',
        type: 'text',
        placeholder: t.packAuthor,
        value: options.author,
        attributes: { maxlength: PACK_TEXT_MAX_LENGTH, 'data-testid': 'pack-author', 'aria-label': t.packAuthor },
      },
    ],
    buttons: [
      { text: t.cancel, role: 'cancel', htmlAttributes: { 'data-testid': 'pack-form-cancel' } },
      {
        text: options.confirmLabel,
        role: 'confirm',
        htmlAttributes: { 'data-testid': 'pack-form-submit' },
        handler: (values: { name: string; author: string }) => {
          if (validatePackText(values.name) || validatePackText(values.author)) {
            // When validation fails, show the reason in the dialog and keep the dialog open.
            element.message = t.packTextInvalid;

            return false;
          }

          result = { name: values.name.trim(), author: values.author.trim() };

          return true;
        },
      },
    ],
  });
  await element.present();
  await element.onDidDismiss();

  return result;
}
