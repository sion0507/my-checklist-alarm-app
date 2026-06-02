# Issue #13: Public deployment and iPhone manual verification handoff

Issue #13 is HITL because a public HTTPS hosting account, production secrets, and a real iPhone are required to complete the final acceptance checks. This document records the current deployment shape, free-tier assumptions, blockers, and the manual verification checklist.

## Current app/backend structure

- Frontend: Vite + React PWA.
- Production build command: `npm run build`.
- Static output directory: `dist/`.
- PWA assets:
  - `index.html` links `/manifest.webmanifest` and iPhone web app meta tags.
  - `public/manifest.webmanifest` declares standalone display, app identity, theme/background color, and a maskable icon.
  - `public/service-worker.js` caches shell assets, handles `push`, calls `showNotification()`, and routes notification clicks to the payload `path`.
- Push API route:
  - `api/push/[action].ts` mounts the push HTTP API for serverless-style deployments.
  - Supported routes are `/api/push/vapid-public-key`, `/api/push/subscriptions`, `/api/push/test`, and `/api/push/schedule`.
- Backend implementation:
  - `src/pushHttpApi.ts` parses API requests and delegates to the push backend.
  - `src/pushBackend.ts` stores only push subscription endpoint/keys plus minimal metadata and scheduled job records.
  - `api/push/[action].ts` configures `web-push` from environment variables and sends the immediate test push when enabled.

## Important production limitation

The checked-in `api/push/[action].ts` serverless adapter currently creates an in-memory push backend instance. That is fine for tests and local/serverless smoke checks, but it is **not durable enough for production scheduled reminders**:

- Serverless instances can restart or scale, losing in-memory subscriptions and scheduled jobs.
- A free-tier deployment still needs durable storage for subscriptions and derived schedule records.
- A free-tier deployment still needs a scheduler/cron worker that reads due jobs and sends Web Push at/near the scheduled times.

Do not claim morning, time-specific, or evening scheduled push delivery is verified until durable storage, a scheduler, and real iPhone delivery have been exercised on the chosen provider.

## Recommended free-tier deployment target

A practical first target is Vercel because the repo already contains a Vercel-style `api/push/[action].ts` route and Vite static build output. Other providers are possible, but will need adapter work:

- Vercel: frontend + serverless API can fit the current file layout. Needs external durable storage and cron/scheduler wiring for scheduled reminders.
- Netlify: would need Netlify Functions route adaptation or redirects.
- Cloudflare Pages/Workers: would need Worker-style API/storage adaptation, but can use KV/D1/Cron Triggers.

## Required user inputs / credentials

Provide these before attempting real public deployment:

1. Hosting target and project/account access, for example Vercel team/project access or a deploy token.
2. Production public URL or permission to create one.
3. VAPID keys generated for the production origin:
   - `VAPID_PUBLIC_KEY`
   - `VAPID_PRIVATE_KEY`
   - `VAPID_SUBJECT` such as `mailto:you@example.com` or an HTTPS contact URL.
4. `PUSH_TEST_SENDER_ENABLED=true` once the sender should send real pushes.
5. Durable storage choice/binding for subscription and schedule records.
6. Scheduler/cron choice for due scheduled jobs.
7. Real iPhone on iOS 16.4+ for manual Home Screen PWA verification.

Use `.env.example` as the non-secret template. Never commit real secret values.

## Pre-deployment checklist

- [ ] `npm install` completed.
- [ ] `npm run test:all` passes.
- [ ] `npm run build` passes.
- [ ] `dist/manifest.webmanifest` exists after build.
- [ ] `dist/service-worker.js` exists after build.
- [ ] Production environment variables are configured in the hosting provider, not committed.
- [ ] Public HTTPS URL is known.
- [ ] `/api/push/vapid-public-key` returns the configured public VAPID key over HTTPS.
- [ ] Durable subscription/schedule storage is configured or the limitation is explicitly accepted for a short test-only deployment.
- [ ] Scheduler/cron worker is configured or scheduled reminder delivery is explicitly marked unverified.

## Public HTTPS smoke checklist

Run these from a trusted machine after deployment, replacing `$APP_URL` with the production HTTPS origin:

```bash
curl -I "$APP_URL/"
curl -fsS "$APP_URL/manifest.webmanifest"
curl -fsS "$APP_URL/service-worker.js"
curl -fsS "$APP_URL/api/push/vapid-public-key"
```

Expected results:

- The app URL returns `200` over HTTPS.
- Manifest JSON contains `display: "standalone"` and the app icon.
- Service worker source contains `push` and `notificationclick` handlers.
- VAPID endpoint returns JSON with a non-empty `publicKey`.

## iPhone manual verification checklist

Use a real iPhone with iOS 16.4+.

### Installability and app shell

- [ ] Open the HTTPS URL in Safari.
- [ ] Add the app to Home Screen.
- [ ] Launch from the Home Screen icon.
- [ ] Confirm the app opens in standalone PWA mode, not as a normal Safari tab.
- [ ] Confirm Today, Calendar, and Settings tabs load.

### Permission/subscription/test push

- [ ] Open Settings in the installed PWA.
- [ ] Tap the notification test/enable control from a direct user gesture.
- [ ] Confirm iOS shows the notification permission prompt.
- [ ] Tap Allow.
- [ ] Confirm the app reports permission/subscription success.
- [ ] Confirm backend receives/stores the subscription without full local task data.
- [ ] Trigger backend test push.
- [ ] Confirm a system notification appears while the PWA is closed or in background.
- [ ] Tap the test notification and confirm the PWA opens.

### Scheduled flows

Because scheduled delivery depends on provider cron/storage, record exact observed times and provider logs.

- [ ] Morning reminder is delivered near the configured morning time.
- [ ] A notification-enabled time-specific task is delivered near its task time.
- [ ] Tapping a time-specific task notification opens the related task/date and highlights it.
- [ ] Evening unfinished-task review push is delivered near the configured evening time only when unfinished tasks exist.
- [ ] No evening push is sent when the date has no unfinished tasks.
- [ ] Focus/Do Not Disturb, notification settings, and network state are recorded for each result.

### Negative cases

- [ ] Deny notification permission and confirm the app handles it without crashing.
- [ ] Remove permission in iOS settings and confirm future notifications stop.
- [ ] Delete/reinstall the Home Screen app and confirm a new subscription can be created.
- [ ] Clear local app data and confirm the app documents local-data loss.

## Free-tier known limitations to document in release notes

- Delivery is best-effort and can drift due to provider cron limits, cold starts, quotas, and push service/device policy.
- iOS Web Push works only for Home Screen-installed web apps on iOS/iPadOS 16.4+.
- Safari tab usage alone is not sufficient for iPhone Home Screen PWA Web Push.
- Device Focus, notification settings, lock screen settings, network state, and battery policy can suppress or delay notifications.
- The current checked-in API adapter needs durable storage and scheduler wiring before scheduled reminders can be considered production-ready.
- Web Push cannot provide a custom alarm sound/song; it uses system/browser notification behavior.

## HITL status for this branch

Automated build/test and documentation can be completed by Builder. Public deployment and iPhone lock-screen/system push verification require user-provided hosting credentials/target, production secrets, durable storage/scheduler choice, and physical iPhone access.
