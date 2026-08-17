import "./options.css";
import { getSettings, saveSettings, validateSettings } from "./core/settings";
import {
  createConfiguredAudio,
  getCustomSound,
  removeCustomSound,
  saveCustomSound,
  validateAudioDecodes
} from "./shared/audio-store";
import type { AlertSound, WhistlerSettings } from "./types";

const form = element<HTMLFormElement>("settings-form");
const awayValue = element<HTMLInputElement>("away-value");
const awayUnit = element<HTMLSelectElement>("away-unit");
const inactivityValue = element<HTMLInputElement>("inactivity-value");
const inactivityUnit = element<HTMLSelectElement>("inactivity-unit");
const warningValue = element<HTMLInputElement>("warning-value");
const warningUnit = element<HTMLSelectElement>("warning-unit");
const volume = element<HTMLInputElement>("volume");
const volumeOutput = element<HTMLOutputElement>("volume-output");
const soundDefault = element<HTMLInputElement>("sound-default");
const soundCustom = element<HTMLInputElement>("sound-custom");
const customFile = element<HTMLInputElement>("custom-file");
const customSoundName = element<HTMLElement>("custom-sound-name");
const removeSoundButton = element<HTMLButtonElement>("remove-sound");
const testSoundButton = element<HTMLButtonElement>("test-sound");
const repeatEnabled = element<HTMLInputElement>("repeat-enabled");
const repeatOptions = element<HTMLFieldSetElement>("repeat-options");
const repeatInherit = element<HTMLInputElement>("repeat-inherit");
const repeatCustom = element<HTMLInputElement>("repeat-custom");
const repeatValue = element<HTMLInputElement>("repeat-value");
const repeatUnit = element<HTMLSelectElement>("repeat-unit");
const errorMessage = element<HTMLElement>("error-message");
const saveStatus = element<HTMLElement>("save-status");

let selectedSound: AlertSound = { kind: "default" };
let saveTimer: number | undefined;
let currentAudio: HTMLAudioElement | null = null;
let restoring = true;

void restore();

form.addEventListener("input", handleFormChange);
form.addEventListener("change", handleFormChange);
volume.addEventListener("input", updateVolumeOutput);
repeatEnabled.addEventListener("change", updateRepeatControls);
repeatInherit.addEventListener("change", updateRepeatControls);
repeatCustom.addEventListener("change", updateRepeatControls);

customFile.addEventListener("change", () => {
  void handleCustomFile();
});

removeSoundButton.addEventListener("click", () => {
  void removeSound();
});

testSoundButton.addEventListener("click", () => {
  void testSound();
});

async function restore(): Promise<void> {
  const [settings, custom] = await Promise.all([getSettings(), getCustomSound()]);
  setDuration(awayValue, awayUnit, settings.awayGraceMs);
  setDuration(inactivityValue, inactivityUnit, settings.inactivityThresholdMs);
  setDuration(warningValue, warningUnit, settings.warningLeadMs);
  volume.value = String(Math.round(settings.volume * 100));
  repeatEnabled.checked = settings.repeatEnabled;
  if (settings.repeatPeriodMs === null) {
    repeatInherit.checked = true;
    setDuration(repeatValue, repeatUnit, settings.inactivityThresholdMs);
  } else {
    repeatCustom.checked = true;
    setDuration(repeatValue, repeatUnit, settings.repeatPeriodMs);
  }

  if (settings.sound.kind === "custom" && custom) {
    selectedSound = settings.sound;
    soundCustom.checked = true;
    customSoundName.textContent = settings.sound.name;
  } else {
    selectedSound = custom
      ? { kind: "custom", name: custom.name, mimeType: custom.mimeType, size: custom.size }
      : { kind: "default" };
    soundDefault.checked = true;
    customSoundName.textContent = custom?.name ?? "No file selected";
  }
  soundCustom.disabled = !custom;
  removeSoundButton.disabled = !custom;
  updateVolumeOutput();
  updateRepeatControls();
  restoring = false;
}

function handleFormChange(): void {
  updateVolumeOutput();
  updateRepeatControls();
  if (restoring) return;
  window.clearTimeout(saveTimer);
  saveStatus.textContent = "Saving…";
  saveTimer = window.setTimeout(() => void persistForm(), 250);
}

