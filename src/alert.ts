import "./alert.css";
import { displayHost } from "./core/site";
import { createConfiguredAudio } from "./shared/audio-store";
import type { FocusSession, RuntimeBroadcast, RuntimeRequest, StateSnapshot } from "./types";

const title = element<HTMLElement>("alert-title");
const message = element<HTMLElement>("alert-message");
const focusPage = element<HTMLElement>("focus-page");
const primaryAction = element<HTMLButtonElement>("primary-action");
const stopAction = element<HTMLButtonElement>("stop-action");
const actions = primaryAction.parentElement as HTMLElement;
const mode = new URLSearchParams(window.location.search).get("mode");

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
  if (broadcast.type === "alert:play" && mode !== "away" && mode !== "focus-start") void playSound();
  if (broadcast.type === "audio:stop") stopSound();
});

void initialize();

async function initialize(): Promise<void> {
  const snapshot = await browser.runtime.sendMessage({ type: "state:get" } satisfies RuntimeRequest) as StateSnapshot;
  session = snapshot.session;
  render();
  if (mode === "focus-start" && session) {
    window.setTimeout(() => window.close(), 1000);
    return;
  }
  if (mode !== "away" && session?.state === "alerting") await playSound();
}

function render(): void {
  if (!session) {
    stopSound();
    window.close();
    return;
  }

  if (mode === "focus-start") {
    renderFocusStarted();
    return;
  }

  if (mode === "away") {
    if (session.state !== "away") {
      stopSound();
      window.close();
      return;
    }
    renderAway();
    return;
  }

  resetVisibility();
  focusPage.textContent = `${session.focusTitle} · ${displayHost(session.focusUrl, session.focusSite)}`;
  stopAction.textContent = "Stop focusing";

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
    document.title = `${isAway ? "Return to your focus site" : "Focus check-in"} — Whistler`;
    title.textContent = isAway ? "You left your focus site" : "Time to check back in";
    message.textContent = isAway
      ? "Return directly to the site you intended to focus on."
      : "There hasn’t been activity on your focus page for a while.";
    primaryAction.textContent = isAway ? "Return to focused site" : "Return to tab";
    stopAction.textContent = isAway ? "Disable focus" : "Stop focusing";
    primaryAction.focus();
    return;
  }

  window.close();
}

function renderFocusStarted(): void {
  resetVisibility();
  document.title = "Focusing — Whistler";
  message.hidden = true;
  focusPage.hidden = true;
  actions.hidden = true;
  title.replaceChildren(
    document.createTextNode("Focusing: "),
    scrollingHostname(displayHost(session!.focusUrl, session!.focusSite))
  );
  stopSound();
}

function renderAway(): void {
  resetVisibility();
  document.title = "Return to your focus site — Whistler";
  title.textContent = "You left your focus site";
  message.textContent = "Return to the site you intended to focus on, or disable focus.";
  focusPage.textContent = `${session!.focusTitle} · ${displayHost(session!.focusUrl, session!.focusSite)}`;
  primaryAction.textContent = "Return to focused site";
  stopAction.textContent = "Disable focus";
  primaryAction.focus();
  stopSound();
}

function resetVisibility(): void {
  message.hidden = false;
  focusPage.hidden = false;
  actions.hidden = false;
}

function scrollingHostname(hostname: string): HTMLElement {
  const viewport = document.createElement("span");
  viewport.style.display = "inline-block";
  viewport.style.maxWidth = "14ch";
  viewport.style.overflow = "hidden";
  viewport.style.whiteSpace = "nowrap";
  viewport.style.verticalAlign = "bottom";

  const track = document.createElement("span");
  track.textContent = hostname;
  track.style.display = "inline-block";
  viewport.append(track);

  window.requestAnimationFrame(() => {
    const distance = track.scrollWidth - viewport.clientWidth;
    if (distance <= 0 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    track.animate(
      [
        { transform: "translateX(0)" },
        { transform: `translateX(-${distance}px)` }
      ],
      {
        duration: Math.max(3000, distance * 90),
        direction: "alternate",
        iterations: Infinity,
        easing: "linear"
      }
    );
  });

  return viewport;
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
