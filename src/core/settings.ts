import type { WhistlerSettings } from "../types";

export const MIN_DURATION_MS = 5_000;
export const MAX_DURATION_MS = 24 * 60 * 60 * 1_000;

export const DEFAULT_SETTINGS: WhistlerSettings = {
  awayGraceMs: 30_000,
  inactivityThresholdMs: 5 * 60_000,
  warningLeadMs: 30_000,
  sound: { kind: "default" },
  volume: 0.2,
  repeatEnabled: false,
  repeatPeriodMs: null
};

const finiteNumber = (value: unknown, fallback: number): number =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

export function normalizeSettings(value: unknown): WhistlerSettings {
  const source = value && typeof value === "object" ? value as Partial<WhistlerSettings> : {};
  const awayGraceMs = clampDuration(finiteNumber(source.awayGraceMs, DEFAULT_SETTINGS.awayGraceMs));
  const inactivityThresholdMs = clampDuration(
    finiteNumber(source.inactivityThresholdMs, DEFAULT_SETTINGS.inactivityThresholdMs)
  );
  const warning = finiteNumber(source.warningLeadMs, DEFAULT_SETTINGS.warningLeadMs);
  const warningLeadMs = Math.max(0, Math.min(warning, inactivityThresholdMs - 1));
  const repeatValue = source.repeatPeriodMs;
  const repeatPeriodMs = repeatValue === null || repeatValue === undefined
    ? null
    : clampDuration(finiteNumber(repeatValue, DEFAULT_SETTINGS.inactivityThresholdMs));
  const sound = source.sound?.kind === "custom"
    && typeof source.sound.name === "string"
    && typeof source.sound.mimeType === "string"
    && typeof source.sound.size === "number"
    ? source.sound
    : { kind: "default" as const };

  return {
    awayGraceMs,
    inactivityThresholdMs,
    warningLeadMs,
    sound,
    volume: Math.max(0, Math.min(1, finiteNumber(source.volume, DEFAULT_SETTINGS.volume))),
    repeatEnabled: source.repeatEnabled === true,
    repeatPeriodMs
  };
}

export function validateSettings(settings: WhistlerSettings): string[] {
  const errors: string[] = [];
  if (!validDuration(settings.awayGraceMs)) errors.push("Away grace must be between 5 seconds and 24 hours.");
  if (!validDuration(settings.inactivityThresholdMs)) errors.push("Inactivity threshold must be between 5 seconds and 24 hours.");
  if (settings.warningLeadMs < 0 || settings.warningLeadMs >= settings.inactivityThresholdMs) {
    errors.push("Warning lead must be zero or shorter than the inactivity threshold.");
  }
  if (settings.repeatPeriodMs !== null && !validDuration(settings.repeatPeriodMs)) {
    errors.push("Custom repeat period must be between 5 seconds and 24 hours.");
  }
  if (settings.volume < 0 || settings.volume > 1) errors.push("Volume must be between 0 and 100 percent.");
  return errors;
}

export async function getSettings(): Promise<WhistlerSettings> {
  const stored = await browser.storage.local.get("settings");
  return normalizeSettings(stored.settings);
}

export async function saveSettings(settings: WhistlerSettings): Promise<void> {
  const errors = validateSettings(settings);
  if (errors.length > 0) throw new Error(errors[0]);
  await browser.storage.local.set({ settings });
}

function clampDuration(value: number): number {
  return Math.max(MIN_DURATION_MS, Math.min(MAX_DURATION_MS, value));
}

function validDuration(value: number): boolean {
  return Number.isFinite(value) && value >= MIN_DURATION_MS && value <= MAX_DURATION_MS;
}
