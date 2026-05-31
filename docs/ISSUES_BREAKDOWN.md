# Implementation Issues Breakdown

Parent PRD: #1 https://github.com/sion0507/my-checklist-alarm-app/issues/1

## #2 PWA app shell, navigation, and test harness

- Type: AFK
- URL: https://github.com/sion0507/my-checklist-alarm-app/issues/2
- Blocked by: None - can start immediately
- User stories: 1, 3, 66

Create the initial iPhone-first PWA skeleton and make it demoable as a Home Screen-style app shell. The app should have the primary bottom navigation for Today, Calendar, and Settings, plus a minimal service worker/manifest foundation and test/build harness that future slices can extend.

## #3 Local task source of truth with Today quick-add CRUD

- Type: AFK
- URL: https://github.com/sion0507/my-checklist-alarm-app/issues/3
- Blocked by: #2
- User stories: 3-15, 56-57

Implement the local checklist source of truth and the Today task workflow end to end. The user can quickly add a task for today, open a detail modal for date/time/recurrence/memo/notification fields, edit and delete tasks, mark tasks complete, and reload without losing data.

## #4 Recurring tasks with per-date exceptions

- Type: AFK
- URL: https://github.com/sion0507/my-checklist-alarm-app/issues/4
- Blocked by: #3
- User stories: 16-21, 67

Add recurrence as source rules plus per-date exceptions. Daily, weekly, and monthly recurring tasks should appear in the Today projection without pre-generating large numbers of future records. Completion, deletion, and moving should default to the selected occurrence only, while whole-series edit/delete remains explicit.

## #5 Calendar month view from reference image

- Type: AFK
- URL: https://github.com/sion0507/my-checklist-alarm-app/issues/5
- Blocked by: #3, #4
- User stories: 41-52

Build the Calendar tab as a month view based on the provided iPhone calendar reference image. The calendar should show a large month title, seven-column month grid, date styling, task pills in each date cell, overflow handling, date selection, task detail entry, swipe month navigation, and year/month jumping.

## #6 Settings screen for reminders and notification status

- Type: AFK
- URL: https://github.com/sion0507/my-checklist-alarm-app/issues/6
- Blocked by: #2
- User stories: 23, 33, 53-55, 65

Implement the Settings tab for local reminder preferences and notification readiness. The user can change morning and evening reminder times, see notification permission status, access a test-notification control surface, and read the local data loss warning.

## #7 iPhone PWA Web Push feasibility spike

- Type: HITL
- URL: https://github.com/sion0507/my-checklist-alarm-app/issues/7
- Blocked by: #2, #6
- User stories: 1-2, 55, 62-64, 66

Perform and document the critical feasibility spike for real iPhone Home Screen PWA Web Push. The result should clearly state what is possible, what requires HTTPS/public deployment, what the free-tier backend must do, and whether custom notification sound/song is supported.

## #8 Minimal free-tier push backend and subscription flow

- Type: AFK
- URL: https://github.com/sion0507/my-checklist-alarm-app/issues/8
- Blocked by: #7
- User stories: 2, 54-55, 58, 64

Implement the minimal backend and frontend subscription flow needed for Web Push. The app should request permission, create/register a push subscription, send it to the backend, and trigger a test push through a free-tier-compatible service path. The backend stores only subscription and minimal notification metadata.

## #9 Seven-day notification schedule planner and sync

- Type: AFK
- URL: https://github.com/sion0507/my-checklist-alarm-app/issues/9
- Blocked by: #4, #6, #8
- User stories: 59-61, 67-68

Create the local notification schedule planner and sync client that converts local tasks/settings into the next seven days of backend notification jobs. Local checklist data remains source of truth; backend jobs are upserted/cancelled as derived metadata.

## #10 Morning check-in workflow

- Type: AFK
- URL: https://github.com/sion0507/my-checklist-alarm-app/issues/10
- Blocked by: #3, #9
- User stories: 22-27

Implement the morning check-in experience from scheduled notification through Today screen card. The user receives/has a scheduled morning reminder, sees a daily card regardless of whether push was received, reviews today tasks, can quick-add more, and can mark the check-in done for the day.

## #11 Time-specific task reminders and notification-entry actions

- Type: AFK
- URL: https://github.com/sion0507/my-checklist-alarm-app/issues/11
- Blocked by: #3, #9
- User stories: 28-31

Implement time-specific reminders for tasks with a time and notifications enabled. When the user taps a notification, the app routes to the related task, highlights it, and provides quick actions for complete, delete, and move to another date.

## #12 Evening unfinished-task review workflow

- Type: AFK
- URL: https://github.com/sion0507/my-checklist-alarm-app/issues/12
- Blocked by: #3, #9
- User stories: 32-40

Implement the 23:00 default evening unfinished-task review. Push notifications are sent only if unfinished tasks exist; the in-app evening review card appears daily and lets the user delete, move, or leave unfinished tasks, with a completion message when none remain.

## #13 Public free deployment and iPhone manual verification

- Type: HITL
- URL: https://github.com/sion0507/my-checklist-alarm-app/issues/13
- Blocked by: #8, #10, #11, #12
- User stories: 1-2, 55, 62-66

Deploy the PWA and minimal push backend to free-tier public HTTPS infrastructure and run the manual iPhone verification checklist. This validates the core promise: real lock screen/system push notifications from a Home Screen-installed PWA, within the documented free-tier limitations.

## #14 End-to-end QA hardening and builder handoff docs

- Type: AFK
- URL: https://github.com/sion0507/my-checklist-alarm-app/issues/14
- Blocked by: #5, #10, #11, #12, #13
- User stories: 66-68

Close the MVP implementation with QA hardening and handoff documentation. Fill gaps in unit, integration, E2E, and manual test coverage; document known limitations and the builder/reviewer completion checklist.
