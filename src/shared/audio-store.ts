import type { WhistlerSettings } from "../types";
import { getSettings } from "../core/settings";

const DATABASE_NAME = "whistler-audio";
const STORE_NAME = "sounds";
const ACTIVE_SOUND_KEY = "active";
export const MAX_CUSTOM_SOUND_BYTES = 10 * 1024 * 1024;
const SUPPORTED_EXTENSIONS = new Set(["mp3", "wav", "ogg"]);
const SUPPORTED_MIME_TYPES = new Set([
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/wave",
  "audio/ogg",
  "application/ogg"
]);

interface StoredSound {
  id: string;
  blob: Blob;
  name: string;
  mimeType: string;
  size: number;
}

export function validateAudioFileMetadata(name: string, mimeType: string, size: number): string | null {
  const extension = name.split(".").pop()?.toLowerCase() ?? "";
  if (!SUPPORTED_EXTENSIONS.has(extension)) return "Choose an MP3, WAV, or OGG file.";
  if (mimeType && !SUPPORTED_MIME_TYPES.has(mimeType.toLowerCase())) return "This file does not report a supported audio type.";
  if (size <= 0) return "The selected audio file is empty.";
  if (size > MAX_CUSTOM_SOUND_BYTES) return "Custom sounds must be 10 MiB or smaller.";
  return null;
}

export async function validateAudioDecodes(file: File): Promise<void> {
  const metadataError = validateAudioFileMetadata(file.name, file.type, file.size);
  if (metadataError) throw new Error(metadataError);

  const objectUrl = URL.createObjectURL(file);
  try {
    await new Promise<void>((resolve, reject) => {
      const audio = new Audio();
      const timeout = window.setTimeout(() => reject(new Error("The audio file took too long to decode.")), 8_000);
      const finish = (callback: () => void): void => {
        window.clearTimeout(timeout);
        audio.removeAttribute("src");
        audio.load();
        callback();
      };
      audio.addEventListener("canplaythrough", () => finish(resolve), { once: true });
      audio.addEventListener("error", () => finish(() => reject(new Error("Firefox could not decode this audio file."))), { once: true });
      audio.preload = "auto";
      audio.src = objectUrl;
      audio.load();
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export async function saveCustomSound(file: File): Promise<void> {
  const database = await openDatabase();
  await transactionPromise(database, "readwrite", (store) => {
    store.put({
      id: ACTIVE_SOUND_KEY,
      blob: file,
      name: file.name,
      mimeType: file.type,
      size: file.size
    } satisfies StoredSound);
  });
  database.close();
}

export async function getCustomSound(): Promise<StoredSound | null> {
  const database = await openDatabase();
  const value = await new Promise<StoredSound | null>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readonly");
    const request = transaction.objectStore(STORE_NAME).get(ACTIVE_SOUND_KEY);
    request.addEventListener("success", () => resolve((request.result as StoredSound | undefined) ?? null));
    request.addEventListener("error", () => reject(request.error ?? new Error("Could not read the custom sound.")));
  });
  database.close();
  return value;
}

export async function removeCustomSound(): Promise<void> {
  const database = await openDatabase();
  await transactionPromise(database, "readwrite", (store) => store.delete(ACTIVE_SOUND_KEY));
  database.close();
}

export async function createConfiguredAudio(settings?: WhistlerSettings): Promise<HTMLAudioElement> {
  const selected = settings ?? await getSettings();
  let objectUrl: string | null = null;
  if (selected.sound.kind === "custom") {
    const custom = await getCustomSound();
    if (custom) objectUrl = URL.createObjectURL(custom.blob);
  }

  const audio = new Audio(objectUrl ?? browser.runtime.getURL("sounds/default-whistle.wav"));
  audio.volume = selected.volume;
  audio.preload = "auto";
  if (objectUrl) {
    let revoked = false;
    const revoke = (): void => {
      if (revoked) return;
      revoked = true;
      URL.revokeObjectURL(objectUrl!);
    };
    audio.addEventListener("ended", revoke, { once: true });
    audio.addEventListener("error", revoke, { once: true });
    audio.addEventListener("emptied", revoke, { once: true });
  }
  return audio;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1);
    request.addEventListener("upgradeneeded", () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) database.createObjectStore(STORE_NAME, { keyPath: "id" });
    });
    request.addEventListener("success", () => resolve(request.result));
    request.addEventListener("error", () => reject(request.error ?? new Error("Could not open local sound storage.")));
  });
}

function transactionPromise(
  database: IDBDatabase,
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, mode);
    operation(transaction.objectStore(STORE_NAME));
    transaction.addEventListener("complete", () => resolve());
    transaction.addEventListener("error", () => reject(transaction.error ?? new Error("Could not update local sound storage.")));
    transaction.addEventListener("abort", () => reject(transaction.error ?? new Error("Sound storage update was cancelled.")));
  });
}
