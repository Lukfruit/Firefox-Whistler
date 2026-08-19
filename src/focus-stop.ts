import type { RuntimeRequest } from "./types";

void stopFocus();

async function stopFocus(): Promise<void> {
  await browser.runtime.sendMessage({ type: "focus:stop" } satisfies RuntimeRequest);
  await browser.action.setIcon({ path: "icons/eye-closed.svg" });
  await browser.action.setTitle({ title: "Start focusing with Whistler" });
  window.close();
}
