# PRD: Personal Checklist Alarm PWA

## Problem Statement

The user frequently forgets daily tasks and time-sensitive todos, especially when relying only on memory or ordinary checklist apps. The desired product is not a generic todo app. It must behave like a personal reminder assistant on iPhone: show what needs to be done today, ask whether anything else should be recorded, send real system push notifications for time-specific tasks, and help clean up unfinished work at night.

The central risk is notification delivery. The primary success criterion is that reminders arrive as real iPhone lock screen/system notifications from a Home Screen-installed PWA. An app-only reminder that works only while the page is open does not satisfy the goal.

## Solution

Build a personal iPhone-first PWA for one user. The app stores the user's actual checklist data locally in the browser, while using a minimal free-tier cloud backend only for Web Push subscription and scheduled notification metadata. The product should let the user add dated tasks, optionally assign times, define daily/weekly/monthly recurrence, receive morning and task-time reminders, and review unfinished items every night.

The app opens to a Today screen focused on immediate execution. A Calendar tab shows a month grid based on the provided reference image, with task pills inside each date cell and swipe navigation between months. A Settings tab controls reminder times, notification permission state, and test notifications.

Because the user does not want paid hosting, the backend must target free cloud infrastructure. The system should attempt timely delivery, but explicitly acknowledge that free-tier scheduling, iOS, network, and Web Push constraints can still cause delays or missed notifications.

## User Stories

