# MVP QA hardening and handoff

Issue: #14 — End-to-end QA hardening and builder handoff docs

This document is the final MVP QA handoff for the personal checklist alarm PWA. It records what is covered automatically, what still requires real iPhone/manual verification, known limitations, and the exact commands Builder/Reviewer should run.

## Automated coverage map

| Area | Coverage | Files |
| --- | --- | --- |
| Recurrence projection | Daily, weekly, monthly recurrence projection; no generated future records; completed/deleted/moved recurring exceptions | `src/taskStore.test.ts`, `src/calendarUtils.test.ts` |
| Schedule planning | Seven-day morning/evening/task schedule generation; recurrence-derived task jobs; completed/deleted/moved/notify-off filtering; default/custom reminder times | `src/notificationPlanner.test.ts`, `src/appScheduleSync.test.tsx`, `src/scheduleSyncClient.test.ts` |
| Today projection/workflow | Quick add, edit, complete, delete, persistence after remount, internal scrolling | `src/todayWorkflow.test.tsx`, `e2e/mvp-workflows.test.tsx` |
| Calendar projection/workflow | 42-day month grid, recurring task pills, overflow, selected-date modal, task creation from calendar, modal layering/focus | `src/calendarUtils.test.ts`, `src/calendarWorkflow.test.tsx`, `e2e/mvp-workflows.test.tsx` |
| Settings defaults/workflow | Default `08:00` morning and `23:00` evening reminders, persistence, notification status, theme settings, recurring task creation from Settings | `src/settingsWorkflow.test.tsx` |
| Evening review | Configured evening window, notification-entry override, stale URL date handling, leave/delete/move actions, schedule resync | `src/eveningReviewWorkflow.test.tsx`, `e2e/mvp-workflows.test.tsx` |
| Notification entry routing | Task notification URL routing to date/task, quick complete/move/delete actions, service worker click URL handling | `src/notificationEntryWorkflow.test.tsx`, `src/serviceWorkerPush.test.ts`, `e2e/mvp-workflows.test.tsx` |
| PWA/deployment shell | Manifest/service worker shell, production build, deployment/HITL notes | `e2e/app-shell.smoke.test.tsx`, `docs/public-deployment-iphone-verification.md` |

## Builder commands

Run from the repository root:

```bash
npm install
npm run test
npm run test:e2e
npm run build
```

Optional local smoke check:

```bash
npm run preview
```

Then open the preview URL in a browser and verify the Today, Calendar, and Settings tabs load.

## Reviewer checklist

1. Confirm `npm run test`, `npm run test:e2e`, and `npm run build` pass from a clean checkout.
2. Review the new E2E coverage in `e2e/mvp-workflows.test.tsx` for the #14 acceptance criteria:
   - add/edit/complete
   - persistence after reload/remount
   - Calendar task creation
   - evening review notification entry
   - task notification entry routing
3. Review this handoff and `docs/public-deployment-iphone-verification.md` for real-device Web Push caveats.
4. Confirm no production code behavior was changed beyond broadening the E2E test script to run all files in `e2e/`.
5. If real iPhone verification is performed, update the manual checklist section below with device/iOS/browser/version/date and observed results.

## Deployment verification

### Public HTTPS deployment prerequisites

- Deploy over public HTTPS. iOS push APIs do not work from an arbitrary non-secure origin.
- Configure Web Push environment variables/secrets documented in `README.md`:
  - `VAPID_PUBLIC_KEY`
  - `VAPID_PRIVATE_KEY`
  - `VAPID_SUBJECT`
  - a durable subscription store binding/URL such as `PUSH_SUBSCRIPTION_STORE_URL`
  - `PUSH_TEST_SENDER_ENABLED` if the deployment intentionally enables real test pushes
- Verify `/manifest.webmanifest` and `/service-worker.js` are served from the deployed origin.
- Confirm the serverless push API routes respond on the deployed origin.

### Smoke path after deploy

1. Open the public HTTPS app URL.
2. Add a Today task, edit it, complete it, reload, and confirm it persists.
3. Open Calendar, select a date, add a task, close/reopen the date, and confirm it remains visible.
4. Open Settings and confirm default reminder times are `08:00` and `23:00` on a fresh profile.
5. If push is configured, request notification permission and send a test notification from Settings.
6. Tap a delivered notification and confirm it routes back to the intended app entry (`entry=notification`, `entry=morning`, or `entry=evening`).

## Manual iPhone checklist

Automated tests cannot prove iOS Home Screen PWA install behavior or real Web Push delivery. Use this checklist on a physical iPhone after a public HTTPS deployment exists.

| Check | Status | Observation |
| --- | --- | --- |
| Open public HTTPS URL in Safari on iPhone | Pending human run | Requires deployed URL and physical iPhone. |
| Add to Home Screen and launch as standalone PWA | Pending human run | Confirm standalone display and bottom tabs. |
| Today add/edit/complete/reload persistence inside Home Screen PWA | Pending human run | Data is local to the browser/PWA storage profile. |
| Calendar date task creation inside Home Screen PWA | Pending human run | Confirm selected-date modal and created task persist. |
| Settings default reminder times on fresh install | Pending human run | Expected: `08:00` morning, `23:00` evening. |
| Notification permission prompt appears only after user action | Pending human run | Trigger from Settings test notification flow. |
| Real Web Push test notification delivery | Pending human run | Requires configured VAPID keys and durable subscription storage. |
| Tapping task notification routes to target date/task | Pending human run | Expected URL path includes date/task query parameters. |
| Tapping evening review notification opens review card for that date | Pending human run | Expected `entry=evening` handling. |
| Offline/reopen behavior after app shell cache is installed | Pending human run | App shell should load; backend push/sync requires network. |

## Known limitations

- **Local data deletion risk:** Task data is stored locally in browser/PWA storage. Clearing Safari website data, deleting the Home Screen app, browser storage eviction, or switching device/browser can remove local checklist data.
- **No paid infrastructure assumed:** The MVP is designed around free-tier/public HTTPS/serverless-style hosting and minimal backend storage. Free-tier cold starts, quotas, cron/scheduler limits, and platform sleep can delay or prevent push delivery.
- **Web Push delivery constraints:** iOS Web Push requires a supported iOS/Safari/Home Screen PWA setup, user permission, valid VAPID configuration, service worker availability, network connectivity, and platform delivery. Delivery time is not guaranteed.
- **Backend stores minimal notification data only:** The backend should store push subscription details and derived job metadata, not the full local task database or private memos.
- **Manual HITL remains required:** Real iPhone install, permission prompt, background delivery, and notification tap routing must be checked manually on the target deployment.
- **No cross-device sync/backup in MVP:** Local tasks do not automatically sync across devices or recover after local storage loss.

## Current blocker record

At handoff time, no code-level blocker is expected for automated tests/build. The remaining blocker is human/device verification: a deployed HTTPS URL and physical iPhone are required to complete the manual checklist observations.
