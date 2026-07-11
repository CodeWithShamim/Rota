---
name: verify
description: Build, launch, and drive the Rota web app to verify frontend changes at the browser surface.
---

# Verifying the Rota app (app/)

## Build & serve

```bash
cd app
npm run build                      # tsc -b + vite build (typecheck included)
npm run preview -- --port 4199 &   # serves dist/ at http://localhost:4199
```

SPA routes: `/` landing, `/app` dashboard, `/app/create`, `/docs`, `/news`.
The app talks to Arc testnet via public RPC, so dashboard data loads even
without a wallet; wallet-gated actions can't be driven headless (no injected
wallet) — verify their disabled/fallback states instead.

## Driving it headless

No playwright in this repo, and no playwright-managed Chromium on this
machine. What works: import playwright from the npx cache and launch the
system Chrome:

```js
import { chromium } from "/Users/shamimislam/.npm/_npx/705bc6b22212b352/node_modules/playwright/index.mjs";
const browser = await chromium.launch({ channel: "chrome", headless: true });
```

If that npx cache hash is gone, find another with
`grep -l '"playwright"' ~/.npm/_npx/*/package.json`.

## Gotchas

- Locale persists in `localStorage["rota.locale"]`; only `en` and `bn` are
  real translations, the rest fall back to English.
- The onboarding tour auto-starts on first `/app` visit and sets
  `localStorage["rota.tour.v1"]` — clear it (or use a fresh context) when
  testing anything on the dashboard, or it will overlay your target.
  Replay it with `window.dispatchEvent(new Event("rota:tour"))`.
- Check mobile at 375px width; nav pills scroll horizontally.
