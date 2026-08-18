import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../src/core/settings";
import { awayAlertAt, inactivityDeadlines, repeatDelay, transition } from "../src/core/state-machine";
import type { FocusSession } from "../src/types";

const START = 1_000_000;

function focusedSession(overrides: Partial<FocusSession> = {}): FocusSession {
  return {
    version: 1,
    generation: "test-session",
    revision: 0,
    state: "tracking",
    tabId: 12,
    windowId: 4,
    focusSite: "example.com",
    focusUrl: "https://learn.example.com/lesson",
    focusTitle: "Lesson",
    currentUrl: "https://learn.example.com/lesson",
    currentTitle: "Lesson",
    stateStartedAt: START,
    lastActivityAt: START,
    audible: false,
    muted: false,
    ...overrides
  };
}

describe("focus state machine", () => {
  it("starts and cancels the away state", () => {
    const away = transition(focusedSession(), { type: "OFF_TASK", now: START + 100 });
    expect(away).toMatchObject({ state: "away", reason: "away", stateStartedAt: START + 100, revision: 1 });
    const returned = transition(away, { type: "ON_TASK", now: START + 200 });
    expect(returned).toMatchObject({ state: "tracking", lastActivityAt: START + 200, revision: 2 });
    expect("reason" in returned).toBe(false);
  });

  it("warns, alerts, and resets on activity", () => {
    const warning = transition(focusedSession(), { type: "WARNING_DUE", now: START + 10 });
    expect(warning).toMatchObject({ state: "inactivity-warning", reason: "inactivity" });
    const alert = transition(warning, { type: "ALERT_DUE", now: START + 20, reason: "inactivity" });
    expect(alert).toMatchObject({ state: "alerting", reason: "inactivity" });
    const active = transition(alert, { type: "ACTIVITY", now: START + 30 });
    expect(active).toMatchObject({ state: "tracking", lastActivityAt: START + 30 });
  });

  it("does not apply alarms to the wrong state", () => {
    const focused = focusedSession();
    expect(transition(focused, { type: "ALERT_DUE", now: START + 1, reason: "away" })).toBe(focused);
    const away = transition(focused, { type: "OFF_TASK", now: START + 2 });
    expect(transition(away, { type: "WARNING_DUE", now: START + 3 })).toBe(away);
  });

  it("suppresses warnings while audible and restarts after media ends", () => {
    const audible = transition(focusedSession(), { type: "MEDIA_CHANGED", now: START + 5, audible: true, muted: false });
    expect(audible).toMatchObject({ audible: true, muted: false, lastActivityAt: START + 5 });
    expect(transition(audible, { type: "WARNING_DUE", now: START + 6 })).toBe(audible);
    const silent = transition(audible, { type: "MEDIA_CHANGED", now: START + 10, audible: false, muted: false });
    expect(silent).toMatchObject({ state: "tracking", audible: false, lastActivityAt: START + 10 });
  });

  it("does not count page activity while away", () => {
    const away = transition(focusedSession(), { type: "OFF_TASK", now: START + 1 });
    expect(transition(away, { type: "ACTIVITY", now: START + 2 })).toBe(away);
  });

  it("moves to missing-tab and adopts a reopened tab", () => {
    const missing = transition(focusedSession({ reason: "inactivity", state: "alerting" }), { type: "TAB_CLOSED", now: START + 1 });
    expect(missing).toMatchObject({ state: "missing-tab", tabId: -1, audible: false });
    expect("reason" in missing).toBe(false);
    const reopened = transition(missing, { type: "REOPENED", now: START + 2, tabId: 90, windowId: 7 });
    expect(reopened).toMatchObject({ state: "tracking", tabId: 90, windowId: 7, lastActivityAt: START + 2 });
  });
});

describe("deadlines", () => {
  it("calculates warning and alert from the last activity", () => {
    expect(inactivityDeadlines(DEFAULT_SETTINGS, START)).toEqual({
      warningAt: START + 270_000,
      alertAt: START + 300_000
    });
    expect(inactivityDeadlines({ ...DEFAULT_SETTINGS, warningLeadMs: 0 }, START).warningAt).toBeNull();
  });

  it("uses the inactivity threshold after leaving the focus context", () => {
    expect(awayAlertAt(DEFAULT_SETTINGS, START)).toBe(START + 300_000);
    expect(awayAlertAt({ ...DEFAULT_SETTINGS, awayGraceMs: 0, inactivityThresholdMs: 42_000 }, START)).toBe(START + 42_000);
  });

  it("uses the default custom repeat period", () => {
    expect(repeatDelay(DEFAULT_SETTINGS, "away")).toBe(180_000);
    expect(repeatDelay(DEFAULT_SETTINGS, "inactivity")).toBe(180_000);
  });

  it("supports disabling repeats or inheriting the inactivity threshold", () => {
    expect(repeatDelay({ ...DEFAULT_SETTINGS, repeatEnabled: false }, "away")).toBeNull();
    expect(repeatDelay({ ...DEFAULT_SETTINGS, repeatPeriodMs: null }, "away")).toBe(300_000);
    expect(repeatDelay({ ...DEFAULT_SETTINGS, repeatPeriodMs: null }, "inactivity")).toBe(300_000);
    expect(repeatDelay({ ...DEFAULT_SETTINGS, repeatPeriodMs: 42_000 }, "away")).toBe(42_000);
  });
});