import "./alert.css";
import { displayHost } from "./core/site";
import type { FocusSession, RuntimeBroadcast, RuntimeRequest, StateSnapshot } from "./types";

const title = element<HTMLElement>("toolbar-title");
const message = element<HTMLElement>("toolbar-message");
const focusPage = element<HTMLElement>("focus-page");
const actions = element<HTMLElement>("toolbar-actions");
const primaryAction = element<HTMLButtonElement>("primary-action");
const stopAction = element<HTMLButtonElement>("stop-action");

const FOCUS_CONFIRMATION_MS = 2000;
const FOCUS_FADE_MS = 450;

let session: FocusSession | null = null;
let view: "starting" | "away" | null = null;

primaryAction.addEventListener("click", () => {
  void browser.runtime.sendMessage({ type: "focus:return" } satisfies RuntimeRequest);
});

stopAction.addEventListener("click", () => {
  void browser.runtime.sendMessage({ type: "focus:stop" } satisfies RuntimeRequest);
});

browser.runtime.onMessage.addListener((broadcast: RuntimeBroadcast) => {
  if (broadcast.type !== "state:changed") return;
  session = broadcast.session;
  if (view === "away" && !isAwaySession(session)) window.close();
});

void initialize();

async function initialize(): Promise<void> {
  let snapshot = await getSnapshot();

  if (!snapshot.session) {
    await browser.runtime.sendMessage({ type: "focus:start" } satisfies RuntimeRequest);
    snapshot = await getSnapshot();
    session = snapshot.session;
    if (!session) {
      window.close();
      return;
    }

    view = "starting";
    renderFocusStarted(session);
    scheduleFocusConfirmationClose();
    return;
  }

  session = snapshot.session;
  if (isAwaySession(session)) {
    view = "away";
    renderAway(session);
    return;
  }

  await browser.runtime.sendMessage({ type: "focus:stop" } satisfies RuntimeRequest);
  window.close();
}

async function getSnapshot(): Promise<StateSnapshot> {
  return browser.runtime.sendMessage({ type: "state:get" } satisfies RuntimeRequest) as Promise<StateSnapshot>;
}

function renderFocusStarted(current: FocusSession): void {
  document.title = "Focusing — Whistler";
  message.hidden = true;
  focusPage.hidden = true;
  actions.hidden = true;
  title.replaceChildren(
    document.createTextNode("Focusing: "),
    scrollingHostname(displayHost(current.focusUrl, current.focusSite))
  );
}

function scheduleFocusConfirmationClose(): void {
  const fadeDelay = FOCUS_CONFIRMATION_MS - FOCUS_FADE_MS;
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (!prefersReducedMotion) {
    document.body.animate(
      [{ opacity: 1 }, { opacity: 0 }],
      {
        duration: FOCUS_FADE_MS,
        delay: fadeDelay,
        fill: "forwards",
        easing: "ease-out"
      }
    );
  }

  window.setTimeout(() => window.close(), FOCUS_CONFIRMATION_MS);
}

function renderAway(current: FocusSession): void {
  document.title = "Return to your focus site — Whistler";
  message.hidden = false;
  focusPage.hidden = false;
  actions.hidden = false;
  title.textContent = "You left your focus site";
  message.textContent = "Return to the site you intended to focus on, or disable focus.";
  focusPage.textContent = `${current.focusTitle} · ${displayHost(current.focusUrl, current.focusSite)}`;
  primaryAction.textContent = "Return to focused site";
  stopAction.textContent = "Disable focus";
  primaryAction.focus();
}

function isAwaySession(current: FocusSession | null): current is FocusSession {
  return current?.state === "away" || current?.state === "alerting" && current.reason === "away";
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

function element<T extends HTMLElement>(id: string): T {
  const value = document.getElementById(id);
  if (!value) throw new Error(`Missing #${id}`);
  return value as T;
}
