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
    expect(DEFAULT_SETTINGS.awayGraceMs).toBe(0);
    expect(DEFAULT_SETTINGS.repeatEnabled).toBe(true);
    expect(DEFAULT_SETTINGS.repeatPeriodMs).toBe(3 * 60_000);
  });

  it("normalizes unsafe stored values", () => {
    const settings = normalizeSettings({
      awayGraceMs: 30_000,
      inactivityThresholdMs: Number.POSITIVE_INFINITY,
      warningLeadMs: 999_999_999,
      volume: 4,
      repeatEnabled: "yes",
      repeatPeriodMs: MAX_DURATION_MS * 2,
      sound: { kind: "custom", name: 42 }
    });
    expect(settings.awayGraceMs).toBe(0);
    expect(settings.inactivityThresholdMs).toBe(DEFAULT_SETTINGS.inactivityThresholdMs);
    expect(settings.warningLeadMs).toBe(settings.inactivityThresholdMs - 1);
    expect(settings.volume).toBe(1);
    expect(settings.repeatEnabled).toBe(false);
    expect(settings.repeatPeriodMs).toBe(MAX_DURATION_MS);
    expect(settings.sound).toEqual({ kind: "default" });
  });

  it("preserves explicit existing repeat choices", () => {
    const settings = normalizeSettings({
      repeatEnabled: false,
      repeatPeriodMs: null
    });
    expect(settings.repeatEnabled).toBe(false);
    expect(settings.repeatPeriodMs).toBeNull();
  });

  it("rejects invalid relationships and ranges", () => {
    const errors = validateSettings({
      ...DEFAULT_SETTINGS,
      warningLeadMs: DEFAULT_SETTINGS.inactivityThresholdMs,
      repeatPeriodMs: MAX_DURATION_MS + 1,
      volume: -0.1
    });
    expect(errors).toHaveLength(3);
  });

  it("accepts zero warning lead and boundary durations", () => {
    expect(validateSettings({
      ...DEFAULT_SETTINGS,
      inactivityThresholdMs: MAX_DURATION_MS,
      warningLeadMs: 0,
      repeatPeriodMs: MIN_DURATION_MS,
      volume: 0
    })).toEqual([]);
  });
});