async function persistForm(): Promise<WhistlerSettings | null> {
  const settings = readForm();
  const errors = validateSettings(settings);
  if (errors.length > 0) {
    errorMessage.textContent = errors[0] ?? "Check the highlighted settings.";
    saveStatus.textContent = "Not saved";
    return null;
  }
  try {
    await saveSettings(settings);
    selectedSound = settings.sound;
    errorMessage.textContent = "";
    saveStatus.textContent = "Saved";
    return settings;
  } catch (error) {
    errorMessage.textContent = error instanceof Error ? error.message : "Could not save settings.";
    saveStatus.textContent = "Not saved";
    return null;
  }
}

function readForm(): WhistlerSettings {
  const useCustom = soundCustom.checked && selectedSound.kind === "custom";
  return {
    awayGraceMs: readDuration(awayValue, awayUnit),
    inactivityThresholdMs: readDuration(inactivityValue, inactivityUnit),
    warningLeadMs: readDuration(warningValue, warningUnit),
    sound: useCustom ? selectedSound : { kind: "default" },
    volume: Number(volume.value) / 100,
    repeatEnabled: repeatEnabled.checked,
    repeatPeriodMs: repeatCustom.checked ? readDuration(repeatValue, repeatUnit) : null
  };
}

async function handleCustomFile(): Promise<void> {
  const file = customFile.files?.[0];
  if (!file) return;
  testSoundButton.disabled = true;
  saveStatus.textContent = "Checking audio…";
  try {
    await validateAudioDecodes(file);
    await saveCustomSound(file);
    selectedSound = { kind: "custom", name: file.name, mimeType: file.type, size: file.size };
    customSoundName.textContent = file.name;
    soundCustom.disabled = false;
    soundCustom.checked = true;
    removeSoundButton.disabled = false;
    errorMessage.textContent = "";
    await persistForm();
  } catch (error) {
    errorMessage.textContent = error instanceof Error ? error.message : "Could not use this audio file.";
    saveStatus.textContent = "Custom sound not changed";
  } finally {
    testSoundButton.disabled = false;
    customFile.value = "";
  }
}

async function removeSound(): Promise<void> {
  await removeCustomSound();
  selectedSound = { kind: "default" };
  soundDefault.checked = true;
  soundCustom.disabled = true;
  removeSoundButton.disabled = true;
  customSoundName.textContent = "No file selected";
  await persistForm();
}

async function testSound(): Promise<void> {
  const settings = await persistForm();
  if (!settings) return;
  stopCurrentAudio();
  try {
    currentAudio = await createConfiguredAudio(settings);
    currentAudio.addEventListener("ended", () => { currentAudio = null; }, { once: true });
    await currentAudio.play();
  } catch {
    errorMessage.textContent = "Firefox could not play the selected sound.";
  }
}

function stopCurrentAudio(): void {
  if (!currentAudio) return;
  currentAudio.pause();
  currentAudio.currentTime = 0;
  currentAudio.removeAttribute("src");
  currentAudio.load();
  currentAudio = null;
}

function updateVolumeOutput(): void {
  volumeOutput.value = `${volume.value}%`;
}

function updateRepeatControls(): void {
  repeatOptions.disabled = !repeatEnabled.checked;
  repeatValue.disabled = !repeatEnabled.checked || !repeatCustom.checked;
  repeatUnit.disabled = !repeatEnabled.checked || !repeatCustom.checked;
}

function readDuration(input: HTMLInputElement, unit: HTMLSelectElement): number {
  return Number(input.value) * Number(unit.value);
}

function setDuration(input: HTMLInputElement, unit: HTMLSelectElement, milliseconds: number): void {
  const units = [3_600_000, 60_000, 1_000];
  const selectedUnit = units.find((candidate) => milliseconds !== 0 && milliseconds % candidate === 0) ?? 1_000;
  unit.value = String(selectedUnit);
  input.value = String(milliseconds / selectedUnit);
}

function element<T extends HTMLElement>(id: string): T {
  const value = document.getElementById(id);
  if (!value) throw new Error(`Missing #${id}`);
  return value as T;
}
