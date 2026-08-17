# Whistler

Whistler is a local-first Firefox extension that makes it noticeable when you drift away from a tab or website you intended to focus on.

## Development

Requires Node.js 20 or newer and Firefox 115 or newer.

```sh
npm install
npm run verify
npm run package
```

To try the built extension:
run `npx web-ext run --source-dir dist` after `npm run build`,
or
load `dist/manifest.json` as a temporary add-on from `about:debugging`.

Whistler has no server, account, analytics, telemetry, or runtime network requests. Settings and custom sounds remain in the local Firefox profile.

## Open settings

Open `about:addons`, select **Extensions → Whistler**, then open the **Preferences** section. Whistler’s settings are embedded in Firefox’s extension settings rather than attached to the toolbar button. After loading a new temporary build, use **Reload** for Whistler in `about:debugging` so Firefox picks up the updated behavior.
