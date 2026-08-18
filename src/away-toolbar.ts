import "./alert.css";
import { displayHost } from "./core/site";
import type { FocusSession, RuntimeBroadcast, RuntimeRequest, StateSnapshot } from "./types";

const TOOLBAR_PORT_NAME = "whistler-toolbar";
const toolbarPort = browser.runtime.connect({ name: TOOLBAR_PORT_NAME });
window.addEventListener("pagehide", () => toolbarPort.disconnect(), { once: true });

const focusPage = element<HTMLElement>("focus-page");
const primaryAction = element<HTMLButtonElement>("primary-action");
const stopAction = element<HTMLButtonElement>("stop-action");

primaryAction.addEventListener("click", () => {
  void browser.runtime.sendMessage({ type: "focus:return" } satisfies RuntimeRequest);
});

stopAction.addEventListener("click", () => {
  void browser.runtime.sendMessage({ type: "focus:stop" } satisfies RuntimeRequest);
});

browser.runtime.onMessage.addListener((broadcast: RuntimeBroadcast) => {
  if (broadcast.type !== "state:changed") return;
  if (!isAwaySession(broadcast.session)) window.close();
});

void initialize();

async function initialize(): Promise<void> {
  const snapshot = await browser.runtime.sendMessage({ type: "state:get" } satisfies RuntimeRequest) as StateSnapshot;
  const session = snapshot.session;
  if (!isAwaySession(session)) {
    window.close();
    return;
  }

  focusPage.textContent = `${session.focusTitle} · ${displayHost(session.focusUrl, session.focusSite)}`;
  primaryAction.focus();
}

function isAwaySession(current: FocusSession | null): current is FocusSession {
  return current?.state === "away" || current?.state === "alerting" && current.reason === "away";
}

function element<T extends HTMLElement>(id: string): T {
  const value = document.getElementById(id);
  if (!value) throw new Error(`Missing #${id}`);
  return value as T;
}
