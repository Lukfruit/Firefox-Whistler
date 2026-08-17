import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it } from "vitest";
import {
  getCustomSound,
  MAX_CUSTOM_SOUND_BYTES,
  removeCustomSound,
  saveCustomSound,
  validateAudioFileMetadata
} from "../src/shared/audio-store";

beforeEach(() => {
  Object.defineProperty(globalThis, "indexedDB", { value: new IDBFactory(), configurable: true });
});

describe("custom audio validation", () => {
  it("accepts supported local audio", () => {
    expect(validateAudioFileMetadata("whistle.mp3", "audio/mpeg", 1_024)).toBeNull();
    expect(validateAudioFileMetadata("whistle.WAV", "", 1_024)).toBeNull();
    expect(validateAudioFileMetadata("whistle.ogg", "audio/ogg", MAX_CUSTOM_SOUND_BYTES)).toBeNull();
  });

  it("rejects unsupported, empty, mismatched, and oversized files", () => {
    expect(validateAudioFileMetadata("sound.aac", "audio/aac", 100)).toMatch(/MP3/);
    expect(validateAudioFileMetadata("sound.mp3", "audio/aac", 100)).toMatch(/supported audio type/);
    expect(validateAudioFileMetadata("sound.wav", "audio/wav", 0)).toMatch(/empty/);
    expect(validateAudioFileMetadata("sound.ogg", "audio/ogg", MAX_CUSTOM_SOUND_BYTES + 1)).toMatch(/10 MiB/);
  });
});

describe("custom audio storage", () => {
  it("stores, replaces, reads, and removes the local sound", async () => {
    const first = new File([new Uint8Array([1, 2, 3])], "first.mp3", { type: "audio/mpeg" });
    const second = new File([new Uint8Array([4, 5])], "second.ogg", { type: "audio/ogg" });
    await saveCustomSound(first);
    expect(await getCustomSound()).toMatchObject({ name: "first.mp3", size: 3 });
    await saveCustomSound(second);
    expect(await getCustomSound()).toMatchObject({ name: "second.ogg", size: 2 });
    await removeCustomSound();
    expect(await getCustomSound()).toBeNull();
  });
});
