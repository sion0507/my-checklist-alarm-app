# iPhone PWA Web Push feasibility spike

Issue: #7 `iPhone PWA Web Push feasibility spike`

## Executive verdict

| Question | Status | Product implication |
| --- | --- | --- |
| Real iPhone lock screen/system notifications from a PWA | **Supported with constraints** | Requires iOS/iPadOS 16.4+, install to Home Screen, user permission from a direct gesture, service worker, Push API subscription, and a backend push sender. |
| App-only/local reminder UI inside the app | **Supported** | Can be implemented with local storage/state while the app is open, but it is not a reliable lock screen/system alarm. |
| Scheduled delivery at 08:00/23:00 without a backend | **Unsupported for real push** | The browser/PWA cannot wake itself at future times to send push. A backend scheduler must send Web Push messages at the desired times. |
| Custom notification sound/song for Web Push | **Unsupported based on current web API surface** | Web notification options can request silent/default behavior but do not expose a custom sound/song field. Treat custom alarm songs as out of scope for Web Push unless a later native wrapper or platform-specific evidence changes this. |
| Free-tier scheduled delivery | **Product risk** | Free-tier hosting/schedulers can sleep, throttle, miss cron windows, or have execution limits; reminders need monitoring and explicit SLA expectations. |

## Evidence and sources

1. **WebKit: Web Push for Home Screen web apps on iOS/iPadOS 16.4**  
   Source: <https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/>  
   Evidence used:
   - WebKit says iOS/iPadOS 16.4 adds Web Push support for **Home Screen web apps**.
   - Web Push uses **Push API, Notifications API, and Service Workers** together.
   - A web app **added to the Home Screen** can request notification permission if the request is in response to **direct user interaction**.
   - Notifications integrate with iOS notification management and Focus.
   - iOS/iPadOS 16.4 Home Screen web apps also support the Badging API.

2. **WebKit: Meet Web Push**  
   Source: <https://webkit.org/blog/12945/meet-web-push/>  
   Evidence used:
   - Web Push is intended for time-sensitive/high-priority events even when the site is not open.
   - It is based on W3C Push API, Notifications API, and Service Workers.
   - Requesting a push subscription requires an explicit user gesture.
   - Push is not intended as silent background runtime; `userVisibleOnly` must be true and a push message must show a notification.

3. **MDN: Push API**  
   Source: <https://developer.mozilla.org/en-US/docs/Web/API/Push_API>  
   Evidence used:
   - Receiving push messages requires an active service worker.
   - The service worker subscribes with `PushManager.subscribe()`.
   - The app must protect subscription endpoints from CSRF/XSRF.

4. **MDN: `ServiceWorkerRegistration.showNotification()` and `Notification()` options**  
   Sources:
   - <https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerRegistration/showNotification>
   - <https://developer.mozilla.org/en-US/docs/Web/API/Notification/Notification>
   Evidence used:
   - Notification options include fields such as `body`, `icon`, `badge`, `data`, `actions`, `tag`, `renotify`, `requireInteraction`, `silent`, `timestamp`, and `vibrate` where supported.
   - `silent` controls whether sounds/vibrations are issued, and `null` means device defaults; there is no documented `sound` or custom audio/song option in the web notification options.

## Requirements for real iPhone Web Push

A later deployment slice should only claim iPhone lock screen/system notifications when all of these are true:

- **iOS/iPadOS version:** target device is on iOS/iPadOS **16.4 or newer**.
- **Installed PWA:** user opens the app from an icon added via **Add to Home Screen**. Normal Safari tabs are not enough for iOS Home Screen web app push support.
- **Manifest:** production app serves a valid web app manifest with stable identity fields. Include/keep a stable `id` where possible because WebKit documents Manifest ID support for Home Screen web apps.
- **Service worker:** production origin serves and registers a service worker. The worker must handle push events and display a notification via `showNotification()`.
- **Permission UX:** the app asks for notification permission only after a direct user action, such as tapping an enable/reminder button.
- **Push subscription:** client code calls `registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })` after service worker readiness and permission.
- **Secure context:** production must be served over HTTPS, except local development exceptions supported by browsers.
- **Backend:** server stores push subscriptions and sends encrypted Web Push messages to the browser push service.

## App-only/local notifications vs real Web Push

### App-only/local reminder behavior

This app can locally store reminder preferences (`08:00`, `23:00`) and show status/test UI. It can also display UI feedback while the app is open. That is useful for settings and onboarding, but it should not be marketed as an alarm.

Limitations:

- Not reliable when the PWA is closed or the device is locked.
- Cannot schedule future lock-screen delivery by itself.
- Cannot wake the PWA at 08:00/23:00 without a push event from a server.

### Real Web Push lock screen/system notifications

Real Web Push is the path for lock screen/system notifications. It requires:

