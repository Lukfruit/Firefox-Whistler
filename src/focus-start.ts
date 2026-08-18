import "./alert.css";
import { displayHost } from "./core/site";
import type { RuntimeRequest, StateSnapshot } from "./types";

const TOOLBAR_PORT_NAME = "whistler-toolbar";
const FOCUS_CONFIRMATION_MS = 2000;
const FOCUS_FADE_MS = 450;

const toolbarPort = browser.runtime.connect({ name: TOOLBAR_PORT_NAME });
window.addEventListener("pagehide", () => toolbarPort.disconnect(), { once: true });

const title = element<HTMLElement>("focus-title");

void initialize();

async function initialize(): Promise<void> {
  await browser.runtime.sendMessage({ type: "focus:start" } satisfies RuntimeRequest);
  const snapshot = await browser.runtime.sendMessage({ type: "state:get" } satisfies RuntimeRequest) as StateSnapshot;
  const session = snapshot.session;
  if (!session) {
    window.close();
    return;
  }

  title.replaceChildren(
    document.createTextNode("Focusing: "),
    scrollingHostname(displayHost(session.focusUrl, session.focusSite))
  );
  scheduleClose();
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
