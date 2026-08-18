import type { FocusSession, RuntimeRequest } from "./types";

const SESSION_KEY = "focusSession";
const FOCUS_START_POPUP = "focus-start.html";
const AWAY_POPUP = "away-toolbar.html";

void syncPopup();

browser.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "session" || !changes[SESSION_KEY]) return;
  void syncPopup();
});

browser.action.onClicked.addListener(() => {
  void browser.runtime.sendMessage({ type: "focus:stop" } satisfies RuntimeRequest);
});

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
