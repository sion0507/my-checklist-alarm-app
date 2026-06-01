# My Checklist Alarm App

Personal iPhone-first checklist alarm PWA.

## Implemented slices

### Issue #2: PWA app shell

Issue #2 implements the initial PWA app shell:

- Vite + React + TypeScript app skeleton
- iPhone-first responsive shell
- Bottom tabs: `오늘`, `캘린더`, `설정`
- Today as the default entry view
- PWA manifest and local service worker foundation
- Unit and smoke test harness

Push notification support is not claimed yet. See the iPhone PWA Web Push feasibility spike for requirements, limitations, and manual verification: [`docs/iphone-pwa-web-push-feasibility.md`](docs/iphone-pwa-web-push-feasibility.md).

### Issue #3: Local task source of truth and Today CRUD

Issue #3 implements the local Today task workflow:

- IndexedDB-backed structured task storage
- Today quick-add using a title only
- Task detail modal fields: title, date, optional time, recurrence, memo, notification on/off
- Today flow edit, delete, and complete actions
- Incomplete tasks shown above completed tasks
- Completed tasks stay visible with checked/de-emphasized styling
- Unit tests for persistence/store behavior and Today workflow coverage

### Issue #9: Seven-day notification schedule planner and sync

Issue #9 derives backend notification jobs from local checklist data while keeping the local task store as source of truth:

- `src/notificationPlanner.ts` builds a next-seven-days schedule containing daily morning jobs, daily evening jobs, and notification-enabled time-specific task occurrence jobs
- Recurring task occurrences use the same projection rules as the UI and skip completed, deleted, moved-away, notification-off, and no-time task occurrences
- `src/scheduleSyncClient.ts` sends only the push subscription endpoint plus derived job metadata to `/api/push/schedule`; local task memo/completion/full records are not sent
- `src/pushBackend.ts` stores scheduled notification records as minimal metadata with `scheduled`/`cancelled`/`completed` state support, and schedule replacement cancels previously active jobs that disappear from the seven-day derived schedule
- App startup and task mutations call reconciliation sync when a push subscription endpoint exists locally

### Issue #8: Minimal free-tier push backend and subscription flow

Issue #8 adds the first Web Push subscription plumbing without copying the local task database to the backend:

- `src/pushBackend.ts` stores/updates only push subscription endpoint/keys plus minimal notification metadata (`timezone`, `userAgent`, reminder times)
- `src/pushHttpApi.ts` exposes free-tier-friendly route behavior for `/api/push/vapid-public-key`, `/api/push/subscriptions`, and `/api/push/test`; `api/push/[action].ts` mounts that handler for serverless-style deployments
- `src/pushClient.ts` requests notification permission, waits for service worker readiness, creates/reuses a Push API subscription with the VAPID public key, syncs the subscription to the backend, and triggers backend test push
- `/service-worker.js` handles `push` events with a minimal `{ title, body, path }` payload and opens/focuses the app route on notification click
- Settings test notification now uses the backend push test path instead of a local `new Notification(...)` shortcut

External push delivery still requires deployment wiring for Web Push sending and durable subscription storage. The checked-in modules are dependency-injected and tested with mocks so a free-tier serverless/KV adapter can provide the sender/store without storing full task data.

## Web Push environment variables/secrets

Copy `.env.example` and provide these values in the deployment environment:

- `VAPID_PUBLIC_KEY`: public application server key returned by `/api/push/vapid-public-key` and used by `PushManager.subscribe(...)`
- `VAPID_PRIVATE_KEY`: private VAPID key used only by the backend sender; never expose it to the frontend
- `VAPID_SUBJECT`: contact subject for Web Push VAPID claims, usually `mailto:...` or an HTTPS URL
- `PUSH_SUBSCRIPTION_STORE_URL` or equivalent platform KV/table binding: durable store for endpoint/keys/minimal metadata only
- `PUSH_TEST_SENDER_ENABLED`: deployment flag for enabling the real test push sender; tests mock this path

## Requirements

- Node.js 20+
- npm 10+

## Commands

Install dependencies:

```bash
npm install
```

Run the app locally:

```bash
npm run dev
```

Run unit tests:

```bash
npm run test
```

Run the app-shell smoke test:

```bash
npm run test:e2e
```

Run all automated tests:

```bash
npm run test:all
```

Create a production build:

```bash
npm run build
```

Preview the production build:

```bash
npm run preview
```

## PWA foundation

The app publishes `/manifest.webmanifest` and registers `/service-worker.js` for a minimal cache-first shell foundation. The service worker also handles Web Push `push` and `notificationclick` events using only minimal notification routing/display payload fields.
