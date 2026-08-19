import type { RuntimeRequest } from "./types";

void stopFocus();

async function stopFocus(): Promise<void> {
  await browser.runtime.sendMessage({ type: "focus:stop" } satisfies RuntimeRequest);
  window.close();
}
