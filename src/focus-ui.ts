import type { FocusSession } from "./types";

const SESSION_KEY = "focusSession";
const ALERT_PAGE_URL = browser.runtime.getURL("alert.html");

let previousSession: FocusSession | null = null;
let focusStartedWindowId: number | undefined;

browser.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "session" || !changes[SESSION_KEY]) return;
  const next = asSession(changes[SESSION_KEY].newValue);
  void handleSessionChange(previousSession, next);
  previousSession = next;
});

browser.windows.onRemoved.addListener((windowId) => {
  if (windowId === focusStartedWindowId) focusStartedWindowId = undefined;
});

void initialize();

async function initialize(): Promise<void> {
  const stored = await browser.storage.session.get(SESSION_KEY);
  previousSession = asSession(stored[SESSION_KEY]);
  await syncActionPopup(previousSession);
}

async function handleSessionChange(previous: FocusSession | null, next: FocusSession | null): Promise<void> {
  await syncActionPopup(next);

  if (!next) {
    await closeFocusStartedWindow();
    return;
  }

  if (!previous || previous.generation !== next.generation) {
    await showFocusStartedWindow();
  }
}

async function syncActionPopup(current: FocusSession | null): Promise<void> {
  const popup = current?.state === "away" ? `${ALERT_PAGE_URL}?mode=away` : "";
  await browser.action.setPopup({ popup });
}

async function showFocusStartedWindow(): Promise<void> {
  await closeFocusStartedWindow();
  const created = await browser.windows.create({
    url: `${ALERT_PAGE_URL}?mode=focus-start`,
    type: "popup",
    focused: false,
    width: 380,
    height: 260
  });
  focusStartedWindowId = created.id;
}

async function closeFocusStartedWindow(): Promise<void> {
  if (focusStartedWindowId === undefined) return;
  const windowId = focusStartedWindowId;
  focusStartedWindowId = undefined;
  await safeRemoveWindow(windowId);
}

async function safeRemoveWindow(windowId: number): Promise<void> {
  try {
    await browser.windows.remove(windowId);
  } catch {
    // The popup may already have closed itself or been dismissed by the user.
  }
}

function asSession(value: unknown): FocusSession | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<FocusSession>;
  return candidate.version === 1 && typeof candidate.generation === "string" ? candidate as FocusSession : null;
}
