// File access layer for the app-private directory. All paths are relative to Capacitor's Data directory
// (`files/` on Android, `Documents/` on iOS); the native ContentProvider and keyboard read the same files directly.
import { Capacitor } from '@capacitor/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { base64ToBytes, bytesToBase64 } from './bytes';

let dataRootUri: string | null = null;

// Called once at startup to resolve the absolute URI of the private directory, after which image URLs can be built synchronously.
export async function initFilesystem(): Promise<void> {
  if (!Capacitor.isNativePlatform()) {
    return;
  }

  const { uri } = await Filesystem.getUri({ directory: Directory.Data, path: '' });
  dataRootUri = uri.replace(/\/+$/, '');
}

export async function writeBytes(path: string, bytes: Uint8Array, directory = Directory.Data): Promise<string> {
  const { uri } = await Filesystem.writeFile({ path, data: bytesToBase64(bytes), directory, recursive: true });

  return uri;
}

export async function readBytes(path: string, directory = Directory.Data): Promise<Uint8Array> {
  const { data } = await Filesystem.readFile({ path, directory });
  if (typeof data !== 'string') {
    return new Uint8Array(await data.arrayBuffer());
  }

  return base64ToBytes(data);
}

export async function writeText(path: string, text: string): Promise<void> {
  await Filesystem.writeFile({ path, data: text, directory: Directory.Data, encoding: Encoding.UTF8, recursive: true });
}

export async function readText(path: string): Promise<string | null> {
  try {
    const { data } = await Filesystem.readFile({ path, directory: Directory.Data, encoding: Encoding.UTF8 });

    return typeof data === 'string' ? data : await data.text();
  } catch {
    return null;
  }
}

export async function removeFile(path: string, directory = Directory.Data): Promise<void> {
  try {
    await Filesystem.deleteFile({ path, directory });
  } catch {
    // Nothing to do when the file doesn't exist in the first place.
  }
}

export async function removeDirectory(path: string): Promise<void> {
  try {
    await Filesystem.rmdir({ path, directory: Directory.Data, recursive: true });
  } catch {
    // Nothing to do when the directory doesn't exist in the first place.
  }
}

export async function listDirectory(path: string): Promise<string[]> {
  try {
    const { files } = await Filesystem.readdir({ path, directory: Directory.Data });

    return files.map((file) => file.name);
  } catch {
    return [];
  }
}

// On native platforms returns a URL usable directly in <img>; the browser debug environment has no file URI, so returns null and the caller reads the file contents instead.
export function nativeFileUrl(path: string, version: number): string | null {
  if (dataRootUri === null) {
    return null;
  }

  return `${Capacitor.convertFileSrc(`${dataRootUri}/${path}`)}?v=${version}`;
}
