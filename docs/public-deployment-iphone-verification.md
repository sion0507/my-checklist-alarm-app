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
  - `api/push/[action].js` mounts the push HTTP API for Vercel-style serverless deployments.
  - Supported routes are `/api/push/vapid-public-key`, `/api/push/subscriptions`, `/api/push/test`, `/api/push/schedule`, `/api/push/cron`, and `/api/push/status`.
- Backend implementation:
  - `src/pushHttpApi.ts` parses API requests and delegates to the push backend used by automated tests.
  - `src/pushBackend.ts` stores only push subscription endpoint/keys plus minimal metadata and scheduled job records, and can send due scheduled jobs through an injected sender.
  - `api/push/[action].js` configures `web-push` from environment variables and uses Vercel KV / Upstash Redis REST when configured.

## Production storage and scheduler path

The checked-in Vercel adapter now supports a production-oriented durable path for scheduled reminders:

- Configure Vercel KV or Upstash Redis REST using `KV_REST_API_URL` + `KV_REST_API_TOKEN` or `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`.
- Push subscriptions are stored under minimal durable records: endpoint, expiration time, keys, and notification metadata only.
- `/api/push/schedule` stores derived morning, time-specific task, and evening review jobs durably without full local task data.
- `/api/push/cron` remains the scheduled worker endpoint; it requires `CRON_SECRET` auth, reads due scheduled jobs, sends Web Push, and records attempt count, success/failure state, status, error, and timestamps.
- Vercel Hobby cannot deploy a `*/15 * * * *` Vercel Cron entry, so 15-minute scheduled delivery should be driven by an external scheduler such as cron-job.org calling `/api/push/cron`.
- `/api/push/status?endpoint=...` exposes recent job records for smoke/debug inspection without exposing full local task records.

If Redis/KV env vars are absent, the adapter falls back to in-memory storage for local/test-only smoke checks and returns `durable: false`. Do not claim production scheduled delivery in that fallback mode. Real iPhone delivery still requires HITL verification on the deployed public HTTPS app.

## Recommended free-tier deployment target

A practical first target is Vercel because the repo already contains a Vercel-style `api/push/[action].js` route and Vite static build output. Other providers are possible, but will need adapter work:

- Vercel: frontend + serverless API can fit the current file layout. Configure Vercel KV or Upstash Redis REST for durable scheduled reminder state. On Hobby, do not configure a 15-minute Vercel Cron because Hobby accounts are limited to daily cron jobs.
- External scheduler: use cron-job.org or an equivalent service to call `/api/push/cron` every 15 minutes with the `Authorization: Bearer <CRON_SECRET>` header.
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
4. `PUSH_SENDER_ENABLED=true` (or the existing `PUSH_TEST_SENDER_ENABLED=true`) once the sender should send real pushes.
5. Durable storage env vars for Vercel KV / Upstash Redis REST:
   - `KV_REST_API_URL` and `KV_REST_API_TOKEN`, or
   - `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`.
6. Required `CRON_SECRET` for `/api/push/cron`; invoke manual checks with either an Authorization bearer header or the `secret` query parameter. Do not rely on `x-vercel-cron` alone.
7. Real iPhone on iOS 16.4+ for manual Home Screen PWA verification.

Use `.env.example` as the non-secret template. Never commit real secret values.

## External scheduler setup for Vercel Hobby

Vercel Hobby preview/production deployments cannot use a 15-minute Vercel Cron entry such as `*/15 * * * *`; Hobby cron schedules are limited to daily jobs. Keep `vercel.json` free of the `crons` block for this app and run scheduled delivery through an external scheduler instead.

Recommended free option: cron-job.org.

1. Create a cron-job.org job for the deployed app.
2. Set the schedule to every 15 minutes:

   ```text
   */15 * * * *
   ```

3. Set the request URL to the deployment cron endpoint:

   ```text
   https://<deployment-url>/api/push/cron
   ```

4. Configure the request method as `GET`.
5. Configure the preferred authentication header:

   ```text
   Authorization: Bearer <CRON_SECRET>
   ```

6. Optional fallback for services that cannot set headers: include the secret as a query parameter instead. Prefer the header form when possible because it avoids putting the secret in URLs and logs.

   ```text
   https://<deployment-url>/api/push/cron?secret=<CRON_SECRET>
   ```

7. After deployment, verify cron-job.org execution history shows successful authorized runs and cross-check `/api/push/status?endpoint=...` for due job attempts.

## Pre-deployment checklist

- [ ] `npm install` completed.
- [ ] `npm run test:all` passes.
- [ ] `npm run build` passes.
- [ ] `dist/manifest.webmanifest` exists after build.
- [ ] `dist/service-worker.js` exists after build.
- [ ] Production environment variables are configured in the hosting provider, not committed.
- [ ] Public HTTPS URL is known.
- [ ] `/api/push/vapid-public-key` returns the configured public VAPID key over HTTPS.
- [ ] Durable subscription/schedule storage is configured (`/api/push/schedule` returns `durable: true`).
- [ ] Scheduler is configured through an external service such as cron-job.org (`*/15 * * * *` calling `/api/push/cron` with `CRON_SECRET`; execution history shows authorized invocations).

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
- If KV/Redis env vars are missing, the API adapter falls back to non-durable in-memory storage and scheduled reminders must be treated as test-only/unverified.
- Web Push cannot provide a custom alarm sound/song; it uses system/browser notification behavior.

## Test-only Vercel deployment for Issue #13

- Production URL: https://my-checklist-alarm-app.vercel.app
- Hosting target: Vercel free-tier project `my-checklist-alarm-app`.
- Production env configured in Vercel, not committed:
  - `VAPID_PUBLIC_KEY`
  - `VAPID_PRIVATE_KEY`
  - `VAPID_SUBJECT=mailto:sionbang91@gmail.com`
  - `PUSH_TEST_SENDER_ENABLED=true`
- Automated smoke checks recorded by Hermes:
  - `/` returned `200` over HTTPS.
  - `/manifest.webmanifest` returned `200` and declares `display: "standalone"`.
  - `/service-worker.js` returned `200` and contains `push`/`notificationclick` handlers.
  - `/api/push/vapid-public-key` returned `200` with a non-empty public key.
- Scope: this is a **test-only** deployment for Home Screen PWA and immediate Web Push verification. Scheduled reminder delivery remains unverified until durable storage and scheduler work is implemented.
- Follow-up issue for durable production scheduling: #27.

## HITL status for this branch

Automated build/test checks for the #27 branch can verify durable storage code paths and cron endpoint authorization, but production HITL remains open until the deployed environment has `CRON_SECRET`, VAPID, KV/Redis REST credentials, sender enablement, cron-job.org execution history for `/api/push/cron`, and real iPhone Home Screen PWA receipt of morning, time-specific, and evening scheduled pushes.