1. Client obtains permission and a push subscription.
2. Backend stores subscription details securely.
3. Backend scheduler decides when each reminder is due.
4. Backend sends a Web Push payload to the subscription endpoint.
5. Service worker receives the push event and calls `showNotification()`.
6. iOS displays the notification through the system notification stack if permission and Focus settings allow it.

## Backend responsibilities for scheduled delivery

A deployment/backend slice must implement at least:

- **Subscription API:** create/update/delete push subscriptions per user/device.
- **Security:** authenticate subscription writes when auth exists; protect unauthenticated endpoints from CSRF/XSRF and abuse.
- **VAPID keys:** generate/manage VAPID public/private keys and expose only the public key to the client.
- **Scheduler:** calculate due reminders by timezone and user settings (`morningTime`, `eveningTime`) and enqueue deliveries.
- **Sender:** send Web Push messages using the stored endpoint + keys.
- **Retry and expiry handling:** handle transient send failures; delete subscriptions that return gone/expired responses.
- **Observability:** record scheduled time, attempted time, push service response, and failures.
- **Preference sync:** keep backend reminder settings aligned with local/client settings once accounts or sync exist.

## Custom notification sound/song feasibility

Status: **unsupported** for Web Push in this app slice.

Rationale:

- The Web Notifications API options documented by MDN include `silent`, but no custom `sound`, audio URL, or song option.
- `silent: false`/`null` only allows the device/browser default notification behavior; it does not select a custom sound.
- WebKit’s iOS Home Screen Web Push announcement describes standard Web Push/Notifications API support and does not document any iOS-specific custom sound extension for web apps.

Implementation guidance:

- Do not promise a custom alarm song for PWA Web Push.
- Product copy should say notifications use the user’s system/browser notification sound and Focus settings.
- If custom audio is a hard requirement, evaluate alternatives later: native iOS app, native wrapper with APNs notification sound support, or in-app audio that only plays while the app is open and allowed by browser media policies.

## Manual iPhone verification checklist for deployment slice

Use this checklist after the app is deployed over HTTPS and backend Web Push is available.

### Device/app setup

- [ ] Device is iPhone on iOS 16.4+.
- [ ] App URL loads over HTTPS.
- [ ] Safari can add the app to Home Screen.
- [ ] Home Screen icon launches in standalone PWA mode, not a normal Safari tab.
- [ ] Service worker is registered in the installed app context.

### Permission and subscription

- [ ] Settings tab shows notification status before enabling.
- [ ] Tapping the enable/test control triggers the iOS notification permission prompt from a direct user gesture.
- [ ] Allowing permission changes app status to allowed/granted.
- [ ] A push subscription is created and sent to the backend.
- [ ] Denying permission is shown clearly and does not crash the app.

### Delivery

- [ ] Backend can send an immediate test Web Push to the subscription.
- [ ] Notification appears while the app is closed.
- [ ] Notification appears on the lock screen when device settings allow it.
- [ ] Tapping notification opens the Home Screen PWA and routes to the expected app screen.
- [ ] Focus/Do Not Disturb behavior is documented and matches iOS settings.

### Scheduling

- [ ] Morning reminder is delivered near the configured morning time.
- [ ] Evening review is delivered near the configured evening time.
- [ ] Timezone changes are handled or explicitly documented.
- [ ] Missed/late delivery is logged by the backend.

### Negative/edge cases

- [ ] Removing notification permission prevents future notifications and UI reflects this.
- [ ] Deleting/reinstalling the Home Screen app invalidates or refreshes subscription state.
- [ ] Clearing browser/PWA storage shows the expected local data loss implications.
- [ ] Expired subscriptions are removed or repaired on next app launch.

## Free-tier scheduling and delivery limitations

Product risk: **high until measured on chosen hosting provider**.

Risks to document before promising alarm-like behavior:

- Free-tier serverless/cron jobs may have minimum interval limits, cold starts, execution timeouts, sleep after inactivity, or monthly quota caps.
- Scheduled jobs may drift by minutes and are not guaranteed at exact wall-clock time.
- Push service delivery itself is best-effort and may be delayed by network, device power state, Focus, notification settings, or OS policy.
- Multi-timezone scheduling requires precise user timezone storage and daylight-saving handling.
- Without monitoring, failed cron runs or expired push subscriptions can silently drop reminders.

Recommendation:

- Position reminders as best-effort until backend provider limits are verified.
- Add delivery logs and a visible “last test notification” or “last successful reminder” diagnostic before broad use.
- Pick a scheduler/provider with acceptable cron reliability for the desired reminder SLA, or explicitly state free-tier limitations in product docs.

## Follow-up implementation slices

1. Add production Push API client flow: permission, service worker readiness, subscription creation, and backend sync.
2. Implement backend subscription storage and VAPID Web Push sender.
3. Implement scheduler for morning/evening reminders with timezone support.
4. Run the manual iPhone verification checklist on real hardware.
5. Update product copy based on actual provider delivery latency and iPhone behavior.
