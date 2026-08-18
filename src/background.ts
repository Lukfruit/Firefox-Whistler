import { getSettings } from "./core/settings";
import { displayHost, getFocusSite, matchesFocusSite } from "./core/site";
import { inactivityDeadlines, repeatDelay, transition } from "./core/state-machine";
import type {
  AlertReason,
  FocusSession,
  RuntimeBroadcast,
  RuntimeRequest,
  SessionEvent,
  StateSnapshot,
  WhistlerSettings
} from "./types";

const SESSION_KEY = "focusSession";
const ALARM_PREFIX = "whistler";
const ALERT_NOTIFICATION_ID = "whistler-alert";
const CLOSED_NOTIFICATION_ID = "whistler-tab-closed";
const UNSUPPORTED_NOTIFICATION_ID = "whistler-unsupported";
const ALERT_PAGE_URL = browser.runtime.getURL("alert.html");
const AWAY_POPUP_URL = `${ALERT_PAGE_URL}?mode=away`;
const FOCUS_START_POPUP_URL = `${ALERT_PAGE_URL}?mode=focus-start`;
const FOCUS_START_POPUP_MS = 1000;

let session: FocusSession | null = null;
let settings: WhistlerSettings;
let initialization: Promise<void> | null = null;
let focusStartPopupGeneration: string | null = null;

void initialize();

browser.runtime.onInstalled.addListener(() => {
  void ensureSettingsStored();
});

browser.action.onClicked.addListener((tab) => {
  void toggleFocus(tab.id);
});

browser.tabs.onActivated.addListener(() => {
  void reconcileFocusContext();
});

browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (!session || tabId !== session.tabId) return;
  void handleTrackedTabUpdate(changeInfo, tab);
});

browser.tabs.onRemoved.addListener((tabId) => {
  if (!session || tabId !== session.tabId) return;
  void dispatch({ type: "TAB_CLOSED", now: Date.now() });
});

browser.windows.onFocusChanged.addListener((windowId) => {
  void handleWindowFocusChanged(windowId);
});

browser.windows.onRemoved.addListener((windowId) => {
  if (!session || session.actionWindowId !== windowId) return;
  const next = { ...session };
  delete next.actionWindowId;
  session = next;
  void persistAndPublish();
});

browser.alarms.onAlarm.addListener((alarm) => {
  void handleAlarm(alarm.name);
});

browser.notifications.onClicked.addListener((notificationId) => {
  if (notificationId === ALERT_NOTIFICATION_ID) void returnToFocus();
  if (notificationId === CLOSED_NOTIFICATION_ID) void reopenFocusTab();
});

browser.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local" || !changes.settings) return;
  void reloadSettings();
});

browser.runtime.onMessage.addListener((message: RuntimeRequest, sender) => {
  switch (message.type) {
    case "activity":
      if (sender.tab?.id === session?.tabId) void handleActivity();
      return undefined;
    case "presence:yes":
      void confirmPresence();
      return undefined;
    case "focus:return":
      void returnToFocus();
      return undefined;
    case "focus:stop":
      void stopFocusing();
      return undefined;
    case "focus:reopen":
      void reopenFocusTab();
      return undefined;
    case "state:get":
      return initialize().then(() => ({ session, settings } satisfies StateSnapshot));
    default:
      return undefined;
  }
});

async function initialize(): Promise<void> {
  if (initialization) return initialization;
  initialization = initializeOnce();
  return initialization;
}

async function initializeOnce(): Promise<void> {
  settings = await getSettings();
  const stored = await browser.storage.session.get(SESSION_KEY);
  session = isSession(stored[SESSION_KEY]) ? stored[SESSION_KEY] : null;
  if (session && session.state !== "missing-tab") {
    try {
      await browser.tabs.get(session.tabId);
    } catch {
      session = transition(session, { type: "TAB_CLOSED", now: Date.now() });
    }
  }
  await setToolbarState();
  await reconfigureTimers();
  await persistAndPublish();
}

async function ensureSettingsStored(): Promise<void> {
  const stored = await browser.storage.local.get("settings");
  if (!stored.settings) await browser.storage.local.set({ settings: await getSettings() });
}

