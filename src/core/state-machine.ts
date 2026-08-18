import type { AlertReason, FocusSession, SessionEvent, WhistlerSettings } from "../types";

export function transition(session: FocusSession, event: SessionEvent): FocusSession {
  const next = { ...session, revision: session.revision + 1 };

  switch (event.type) {
    case "OFF_TASK":
      if (session.state === "missing-tab" || (session.state === "alerting" && session.reason === "away") || session.state === "away") {
        return session;
      }
      return { ...next, state: "away", reason: "away", stateStartedAt: event.now };
    case "ON_TASK":
      if (session.state !== "away" && !(session.state === "alerting" && session.reason === "away")) return session;
      return tracking(next, event.now);
    case "ACTIVITY":
      if (session.state === "missing-tab" || session.state === "away" || (session.state === "alerting" && session.reason === "away")) {
        return session;
      }
      return tracking(next, event.now);
    case "MEDIA_CHANGED": {
      const media = { ...session, audible: event.audible, muted: event.muted };
      if (session.state === "missing-tab" || session.state === "away" || (session.state === "alerting" && session.reason === "away")) {
        return media;
      }
      return tracking({ ...media, revision: media.revision + 1 }, event.now);
    }
    case "WARNING_DUE":
      if (session.state !== "tracking" || session.audible && !session.muted) return session;
      return { ...next, state: "inactivity-warning", reason: "inactivity", stateStartedAt: event.now };
    case "ALERT_DUE":
      if (event.reason === "away" && session.state !== "away") return session;
      if (event.reason === "inactivity" && session.state !== "tracking" && session.state !== "inactivity-warning") return session;
      return { ...next, state: "alerting", reason: event.reason, stateStartedAt: event.now };
    case "TAB_CLOSED":
      const { reason: _reason, ...withoutReason } = next;
      return {
        ...withoutReason,
        state: "missing-tab",
        tabId: -1,
        stateStartedAt: event.now,
        audible: false,
        muted: false
      };
    case "REOPENED":
      if (session.state !== "missing-tab") return session;
      return tracking({ ...next, tabId: event.tabId, windowId: event.windowId }, event.now);
    case "RETURNED":
      if (session.state === "missing-tab") return session;
      return tracking(next, event.now);
  }
}

export function inactivityDeadlines(settings: WhistlerSettings, lastActivityAt: number): {
  warningAt: number | null;
  alertAt: number;
} {
  return {
    warningAt: settings.warningLeadMs === 0
      ? null
      : lastActivityAt + settings.inactivityThresholdMs - settings.warningLeadMs,
    alertAt: lastActivityAt + settings.inactivityThresholdMs
  };
}

export function awayAlertAt(settings: WhistlerSettings, stateStartedAt: number): number {
  return stateStartedAt + settings.inactivityThresholdMs;
}

export function repeatDelay(settings: WhistlerSettings, _reason: AlertReason): number | null {
  if (!settings.repeatEnabled) return null;
  return settings.repeatPeriodMs ?? settings.inactivityThresholdMs;
}

function tracking(session: FocusSession, now: number): FocusSession {
  const { reason: _reason, ...withoutReason } = session;
  return {
    ...withoutReason,
    state: "tracking",
    stateStartedAt: now,
    lastActivityAt: now
  };
}