1. As the primary user, I want to install the app on my iPhone Home Screen, so that it behaves like a phone app.
2. As the primary user, I want real iPhone system notifications, so that I can be reminded even when the app is closed or the phone is locked.
3. As the primary user, I want the app to open to today's tasks, so that I immediately see what I need to do.
4. As the primary user, I want to add a task quickly from the Today screen, so that capturing a thought takes minimal effort.
5. As the primary user, I want a detailed task modal, so that I can set date, time, recurrence, memo, and notification behavior when needed.
6. As the primary user, I want each task to have a required title, so that every item is identifiable.
7. As the primary user, I want each task to have a required date, so that it appears on the correct day.
8. As the primary user, I want tasks to optionally have a time, so that time-sensitive tasks can trigger reminders.
9. As the primary user, I want tasks to optionally have a memo, so that I can store supporting details.
10. As the primary user, I want each task to have notification on/off, so that I can decide which tasks should alert me.
11. As the primary user, I want to mark tasks complete, so that I can track what is already done.
12. As the primary user, I want incomplete tasks to appear above completed tasks, so that unfinished work stays visible.
13. As the primary user, I want completed tasks to remain visible but visually de-emphasized, so that I can confirm what I finished without cluttering the main list.
14. As the primary user, I want to edit tasks, so that I can fix dates, times, titles, recurrence, or memo text.
15. As the primary user, I want to delete tasks, so that irrelevant items can be removed.
16. As the primary user, I want daily recurring tasks, so that repeated daily obligations appear automatically.
17. As the primary user, I want weekly recurring tasks, so that weekly routines appear automatically.
18. As the primary user, I want monthly recurring tasks, so that monthly obligations appear automatically.
19. As the primary user, I want completing a recurring task to affect only that day's occurrence by default, so that future occurrences are not accidentally removed.
20. As the primary user, I want deleting or moving a recurring task occurrence to affect only that date by default, so that I do not accidentally delete the whole recurrence.
21. As the primary user, I want a separate action to edit or delete the entire recurring rule, so that I can intentionally change the whole series.
22. As the primary user, I want an 08:00 default morning check-in notification, so that the app starts my day by reminding me what is planned.
23. As the primary user, I want the morning reminder time to be configurable, so that it can match my wake-up routine.
24. As the primary user, I want the morning check-in card to appear even if the push notification was missed, so that the workflow is available whenever I open the app.
25. As the primary user, I want to dismiss or complete the morning check-in once per day, so that it does not keep taking space after I handle it.
26. As the primary user, I want the morning check-in to summarize today's tasks, so that I know what is ahead.
27. As the primary user, I want the morning check-in to ask whether I have anything else to add, so that I can capture tasks before the day starts.
28. As the primary user, I want time-specific tasks to send a reminder at their scheduled time, so that I do not miss appointments or actions.
29. As the primary user, I want tapping a notification to open the related task, so that I can act on the reminder immediately.
30. As the primary user, I want the related task to be visually highlighted after notification entry, so that I know what the notification was about.
31. As the primary user, I want notification-entry quick actions for complete, delete, and move to another date, so that I can resolve reminders quickly.
32. As the primary user, I want a default 23:00 evening unfinished-task review, so that I clean up leftover tasks before the day ends.
33. As the primary user, I want the evening review time to be configurable, so that it can match my schedule.
34. As the primary user, I want the evening push notification to be sent only when unfinished tasks exist, so that I am not bothered unnecessarily.
35. As the primary user, I want the evening review card to appear in the app daily, so that I can see either unfinished tasks or a completion message.
36. As the primary user, I want the evening review to show unfinished tasks, so that I can decide what to do with each one.
37. As the primary user, I want to delete unfinished tasks from the evening review, so that no-longer-relevant work disappears.
38. As the primary user, I want to move unfinished tasks to another date from the evening review, so that postponed work is rescheduled.
39. As the primary user, I want to leave an unfinished task unchanged, so that I can decide later if needed.
40. As the primary user, I want a message when all tasks are complete, so that the evening review feels finished.
41. As the primary user, I want a monthly calendar view, so that I can see how tasks are distributed across the month.
42. As the primary user, I want the Calendar tab to resemble the provided iPhone calendar reference image, so that it feels familiar and visually clear.
43. As the primary user, I want a large month title on the calendar, so that I always know which month I am viewing.
44. As the primary user, I want a year/month picker, so that I can jump to a specific month.
45. As the primary user, I want to swipe left and right between months, so that moving across months is fast on iPhone.
46. As the primary user, I want task pills inside each calendar date cell, so that I can see scheduled work without opening each date.
47. As the primary user, I want timed tasks in the calendar to show a time prefix, so that time-sensitive tasks stand out.
48. As the primary user, I want long task titles in calendar pills to truncate cleanly, so that the month grid stays readable.
49. As the primary user, I want dates with many tasks to show a more indicator, so that the layout remains compact.
50. As the primary user, I want tapping a date to show that date's tasks and allow adding a task for that date, so that calendar navigation supports task management.
51. As the primary user, I want tapping a task pill to open the task detail/edit flow, so that I can update it quickly.
52. As the primary user, I want today, weekends, previous/next month dates, and holidays/anniversaries to be visually distinct, so that the calendar is easy to scan.
53. As the primary user, I want settings for morning and evening reminder times, so that reminder timing is under my control.
54. As the primary user, I want to see notification permission status, so that I know whether push can work.
55. As the primary user, I want a test notification button, so that I can verify my iPhone is receiving notifications.
56. As the primary user, I want data to persist after refresh, so that my checklist survives normal app use.
57. As the primary user, I want task data stored locally first, so that my actual checklist is not dependent on a full cloud account system.
58. As the primary user, I want the server to store only minimal notification metadata, so that private task data stays mostly local.
59. As the primary user, I want the app to sync notification schedules after task changes, so that reminders match the current local tasks.
60. As the primary user, I want the app to resync upcoming notifications on startup, so that missed schedule updates are repaired.
61. As the primary user, I want upcoming notifications scheduled for the next seven days, so that recurring and near-future reminders work while keeping free-tier usage small.
62. As the primary user, I want custom alarm sound/song feasibility checked, so that I know whether the PWA can support wake-up-style alerts.
63. As the primary user, I want unsupported sound features hidden or marked limited, so that the app does not promise what iOS PWA cannot do.
64. As the primary user, I want the app to avoid paid infrastructure, so that there are no recurring costs.
65. As the primary user, I want explicit warning about local data loss risk, so that I understand what happens if browser/PWA storage is deleted.
66. As a future builder, I want clear acceptance criteria for iPhone manual testing, so that notification claims are verified on a real device.
67. As a future builder, I want isolated tests for recurrence and schedule generation, so that date and reminder logic is reliable.
68. As a future reviewer, I want the implementation to distinguish local source-of-truth data from server notification metadata, so that architecture stays aligned with the product constraints.