async function toggleFocus(tabId?: number): Promise<void> {
  await initialize();
  if (session) {
    await stopFocusing();
    return;
  }

  if (tabId === undefined) return;
  const tab = await safeGetTab(tabId);
  if (!tab) return;

  const url = tab.url ?? "";
  const focusSite = getFocusSite(url);
  if (!focusSite || tab.id === undefined || tab.windowId === undefined) {
    await browser.notifications.create(UNSUPPORTED_NOTIFICATION_ID, {
      type: "basic",
      iconUrl: browser.runtime.getURL("icons/whistler.svg"),
      title: "Whistler can’t focus this page",
      message: "Open a regular HTTP or HTTPS website, then click the closed eye again."
    });
    return;
  }

  const now = Date.now();
  session = {
    version: 1,
    generation: crypto.randomUUID(),
    revision: 0,
    state: "tracking",
    tabId: tab.id,
    windowId: tab.windowId,
    focusSite,
    focusUrl: url,
    focusTitle: tab.title || displayHost(url, focusSite),
    currentUrl: url,
    currentTitle: tab.title || displayHost(url, focusSite),
    stateStartedAt: now,
    lastActivityAt: now,
    audible: tab.audible === true,
    muted: tab.mutedInfo?.muted === true
  };

  await showFocusStartedPopup(session.generation);
  await persistAndPublish();
  await reconfigureTimers();
}

async function showFocusStartedPopup(generation: string): Promise<void> {
  focusStartPopupGeneration = generation;
  await setToolbarState();

  try {
    await browser.action.openPopup();
  } catch {
    // Firefox can reject this if the initiating user gesture is no longer active.
  }

  setTimeout(() => {
    if (focusStartPopupGeneration !== generation) return;
    focusStartPopupGeneration = null;
    void setToolbarState();
  }, FOCUS_START_POPUP_MS);
}

async function handleTrackedTabUpdate(
  changeInfo: browser.tabs._OnUpdatedChangeInfo,
  tab: browser.tabs.Tab
): Promise<void> {
  if (!session) return;
  const next = { ...session };
  const url = tab.url ?? next.currentUrl;
  const title = tab.title || next.currentTitle;
  next.currentUrl = url;
  next.currentTitle = title;
  if (matchesFocusSite(url, next.focusSite)) {
    next.focusUrl = url;
    next.focusTitle = title || displayHost(url, next.focusSite);
  }
  session = next;

  const audible = tab.audible === true;
  const muted = tab.mutedInfo?.muted === true;
  if (audible !== session.audible || muted !== session.muted || "audible" in changeInfo || "mutedInfo" in changeInfo) {
    await dispatch({ type: "MEDIA_CHANGED", now: Date.now(), audible, muted });
  } else {
    await persistAndPublish();
  }
  await reconcileFocusContext();
}

async function handleActivity(): Promise<void> {
  if (!session) return;
  const tab = await safeGetTab(session.tabId);
  if (!tab || !matchesFocusSite(tab.url ?? "", session.focusSite)) return;
  const onTask = await tabIsOnTask(tab);
  if (!onTask) return;
  await dispatch({ type: "ACTIVITY", now: Date.now() });
}

async function handleWindowFocusChanged(windowId: number): Promise<void> {
  await initialize();
  if (!session) return;
  if (windowId !== browser.windows.WINDOW_ID_NONE && await isWhistlerWindow(windowId)) return;
  await reconcileFocusContext();
}

async function reconcileFocusContext(): Promise<void> {
  await initialize();
  if (!session || session.state === "missing-tab") return;
  const tab = await safeGetTab(session.tabId);
  if (!tab) {
    await dispatch({ type: "TAB_CLOSED", now: Date.now() });
    return;
  }
  const onTask = await tabIsOnTask(tab);
  await dispatch({ type: onTask ? "ON_TASK" : "OFF_TASK", now: Date.now() });
}

async function tabIsOnTask(tab: browser.tabs.Tab): Promise<boolean> {
  if (!session || tab.windowId === undefined || !tab.active || !matchesFocusSite(tab.url ?? "", session.focusSite)) return false;
  try {
    const windowInfo = await browser.windows.get(tab.windowId);
    if (windowInfo.focused) return true;
    const lastFocused = await browser.windows.getLastFocused({ populate: true });
    if (lastFocused.id !== undefined && await isWhistlerWindow(lastFocused.id)) {
      return session.state === "tracking"
        || session.state === "inactivity-warning"
        || session.state === "alerting" && session.reason === "inactivity";
    }
  } catch {
    return false;
  }
  return false;
}

async function isWhistlerWindow(windowId: number): Promise<boolean> {
  if (session?.actionWindowId === windowId) return true;
  try {
    const windowInfo = await browser.windows.get(windowId, { populate: true });
    return windowInfo.type === "popup" && windowInfo.tabs?.some((tab) => tab.url?.startsWith(ALERT_PAGE_URL)) === true;
  } catch {
    return false;
  }
}

async function dispatch(event: SessionEvent): Promise<void> {
  if (!session) return;
  const previous = session;
  const next = transition(previous, event);
  if (next === previous) return;
  session = next;
  const enteredNewState = previous.state !== next.state || previous.reason !== next.reason;

  if (enteredNewState && (next.state === "tracking" || next.state === "away")) {
    await clearUserAlert();
  }
  await persistAndPublish();

  if (enteredNewState && next.state === "inactivity-warning") {
    await ensureActionWindow(false);
  } else if (enteredNewState && next.state === "alerting") {
    await showAlert(next.reason ?? "inactivity");
  } else if (enteredNewState && next.state === "missing-tab") {
    await showMissingTab();
  }

  await reconfigureTimers();
}

