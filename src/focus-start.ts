import "./alert.css";
import { displayHost } from "./core/site";
import type { FocusSession, RuntimeRequest, StateSnapshot } from "./types";

const TOOLBAR_PORT_NAME = "whistler-toolbar";
const FOCUS_CONFIRMATION_MS = 2000;
const FOCUS_FADE_MS = 450;
const FOCUS_LABEL = "Focusing: ";
const FOCUS_TITLE_CHAR_BUDGET = 14;
const HOSTNAME_VIEWPORT_CHARS = Math.max(1, FOCUS_TITLE_CHAR_BUDGET - FOCUS_LABEL.length);

const toolbarPort = browser.runtime.connect({ name: TOOLBAR_PORT_NAME });
window.addEventListener("pagehide", () => toolbarPort.disconnect(), { once: true });

const title = element<HTMLElement>("focus-title");

void initialize();

async function initialize(): Promise<void> {
  const existing = await getSnapshot();
  if (isActiveFocus(existing.session)) {
    await browser.runtime.sendMessage({ type: "focus:stop" } satisfies RuntimeRequest);
    window.close();
    return;
  }

  await browser.runtime.sendMessage({ type: "focus:start" } satisfies RuntimeRequest);
  const snapshot = await getSnapshot();
  const session = snapshot.session;
  if (!session) {
    window.close();
    return;
  }

  title.replaceChildren(
    document.createTextNode(FOCUS_LABEL),
    scrollingHostname(displayHost(session.focusUrl, session.focusSite))
  );
  scheduleClose();
}

async function getSnapshot(): Promise<StateSnapshot> {
  return browser.runtime.sendMessage({ type: "state:get" } satisfies RuntimeRequest) as Promise<StateSnapshot>;
}

function isActiveFocus(session: FocusSession | null): boolean {
  return session?.state === "tracking"
    || session?.state === "inactivity-warning"
    || session?.state === "alerting" && session.reason === "inactivity";
}

function scheduleClose(): void {
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

function scrollingHostname(hostname: string): HTMLElement {
  const viewport = document.createElement("span");
  viewport.style.display = "inline-block";
  viewport.style.width = `${HOSTNAME_VIEWPORT_CHARS}ch`;
  viewport.style.maxWidth = `${HOSTNAME_VIEWPORT_CHARS}ch`;
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
