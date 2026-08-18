import { getDomain } from "tldts";

export function getFocusSite(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    const hostname = url.hostname.toLowerCase();
    return getDomain(hostname, { allowPrivateDomains: true }) ?? hostname;
  } catch {
    return null;
  }
}

export function matchesFocusSite(rawUrl: string, focusSite: string): boolean {
  return getFocusSite(rawUrl) === focusSite;
}

export function displayHost(rawUrl: string, fallback: string): string {
  try {
    return stripWww(new URL(rawUrl).hostname);
  } catch {
    return stripWww(fallback);
  }
}

function stripWww(hostname: string): string {
  return hostname.replace(/^www\./i, "");
}