async function reconfigureTimers(): Promise<void> {
  await clearWhistlerAlarms();
  if (!session) return;
  const now = Date.now();

  if (session.state === "tracking") {
    if (session.audible && !session.muted) return;
    const deadlines = inactivityDeadlines(settings, session.lastActivityAt);
    if (deadlines.alertAt <= now) {
      await dispatch({ type: "ALERT_DUE", now, reason: "inactivity" });
      return;
    }
    if (deadlines.warningAt !== null && deadlines.warningAt <= now) {
      await dispatch({ type: "WARNING_DUE", now });
      return;
    }
    if (deadlines.warningAt !== null) await createAlarm("warning", deadlines.warningAt);
    await createAlarm("inactivity", deadlines.alertAt);
    return;
  }

  if (session.state === "inactivity-warning") {
    const alertAt = session.lastActivityAt + settings.inactivityThresholdMs;
    if (alertAt <= now) await dispatch({ type: "ALERT_DUE", now, reason: "inactivity" });
    else await createAlarm("inactivity", alertAt);
    return;
  }

  if (session.state === "away") {
    const alertAt = session.stateStartedAt + settings.awayGraceMs;
    if (alertAt <= now) await dispatch({ type: "ALERT_DUE", now, reason: "away" });
    else await createAlarm("away", alertAt);
    return;
  }

  if (session.state === "alerting" && session.reason) {
    const delay = repeatDelay(settings, session.reason);
    if (delay !== null) await createAlarm("repeat", session.stateStartedAt + delay);
  }
}

async function createAlarm(kind: "warning" | "inactivity" | "away" | "repeat", when: number): Promise<void> {
  if (!session) return;
  await browser.alarms.create(`${ALARM_PREFIX}:${kind}:${session.generation}:${session.revision}`, { when });
}

async function handleAlarm(name: string): Promise<void> {
  await initialize();
  if (!session) return;
  const [prefix, kind, generation, revisionText] = name.split(":");
  if (prefix !== ALARM_PREFIX || generation !== session.generation || Number(revisionText) !== session.revision) return;
  const now = Date.now();
  if (kind === "warning") await dispatch({ type: "WARNING_DUE", now });
  if (kind === "inactivity") await dispatch({ type: "ALERT_DUE", now, reason: "inactivity" });
  if (kind === "away") await dispatch({ type: "ALERT_DUE", now, reason: "away" });
  if (kind === "repeat" && session?.state === "alerting" && session.reason) {
    const reason = session.reason;
    session = { ...session, stateStartedAt: now, revision: session.revision + 1 };
    await persistAndPublish();
    await showAlert(reason);
    await reconfigureTimers();
  }
}

async function showAlert(reason: AlertReason): Promise<void> {
  if (!session) return;
  const title = reason === "away" ? "You left your focus tab" : "Are you still there?";
  await browser.notifications.create(ALERT_NOTIFICATION_ID, {
    type: "basic",
    iconUrl: browser.runtime.getURL("icons/whistler.svg"),
    title,
    message: `${session.focusTitle}\n${displayHost(session.focusUrl, session.focusSite)}`
  });
  await ensureActionWindow(true);
}

async function showMissingTab(): Promise<void> {
  if (!session) return;
  await stopAudio();
  await browser.notifications.clear(ALERT_NOTIFICATION_ID);
  await browser.notifications.create(CLOSED_NOTIFICATION_ID, {
    type: "basic",
    iconUrl: browser.runtime.getURL("icons/whistler.svg"),
    title: "Focus tab was closed",
    message: `${session.focusTitle}\nClick to reopen ${displayHost(session.focusUrl, session.focusSite)}.`
  });
  await ensureActionWindow(false);
}

async function ensureActionWindow(playSound: boolean): Promise<void> {
  if (!session) return;
  if (session.actionWindowId !== undefined) {
    try {
      await browser.windows.update(session.actionWindowId, { focused: true });
      await broadcast({ type: "state:changed", session });
      if (playSound) await broadcast({ type: "alert:play" });
      return;
    } catch {
      const next = { ...session };
      delete next.actionWindowId;
      session = next;
    }
  }

  const created = await browser.windows.create({
    url: ALERT_PAGE_URL,
    type: "popup",
    focused: true,
    width: 380,
    height: 260
  });
  if (session && created.id !== undefined) {
    session = { ...session, actionWindowId: created.id };
    await persistAndPublish();
  }
}

async function confirmPresence(): Promise<void> {
  if (!session || session.state === "missing-tab") return;
  await dispatch({ type: "ACTIVITY", now: Date.now() });
}

