# My Checklist Alarm App

Personal iPhone-first checklist alarm PWA.

## Current slice

Issue #2 implements the initial PWA app shell:

- Vite + React + TypeScript app skeleton
- iPhone-first responsive shell
- Bottom tabs: `오늘`, `캘린더`, `설정`
- Today as the default entry view
- PWA manifest and local service worker foundation
- Unit and smoke test harness

Push notification support is not claimed yet; that is planned for later issues after the iPhone PWA feasibility spike.

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
