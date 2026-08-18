import type { FocusSession, RuntimeRequest } from "./types";

const SESSION_KEY = "focusSession";
const TOOLBAR_PORT_NAME = "whistler-toolbar";
const FOCUS_START_POPUP = "focus-start.html";
const AWAY_POPUP = "away-toolbar.html";

let toolbarInteractionCount = 0;
let popupSyncPending = false;

void syncPopup();

browser.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "session" || !changes[SESSION_KEY]) return;
  requestPopupSync();
});

browser.runtime.onConnect.addListener((port) => {
  if (port.name !== TOOLBAR_PORT_NAME) return;
  toolbarInteractionCount += 1;
  port.onDisconnect.addListener(() => {
    toolbarInteractionCount = Math.max(0, toolbarInteractionCount - 1);
    if (toolbarInteractionCount !== 0) return;
    if (popupSyncPending) popupSyncPending = false;
    void syncPopup();
  });
});

browser.action.onClicked.addListener(() => {
  void browser.runtime.sendMessage({ type: "focus:stop" } satisfies RuntimeRequest);
});

function requestPopupSync(): void {
  if (toolbarInteractionCount > 0) {
    popupSyncPending = true;
    return;
  }
  void syncPopup();
}

async function syncPopup(): Promise<void> {
  const stored = await browser.storage.session.get(SESSION_KEY);
  const session = isSession(stored[SESSION_KEY]) ? stored[SESSION_KEY] : null;
  await browser.action.setPopup({ popup: popupFor(session) });
}

function popupFor(session: FocusSession | null): string {
  if (!session) return FOCUS_START_POPUP;
  if (session.state === "away" || session.state === "alerting" && session.reason === "away") return AWAY_POPUP;
  return "";
}

function isSession(value: unknown): value is FocusSession {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<FocusSession>;
  return candidate.version === 1
    && typeof candidate.generation === "string"
    && typeof candidate.state === "string";
}
