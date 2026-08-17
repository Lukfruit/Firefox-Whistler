export {};

const MIN_HEARTBEAT_INTERVAL_MS = 1_000;
let lastSentAt = 0;

function reportActivity(event?: Event): void {
  if (event && "isTrusted" in event && !event.isTrusted) return;
  const now = Date.now();
  if (now - lastSentAt < MIN_HEARTBEAT_INTERVAL_MS) return;
  lastSentAt = now;
  void browser.runtime.sendMessage({ type: "activity" }).catch(() => undefined);
}

const activityEvents = ["pointerdown", "pointermove", "keydown", "wheel", "scroll", "touchstart", "focus"] as const;
for (const eventName of activityEvents) {
  window.addEventListener(eventName, reportActivity, { capture: true, passive: true });
}

document.addEventListener("visibilitychange", (event) => {
  if (document.visibilityState === "visible") reportActivity(event);
}, { capture: true, passive: true });
