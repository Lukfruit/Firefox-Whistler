import { describe, expect, it } from "vitest";
import { displayHost, getFocusSite, matchesFocusSite } from "../src/core/site";

describe("focus site matching", () => {
  it.each([
    ["https://example.com/course/12", "example.com"],
    ["https://study.example.com/lesson", "example.com"],
    ["https://course.example.co.uk/path", "example.co.uk"],
    ["http://localhost:5173/path", "localhost"],
    ["http://127.0.0.1:8080/path", "127.0.0.1"],
    ["https://192.168.1.10/page", "192.168.1.10"]
  ])("extracts %s as %s", (url, expected) => {
    expect(getFocusSite(url)).toBe(expected);
  });

  it("matches sibling subdomains on a registrable domain", () => {
    expect(matchesFocusSite("https://docs.example.co.uk/guide", "example.co.uk")).toBe(true);
    expect(matchesFocusSite("https://app.example.co.uk/work", "example.co.uk")).toBe(true);
    expect(matchesFocusSite("https://example.com/", "example.co.uk")).toBe(false);
  });

  it.each(["about:config", "moz-extension://id/options.html", "file:///tmp/page.html", "not a url"])(
    "rejects unsupported URL %s",
    (url) => expect(getFocusSite(url)).toBeNull()
  );

  it("provides a safe display fallback", () => {
    expect(displayHost("https://learn.example.com/path", "example.com")).toBe("learn.example.com");
    expect(displayHost("broken", "example.com")).toBe("example.com");
  });
});