## Implementation Decisions

- Build an iPhone-first PWA with Home Screen installation support, manifest, and service worker.
- The app's primary navigation has three bottom tabs: Today, Calendar, and Settings.
- The default entry screen is Today, not Calendar, because the core job is showing what must be done now.
- The Calendar tab is a core secondary screen for month-level planning and uses the provided iPhone calendar reference image as its visual baseline.
- The app should use local browser storage as the source of truth for user checklist data.
- Store lightweight settings such as reminder times in localStorage.
- Store structured data such as tasks, recurrence exceptions, and schedule-sync state in IndexedDB.
- Use a minimal backend only for Web Push subscription management and scheduled notification metadata.
- Do not build a full account system, multi-device synchronization, or cloud task database in MVP.
- Backend notification metadata may include notification id, scheduled send time, short title/message, notification type, and completion/cancellation status.
- The backend must target free-tier cloud infrastructure. No paid hosting is allowed for MVP.
- The system should not rely on the user's notebook or local machine being powered on.
- The scheduler should maintain upcoming notification jobs for approximately the next seven days.
- On task create/update/delete/complete, the app should sync affected notification schedules immediately.
- On app startup, the app should resync upcoming notification schedules to reduce drift or missed updates.
- The Web Push feasibility spike is the first implementation phase because notification delivery is the highest project risk.
- The feasibility spike must check iOS PWA requirements, Home Screen installation requirements, Push API/service worker support, backend scheduling needs, and custom sound/song support.
- Custom notification sound/song support is conditional. If iOS PWA does not allow it, MVP should exclude it or display the limitation clearly.
- Task detail modal fields include title, date, optional time, recurrence, optional memo, and notification on/off.
- Today quick-add accepts a title and creates a task for today immediately. More fields are handled in the detail modal.
- Calendar date selection opens an add/detail flow defaulting to the selected date.
- Today screen shows incomplete and completed tasks together, sorted so incomplete tasks appear above completed ones.
- Completed tasks should remain visible but visually de-emphasized with a checked/faded style.
- Recurrence is represented as a source rule plus date-specific exceptions rather than eagerly generating every future instance.
- Daily, weekly, and monthly recurrence are included in MVP.
- Completing, deleting, or moving a recurring task defaults to affecting only that date's occurrence.
- Editing or deleting the entire recurrence rule is available as a separate explicit action in the task detail flow.
- Morning check-in default reminder time is 08:00 and is configurable.
- Morning check-in card appears daily regardless of whether the push notification was received.
- Once the user marks the morning check-in done for the day, it should collapse or hide until the next day.
- Time-specific reminders open the app with the related task highlighted and offer quick actions: complete, delete, move to another date.
- Evening review default reminder time is 23:00 and is configurable.
- Evening push notification is sent only if unfinished tasks exist.
- Evening review card appears daily in the app; when there are no unfinished tasks, it shows a completion message.
- Evening review supports per-task delete, move to another date, and leave unchanged.
- Calendar visual decisions: large month title, right-side rounded action pill, optional summary card area, weekday header in Sunday-to-Saturday order, seven-column grid, weekend coloring, faded adjacent-month dates, highlighted today, and task pill badges in date cells.
- Calendar task pill decisions: pale blue background, blue left accent, gray-blue text, optional time prefix, one-line ellipsis, and +N/more indicator for overflow.
- Manual backup/restore is out of MVP, but the app must acknowledge local storage deletion risk. JSON import/export is a follow-up candidate.

