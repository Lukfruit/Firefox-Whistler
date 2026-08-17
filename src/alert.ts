import "./alert.css";
import { displayHost } from "./core/site";
import { createConfiguredAudio } from "./shared/audio-store";
import type { FocusSession, RuntimeBroadcast, RuntimeRequest, StateSnapshot } from "./types";

const title = element<HTMLElement>("alert-title");
const message = element<HTMLElement>("alert-message");
const focusPage = element<HTMLElement>("focus-page");
const primaryAction = element<HTMLButtonElement>("primary-action");
const stopAction = element<HTMLButtonElement>("stop-action");

let session: FocusSession | null = null;
let audio: HTMLAudioElement | null = null;

primaryAction.addEventListener("click", () => {
  if (!session) return;
  const request: RuntimeRequest = session.state === "inactivity-warning"
    ? { type: "presence:yes" }
    : session.state === "missing-tab"
      ? { type: "focus:reopen" }
      : { type: "focus:return" };
  void browser.runtime.sendMessage(request);
});

stopAction.addEventListener("click", () => {
  void browser.runtime.sendMessage({ type: "focus:stop" } satisfies RuntimeRequest);
});

browser.runtime.onMessage.addListener((broadcast: RuntimeBroadcast) => {
  if (broadcast.type === "state:changed") {
    session = broadcast.session;
    render();
  }
  if (broadcast.type === "alert:play") void playSound();
  if (broadcast.type === "audio:stop") stopSound();
});

void initialize();

async function initialize(): Promise<void> {
  const snapshot = await browser.runtime.sendMessage({ type: "state:get" } satisfies RuntimeRequest) as StateSnapshot;
  session = snapshot.session;
  render();
  if (session?.state === "alerting") await playSound();
}

function render(): void {
  if (!session) {
    stopSound();
    window.close();
    return;
  }
  focusPage.textContent = `${session.focusTitle} · ${displayHost(session.focusUrl, session.focusSite)}`;

  if (session.state === "inactivity-warning") {
    document.title = "Are you still here? — Whistler";
    title.textContent = "Are you still here?";
    message.textContent = "Confirm you’re present to continue the focus session without a whistle.";
    primaryAction.textContent = "Yes, I’m here";
    primaryAction.focus();
    stopSound();
    return;
  }

  if (session.state === "missing-tab") {
    document.title = "Focus tab was closed — Whistler";
    title.textContent = "Focus tab was closed";
    message.textContent = "Whistler can reopen the last focused page and continue tracking it.";
    primaryAction.textContent = "Reopen tab";
    primaryAction.focus();
    stopSound();
    return;
  }

  if (session.state === "alerting") {
    const isAway = session.reason === "away";
    document.title = `${isAway ? "Return to your focus tab" : "Focus check-in"} — Whistler`;
    title.textContent = isAway ? "You left your focus tab" : "Time to check back in";
    message.textContent = isAway
      ? "Return directly to the page you intended to focus on."
      : "There hasn’t been activity on your focus page for a while.";
    primaryAction.textContent = "Return to tab";
    primaryAction.focus();
    return;
  }

  window.close();
}

async function playSound(): Promise<void> {
  stopSound();
  try {
    audio = await createConfiguredAudio();
    audio.addEventListener("ended", () => { audio = null; }, { once: true });
    await audio.play();
  } catch {
    audio = null;
  }
}

function stopSound(): void {
  if (!audio) return;
  audio.pause();
  audio.currentTime = 0;
  audio.removeAttribute("src");
  audio.load();
  audio = null;
}

function element<T extends HTMLElement>(id: string): T {
  const value = document.getElementById(id);
  if (!value) throw new Error(`Missing #${id}`);
  return value as T;
}
