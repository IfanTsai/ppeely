// Gets files chosen by the user: the camera and photo library go through the Capacitor Camera plugin, other files through the browser's file picker.
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';

export interface PickedFile {
  blob: Blob;
  name: string;
  type: string;
}

// Opens the system file picker; returns null when the user cancels.
export function pickFile(accept: string): Promise<PickedFile | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.style.display = 'none';
    input.dataset.testid = 'file-input';

    let settled = false;
    const finish = (result: PickedFile | null) => {
      if (settled) {
        return;
      }

      settled = true;
      input.remove();
      window.removeEventListener('focus', onFocus);
      resolve(result);
    };

    // Cancelling does not fire change, and some WebViews don't fire cancel either, so wait briefly after the window regains focus and treat it as cancelled if there is still no result.
    const onFocus = () => setTimeout(() => finish(null), 1000);

    input.addEventListener('change', () => {
      const file = input.files?.[0];
      finish(file ? { blob: file, name: file.name, type: file.type } : null);
    });
    input.addEventListener('cancel', () => finish(null));

    document.body.appendChild(input);
    input.click();
    setTimeout(() => window.addEventListener('focus', onFocus, { once: true }), 300);
  });
}

export function takePhoto(): Promise<PickedFile | null> {
  return getPhoto(CameraSource.Camera);
}

export function pickPhoto(): Promise<PickedFile | null> {
  return getPhoto(CameraSource.Photos);
}

async function getPhoto(source: CameraSource): Promise<PickedFile | null> {
  let photo;
  try {
    photo = await Camera.getPhoto({ source, resultType: CameraResultType.Uri, quality: 100, correctOrientation: true });
  } catch (error) {
    // The plugin reports a cancelled capture or selection as an error; treat it as "nothing selected" and rethrow any other error.
    if (/cancel/i.test(String((error as Error)?.message))) {
      return null;
    }

    throw error;
  }

  if (!photo.webPath) {
    return null;
  }

  const blob = await (await fetch(photo.webPath)).blob();
  const type = blob.type || `image/${photo.format}`;

  return { blob, name: `photo.${photo.format}`, type };
}