async function returnToFocus(): Promise<void> {
  if (!session || session.state === "missing-tab") return;
  const tab = await safeGetTab(session.tabId);
  if (!tab) {
    await dispatch({ type: "TAB_CLOSED", now: Date.now() });
    return;
  }
  if (!matchesFocusSite(tab.url ?? "", session.focusSite)) {
    await browser.tabs.update(session.tabId, { url: session.focusUrl });
  }
  await browser.windows.update(session.windowId, { focused: true });
  await browser.tabs.update(session.tabId, { active: true });
  await dispatch({ type: "RETURNED", now: Date.now() });
}

async function reopenFocusTab(): Promise<void> {
  if (!session || session.state !== "missing-tab") return;
  let tab: browser.tabs.Tab;
  try {
    await browser.windows.get(session.windowId);
    tab = await browser.tabs.create({ url: session.focusUrl, active: true, windowId: session.windowId });
  } catch {
    tab = await browser.tabs.create({ url: session.focusUrl, active: true });
  }
  if (tab.id === undefined || tab.windowId === undefined) return;
  await browser.windows.update(tab.windowId, { focused: true });
  await dispatch({ type: "REOPENED", now: Date.now(), tabId: tab.id, windowId: tab.windowId });
}

async function stopFocusing(): Promise<void> {
  if (!session) return;
  const actionWindowId = session.actionWindowId;
  session = null;
  focusStartPopupGeneration = null;
  await clearWhistlerAlarms();
  await browser.notifications.clear(ALERT_NOTIFICATION_ID);
  await browser.notifications.clear(CLOSED_NOTIFICATION_ID);
  await stopAudio();
  await browser.storage.session.remove(SESSION_KEY);
  await setToolbarState();
  await broadcast({ type: "state:changed", session: null });
  if (actionWindowId !== undefined) await safeRemoveWindow(actionWindowId);
}

async function clearUserAlert(): Promise<void> {
  if (!session) return;
  const actionWindowId = session.actionWindowId;
  if (actionWindowId !== undefined) {
    const next = { ...session };
    delete next.actionWindowId;
    session = next;
  }
  await stopAudio();
  await browser.notifications.clear(ALERT_NOTIFICATION_ID);
  await browser.notifications.clear(CLOSED_NOTIFICATION_ID);
  if (actionWindowId !== undefined) await safeRemoveWindow(actionWindowId);
}

async function stopAudio(): Promise<void> {
  await broadcast({ type: "audio:stop" });
}

async function clearWhistlerAlarms(): Promise<void> {
  const alarms = await browser.alarms.getAll();
  await Promise.all(alarms.filter((alarm) => alarm.name.startsWith(`${ALARM_PREFIX}:`)).map((alarm) => browser.alarms.clear(alarm.name)));
}

async function reloadSettings(): Promise<void> {
  settings = await getSettings();
  await reconfigureTimers();
  await broadcast({ type: "state:changed", session });
}

async function persistAndPublish(): Promise<void> {
  if (session) await browser.storage.session.set({ [SESSION_KEY]: session });
  else await browser.storage.session.remove(SESSION_KEY);
  await setToolbarState();
  await broadcast({ type: "state:changed", session });
}

async function setToolbarState(): Promise<void> {
  await browser.action.setIcon({ path: session ? "icons/eye-open.svg" : "icons/eye-closed.svg" });
  await browser.action.setTitle({
    title: session ? `Stop focusing on ${session.focusSite}` : "Start focusing with Whistler"
  });

  const popup = session && focusStartPopupGeneration === session.generation
    ? FOCUS_START_POPUP_URL
    : session?.state === "away"
      ? AWAY_POPUP_URL
      : "";
  await browser.action.setPopup({ popup });
}

async function broadcast(message: RuntimeBroadcast): Promise<void> {
  try {
    await browser.runtime.sendMessage(message);
  } catch {
    // No extension view is listening.
  }
}

async function safeGetTab(tabId: number): Promise<browser.tabs.Tab | null> {
  try {
    return await browser.tabs.get(tabId);
  } catch {
    return null;
  }
}

async function safeRemoveWindow(windowId: number): Promise<void> {
  try {
    await browser.windows.remove(windowId);
  } catch {
    // The user may have already closed the compact window.
  }
}

function isSession(value: unknown): value is FocusSession {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<FocusSession>;
  const validStates = new Set(["tracking", "away", "inactivity-warning", "alerting", "missing-tab"]);
  return candidate.version === 1
    && typeof candidate.generation === "string"
    && typeof candidate.tabId === "number"
    && typeof candidate.windowId === "number"
    && typeof candidate.focusSite === "string"
    && typeof candidate.focusUrl === "string"
    && typeof candidate.state === "string"
    && validStates.has(candidate.state);
}
