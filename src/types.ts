export type FocusState = "tracking" | "away" | "inactivity-warning" | "alerting" | "missing-tab";
export type AlertReason = "away" | "inactivity";

export type AlertSound =
  | { kind: "default" }
  | { kind: "custom"; name: string; mimeType: string; size: number };

export interface WhistlerSettings {
  awayGraceMs: number;
  inactivityThresholdMs: number;
  warningLeadMs: number;
  sound: AlertSound;
  volume: number;
  repeatEnabled: boolean;
  repeatPeriodMs: number | null;
}

export interface FocusSession {
  version: 1;
  generation: string;
  revision: number;
  state: FocusState;
  reason?: AlertReason;
  tabId: number;
  windowId: number;
  focusSite: string;
  focusUrl: string;
  focusTitle: string;
  currentUrl: string;
  currentTitle: string;
  stateStartedAt: number;
  lastActivityAt: number;
  audible: boolean;
  muted: boolean;
  actionWindowId?: number;
}

export type SessionEvent =
  | { type: "OFF_TASK"; now: number }
  | { type: "ON_TASK"; now: number }
  | { type: "ACTIVITY"; now: number }
  | { type: "MEDIA_CHANGED"; now: number; audible: boolean; muted: boolean }
  | { type: "WARNING_DUE"; now: number }
  | { type: "ALERT_DUE"; now: number; reason: AlertReason }
  | { type: "TAB_CLOSED"; now: number }
  | { type: "REOPENED"; now: number; tabId: number; windowId: number }
  | { type: "RETURNED"; now: number };

export type RuntimeRequest =
  | { type: "activity" }
  | { type: "presence:yes" }
  | { type: "focus:return" }
  | { type: "focus:stop" }
  | { type: "focus:reopen" }
  | { type: "state:get" };

export type RuntimeBroadcast =
  | { type: "state:changed"; session: FocusSession | null }
  | { type: "alert:play" }
  | { type: "audio:stop" };

export interface StateSnapshot {
  session: FocusSession | null;
  settings: WhistlerSettings;
}
