import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("content activity heartbeat", () => {
  const listeners = new Map<string, (event: { isTrusted: boolean }) => void>();
  const documentListeners = new Map<string, (event: { isTrusted: boolean }) => void>();
  const sendMessage = vi.fn(() => Promise.resolve());

  beforeEach(async () => {
    vi.resetModules();
    listeners.clear();
    documentListeners.clear();
    sendMessage.mockClear();
    vi.useFakeTimers();
    vi.setSystemTime(10_000);

    vi.stubGlobal("window", {
      addEventListener: (name: string, listener: (event: { isTrusted: boolean }) => void) => listeners.set(name, listener)
    });
    vi.stubGlobal("document", {
      visibilityState: "visible",
      addEventListener: (name: string, listener: (event: { isTrusted: boolean }) => void) => documentListeners.set(name, listener)
    });
    vi.stubGlobal("browser", { runtime: { sendMessage } });

    await import("../src/content");
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("registers capture listeners for the relevant activity events", () => {
    expect([...listeners.keys()]).toEqual([
      "pointerdown",
      "pointermove",
      "keydown",
      "wheel",
      "scroll",
      "touchstart",
      "focus"
    ]);
    expect(documentListeners.has("visibilitychange")).toBe(true);
  });

  it("ignores synthetic events and throttles trusted activity", () => {
    listeners.get("pointerdown")?.({ isTrusted: false });
    expect(sendMessage).not.toHaveBeenCalled();

    listeners.get("pointerdown")?.({ isTrusted: true });
    listeners.get("pointermove")?.({ isTrusted: true });
    expect(sendMessage).toHaveBeenCalledTimes(1);

    vi.setSystemTime(11_001);
    listeners.get("keydown")?.({ isTrusted: true });
    expect(sendMessage).toHaveBeenCalledTimes(2);
    expect(sendMessage).toHaveBeenLastCalledWith({ type: "activity" });
  });

  it("reports a trusted transition back to a visible document", () => {
    documentListeners.get("visibilitychange")?.({ isTrusted: true });
    expect(sendMessage).toHaveBeenCalledWith({ type: "activity" });
  });
});