Proposed deep modules to keep testable:

- Local task store: encapsulates IndexedDB persistence, task CRUD, recurrence exception persistence, and storage migrations behind a stable interface.
- Settings store: encapsulates localStorage-backed settings such as reminder times and notification preferences.
- Recurrence engine: computes visible occurrences for a date range from source rules plus exceptions.
- Today projection: builds the ordered Today view, including incomplete-first sorting and completed-item styling state.
- Calendar projection: builds month grid cells, adjacent-month dates, task pills, overflow counts, and date selection data.
- Notification schedule planner: converts local tasks/settings into the next seven days of notification jobs.
- Push client: handles permission state, subscription creation, service worker registration, and test notifications.
- Scheduler API client: syncs scheduled notification metadata with the backend and cancels/upserts jobs after local changes.
- Backend subscription/schedule service: stores push subscriptions and minimal schedule records, then sends Web Push notifications when due.
- Notification entry router: maps notification payloads to the right app screen, highlighted task, and quick actions.

## Testing Decisions

- Tests should assert external behavior and user-visible outcomes, not component internals or private implementation details.
- Recurrence engine requires unit tests for daily, weekly, monthly recurrence, skipped/deleted occurrence exceptions, completed occurrence exceptions, moved occurrence exceptions, and date-range boundaries.
- Notification schedule planner requires unit tests for morning check-in jobs, evening review jobs, time-specific task jobs, notification on/off behavior, completed/cancelled task exclusion, and seven-day scheduling horizon.
- Today projection requires unit tests proving incomplete tasks appear before completed tasks while completed tasks remain visible.
- Calendar projection requires unit tests for month grid generation, previous/next month filler dates, weekend coloring metadata, today metadata, task pill overflow, and date selection defaults.
- Local task store should have integration tests or mocked IndexedDB tests verifying persistence across reload-like initialization.
- Settings store should have tests verifying default 08:00 morning time, default 23:00 evening time, and user updates.
- Push client and scheduler API client should be tested around API contracts and error handling, using mocks for browser Push APIs and network calls.
- E2E tests should cover adding a task from Today, editing details, marking complete, seeing incomplete-first ordering, navigating Calendar, adding a task from a calendar date, and seeing persistence after reload.
- E2E tests should cover the evening review flow for delete and move-to-date actions.
- E2E tests should cover notification-entry routing using simulated notification payloads where browser automation permits it.
- Manual iPhone checklist is required for PWA install, notification permission request, test notification receipt, Home Screen launch behavior, service worker behavior, and real Web Push delivery from a public HTTPS deployment.
- Manual iPhone checklist must explicitly record whether custom notification sound/song is supported or not supported.
- Free-tier scheduler behavior should be tested with short-interval test reminders before relying on morning/evening times.

## Out of Scope

- Login and signup.
- Multi-user support.
- Collaboration or shared todos.
- Full server-side task database or server account synchronization.
- Paid hosting or paid scheduler infrastructure for MVP.
- Native iOS App Store app.
- Calendar integrations such as Apple Calendar, Google Calendar, Notion, or Google Sheets.
- Advanced project management features such as tags, priority systems, Kanban, analytics, or dashboards.
- Manual backup/restore in MVP.
- Guaranteed alarm-clock-level delivery timing. The backend will attempt timely Web Push delivery, but iOS, network, and free-tier limitations may delay or prevent delivery.
- Custom notification songs/sounds if iOS PWA does not support them.

## Further Notes

- The project currently contains planning documents only; no application implementation exists yet.
- The GitHub repository is `sion0507/my-checklist-alarm-app`.
- Issues should be created as vertical slices after this PRD is approved/published.
- The highest-risk slice is not UI; it is proving that iPhone Home Screen PWA Web Push can deliver the required lock screen/system notifications.
- The implementation should prefer small, independently reviewable slices that preserve the separation between local checklist source-of-truth and minimal server-side push scheduling metadata.
