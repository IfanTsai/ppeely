// Local backup and restore with no dependency on any cloud service:
// all sticker packs are bundled into one ZIP file that the user saves anywhere through the system share sheet, and picks again with the file picker to restore.
import { unzipSync, zipSync } from 'fflate';
import { bytesToText, textToBytes } from './bytes';
import { shareFile } from './delivery';
import { readBytes } from './fs';
import { addSticker, createPack, getPacks, packFilePath, setTrayIcon } from './packs';

export const BACKUP_FILE_EXTENSION = '.ppeelybackup';

const MANIFEST = 'backup.json';

interface BackupManifest {
  version: 1;
  createdAt: number;
  packs: {
    directory: string;
    name: string;
    author: string;
    imported: boolean;
    trayIcon: string | null;
    stickers: { file: string; emojis: string[]; animated: boolean; wrapped?: boolean }[];
  }[];
}

export async function createBackup(): Promise<Uint8Array> {
  const entries: Record<string, Uint8Array> = {};
  const manifest: BackupManifest = { version: 1, createdAt: Date.now(), packs: [] };

  for (const pack of getPacks()) {
    for (const file of [pack.trayIcon, ...pack.stickers.map((sticker) => sticker.file)]) {
      if (file) {
        entries[`${pack.id}/${file}`] = await readBytes(packFilePath(pack.id, file));
      }
    }

    manifest.packs.push({
      directory: pack.id,
      name: pack.name,
      author: pack.author,
      imported: pack.imported,
      trayIcon: pack.trayIcon,
      stickers: pack.stickers.map(({ file, emojis, animated, wrapped }) => ({ file, emojis, animated, wrapped })),
    });
  }

  entries[MANIFEST] = textToBytes(JSON.stringify(manifest));

  return zipSync(entries, { level: 0 });
}

export async function shareBackup(dialogTitle: string, onReady?: () => Promise<void>): Promise<number> {
  const bytes = await createBackup();
  const stamp = new Date().toISOString().slice(0, 10);

  await shareFile(`ppeely-${stamp}${BACKUP_FILE_EXTENSION}`, bytes, 'application/zip', dialogTitle, onReady);

  return bytes.length;
}

export function isBackupFile(bytes: Uint8Array): boolean {
  try {
    return MANIFEST in unzipSync(bytes, { filter: (file) => file.name === MANIFEST });
  } catch {
    return false;
  }
}

// Restores a backup: every sticker pack in the backup is added as a new sticker pack, without overwriting existing ones. Returns the number of restored sticker packs.
export async function restoreBackup(bytes: Uint8Array): Promise<number> {
  const entries = unzipSync(bytes);
  const manifestBytes = entries[MANIFEST];
  if (!manifestBytes) {
    throw new Error('not a backup file');
  }

  const manifest = JSON.parse(bytesToText(manifestBytes)) as BackupManifest;

  // New sticker packs go to the top, so restore in reverse order to keep the order they had in the backup.
  for (const saved of [...manifest.packs].reverse()) {
    const pack = await createPack(saved.name, saved.author, { imported: saved.imported });

    const trayIcon = saved.trayIcon ? entries[`${saved.directory}/${saved.trayIcon}`] : undefined;
    if (trayIcon) {
      await setTrayIcon(pack.id, trayIcon);
    }

    for (const sticker of saved.stickers) {
      const data = entries[`${saved.directory}/${sticker.file}`];
      if (data) {
        await addSticker(pack.id, data, { animated: sticker.animated, emojis: sticker.emojis, wrapped: sticker.wrapped });
      }
    }
  }

  return manifest.packs.length;
}
