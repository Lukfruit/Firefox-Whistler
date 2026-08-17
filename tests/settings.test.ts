import { describe, expect, it } from "vitest";
import {
  DEFAULT_SETTINGS,
  MAX_DURATION_MS,
  MIN_DURATION_MS,
  normalizeSettings,
  validateSettings
} from "../src/core/settings";

describe("settings", () => {
  it("supplies the intended defaults", () => {
    expect(normalizeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
  });

  it("normalizes unsafe stored values", () => {
    const settings = normalizeSettings({
      awayGraceMs: -1,
      inactivityThresholdMs: Number.POSITIVE_INFINITY,
      warningLeadMs: 999_999_999,
      volume: 4,
      repeatEnabled: "yes",
      repeatPeriodMs: MAX_DURATION_MS * 2,
      sound: { kind: "custom", name: 42 }
    });
    expect(settings.awayGraceMs).toBe(MIN_DURATION_MS);
    expect(settings.inactivityThresholdMs).toBe(DEFAULT_SETTINGS.inactivityThresholdMs);
    expect(settings.warningLeadMs).toBe(settings.inactivityThresholdMs - 1);
    expect(settings.volume).toBe(1);
    expect(settings.repeatEnabled).toBe(false);
    expect(settings.repeatPeriodMs).toBe(MAX_DURATION_MS);
    expect(settings.sound).toEqual({ kind: "default" });
  });

  it("rejects invalid relationships and ranges", () => {
    const errors = validateSettings({
      ...DEFAULT_SETTINGS,
      awayGraceMs: 1_000,
      warningLeadMs: DEFAULT_SETTINGS.inactivityThresholdMs,
      repeatPeriodMs: MAX_DURATION_MS + 1,
      volume: -0.1
    });
    expect(errors).toHaveLength(4);
  });

  it("accepts zero warning lead and boundary durations", () => {
    expect(validateSettings({
      ...DEFAULT_SETTINGS,
      awayGraceMs: MIN_DURATION_MS,
      inactivityThresholdMs: MAX_DURATION_MS,
      warningLeadMs: 0,
      repeatPeriodMs: MIN_DURATION_MS,
      volume: 0
    })).toEqual([]);
  });
});
