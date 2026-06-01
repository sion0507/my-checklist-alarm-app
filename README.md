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

The app publishes `/manifest.webmanifest` and registers `/service-worker.js` for a minimal cache-first shell foundation. The service worker intentionally does not include Web Push handlers yet.
