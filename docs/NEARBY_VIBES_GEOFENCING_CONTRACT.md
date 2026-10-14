# Nearby Vibes geofencing contract

Backend contract for notifying a user when they enter an active Vibe Note's radius, then opening that note in the app's reveal card.

## Current app contract

Verified in this repository:

- `POST /vibe-notes` creates a note with `body`, `lat`, `lng`, optional `radiusMeters`, and optional `expiresInMinutes`. The app has a 280-character input limit; the server clamps lifetime to the user's plan.
- `GET /vibe-notes/nearby` returns active nearby notes. Outside a note's radius it returns `preview`, not `body`.
- `POST /vibe-notes/:noteId/open` marks a note opened and returns the note, subject to server access rules.
- `DELETE /vibe-notes/:noteId` deletes an owned note.
- The backend currently accepts `POST /me/location` with `{lat, lng}`. The app keeps foreground location one-shot and now optionally registers native OS note regions; it does not run continuous background tracking. Geofence entry sends one fresh fix and entered note IDs.
- `VIBE_NOTE_NEARBY` is a recognized notification type. `noteId` resolves to a `vibeNote` target. Push data values are strings.

The existing backend endpoint shapes above were inspected in the app. The app now has the opt-in and native registration path, but the new preference/candidate routes and geofence-triggered notification producer are backend work described below. Do not deploy the app alert toggle until those backend routes are available.

## Closed-app research and recommendation

The backend cannot observe a device moving after its last location upload. Push messages also cannot make the backend read the device GPS. For alerts while Hiva is not open, the phone OS must detect a region transition and wake the app (or display a local notification). The recommended design is **OS geofencing with a one-shot location upload on entry**, not continuous background tracking:

1. The user explicitly enables Nearby Vibe alerts and grants the platform's required location access.
2. While Hiva is active, it refreshes a bounded list of eligible Vibe Note regions and reconciles those regions with the OS.
3. On an OS `ENTER` event, native code requests a fresh location fix and submits it to authenticated `POST /me/location` with optional `accuracyMeters`, `observedAt`, `source: "vibe_note_geofence"`, and the entered note IDs. It does not send note text.
4. The API validates the fix, evaluates active notes, and creates one deduped notification row and remote push through the existing notification path.
5. On push tap, Hiva opens Nearby and refreshes the location before calling `/vibe-notes/:noteId/open`; `/open` remains authoritative and reveals nothing if access has expired or been revoked.

This uses a device geofence only as a wake-up signal. The backend still checks range, freshness, expiry, blocks, visibility, and dedupe before notifying. Do not send periodic location updates while the app is closed. If the background request cannot reach the API, the remote notification may be missed; retries must be bounded and idempotent. A local-notification fallback is a separate product choice because it can appear without a backend notification row and can duplicate a remote push if the request times out after being accepted.

### App and API work this requires

- The app uses `@react-native-community/geolocation` for foreground one-shot fixes, Google Play services geofencing on Android, and Core Location region monitoring on iOS. Android declares foreground and background location permissions; iOS includes separate Always-location disclosure. The app targets Android API 36 and iOS 15.1. Closed-app alerts still depend on backend routes below and platform permission.
- The current nearby note response omits the center coordinates, so the OS cannot register its regions from the existing shape. Add `GET /me/vibe-note-alerts` and `PUT /me/vibe-note-alerts` for the signed-in viewer's `{enabled: boolean}` opt-in, and an authenticated `GET /vibe-notes/geofence-candidates?limit=<device capacity>` that returns only `{noteId, latitude, longitude, radiusMeters, expiresAt}` for a bounded set of live notes. Apply the same visibility/block rules as the nearby list, but do not use the viewer's “visible to nearby people” setting as a proxy for whether they may receive alerts. Do not return body or preview. Limit candidates to available device slots and a reasonable area around the viewer's last fresh location.
- Treat those coordinates as sensitive: they are present on the viewer's device while registered. Return no creator location, restrict the endpoint to authenticated users who enabled alerts, avoid logging coordinates, and let the app delete registrations on sign-out, opt-out, permission revocation, or account change. Android stores only the bounded active candidate centers in app-private storage to restore regions after reboot; iOS region state is managed by Core Location. Android backups are disabled for the app.
- **Coordinate retention:** keep each note's center only as long as the note itself is active; delete it with the note and through account deletion. Do not create a viewer-location history for matching: use the submitted fix only for the bounded evaluation job, then discard it. Do not retain raw coordinates in request, analytics, crash, or debug logs. The candidate coordinates cached on-device exist only to support OS region monitoring and must be cleared on opt-out, sign-out/account change, or when a note expires/disappears. Apply the product's documented retention and deletion rules to backups as well.
- Extend `POST /me/location` compatibly with optional `accuracyMeters`, device-captured `observedAt`, `source: "foreground" | "vibe_note_geofence"`, and `enteredNoteIds: string[]`; validate them and keep existing `{lat, lng}` callers working. For geofence source, only enqueue for those note IDs after checking the submitted fix against each note. A callback should send a fresh fix, not merely note IDs or an old stored coordinate. The setting endpoint must gate candidate reads and notification production so an opted-out viewer cannot be notified by an unrelated location update.
- `GET /me/vibe-note-alerts` returns `{ "enabled": boolean }`; `PUT /me/vibe-note-alerts` accepts and returns the same shape. These endpoints are authenticated. Setting `enabled:false` must atomically stop future candidate reads and notification production; the app also removes all device registrations locally.
- `GET /vibe-notes/geofence-candidates?limit=18` returns `{ "data": [{ "noteId": "<uuid>", "latitude": 12.97, "longitude": 77.59, "radiusMeters": 150, "expiresAt": "<ISO-8601>" }] }`. Candidates are active, permitted for this viewer, and bounded near the viewer's last accepted location. The response contains no note body, preview, creator profile, recipient's location, or unrelated fields. `limit` is clamped to 18 on iOS (reserving two of its 20 slots) and 100 on Android. Return an empty list if alerts are disabled. The app reconciles this list on launch, Nearby refresh, and foreground return.
- `POST /me/location` keeps `{lat,lng}` valid. The foreground app sends optional `accuracyMeters`, `observedAt`, and `source:"foreground"`; an OS entry callback sends the same fresh fix with `source:"vibe_note_geofence"` and `enteredNoteIds:["<uuid>"]`. For the latter, the backend evaluates only the submitted note IDs and creates the normal deduped `VIBE_NOTE_NEARBY` row/push. Ignore unknown, expired, unauthorized, inaccurate, stale, and out-of-radius IDs. Return the existing success envelope; do not echo coordinates or note content.
- Reconcile registrations on app launch, Nearby refresh, foreground return, and eligible background relaunch. Ignore initial `ENTER` state when registering while already inside a region; the product trigger is crossing into a region. The app removes stale regions on its next foreground reconciliation; until then, the backend must reject expired/deleted notes. Do not put full note content in local registration storage.
- On sign-out or account switch, clear every registered region and its local metadata before another account becomes active.

### Platform constraints verified in official documentation

- **iOS:** Core Location region monitoring can wake an app for a region event. Current iOS documentation says monitoring resumes after reboot only after the user unlocks the device, and the limit is 20 monitored conditions per app. Hiva requests Always authorization for this opt-in feature and reserves two slots for system/app headroom.
- **Android:** Hiva uses Google Play services `GeofencingClient` with a mutable, explicit `PendingIntent` and native `BroadcastReceiver`; Android requires `ACCESS_BACKGROUND_LOCATION` for background geofencing when targeting API 29+. Re-register after reboot from the app-private active-region cache. Android limits an app to 100 active geofences per device user. Its docs recommend a practical minimum radius around 100–150 m; smaller note radii should be treated as best effort, not dependable triggers.
- **Force stop / user termination:** Android's stopped state blocks background work until the user launches or otherwise explicitly reactivates the app; on Android 15 pending intents are canceled when the package enters that state. iOS can relaunch for Core Location region events under the required setup, but this is still OS-managed and not a delivery guarantee. Permission denial/revocation, disabled location services, reboot-before-unlock, poor signal, and network loss can all delay or prevent alerts.
- **Policy and user trust:** Android requires background location to be core to the feature, clearly disclosed, and compliant with Play review. Ask for it only after explaining the specific benefit; Nearby browsing and note creation should continue if the user declines.

Given the platform limits, describe the feature as **nearby alerts when available**, never guaranteed real-time tracking. Do not use a persistent location foreground service merely to keep sending fixes; it costs battery and adds a persistent system indicator/notification without solving OS force-stop behavior.

## Proposed behavior

On a fresh location update, evaluate active notes against the viewer's location. When the viewer enters an eligible note's radius, enqueue at most one `VIBE_NOTE_NEARBY` notification for that viewer and note. Tapping it opens the existing note deep link; the app calls `/open`, then reveals the returned note with its animation.

Use the push title **“A vibe just landed nearby ✨”** and a generic body such as **“Tap to discover it.”** Do not include note text, exact coordinates, creator details, or exact distance in lock-screen content.

### Location evaluation trigger

Keep the existing `POST /me/location` request shape and response compatible; accept optional `accuracyMeters` and device-captured `observedAt` metadata for geofence-triggered fixes. After validating and accepting a fresh fix, enqueue matching asynchronously so location writes do not wait on push delivery. Evaluate only authenticated fixes. Do not persist a location history for this feature; use the accepted fix and discard it after matching. The app only sends a fix after an OS geofence entry or while the user is actively using Nearby.

The server should use the note's stored center and `radiusMeters`, with a documented geodesic distance calculation. A note matches when distance is less than or equal to its radius. Reject malformed/out-of-range coordinates; ignore fixes with invalid, future, or stale timestamps if the location endpoint has or adds timestamp metadata. If accuracy is available, suppress a match when reported horizontal accuracy is too poor to distinguish entry (recommended threshold: accuracy must be no worse than the note radius); do not claim precision that the device cannot provide.

For users who have not enabled Nearby Vibe alerts, granted the necessary location permission, or have no recent fix, no geofence notification is sent. Nearby visibility is a separate privacy setting; do not use it to infer the user's choice to receive alerts. Nearby Vibes must continue to work without background permission; explain that closed-app alerts require it. Background delivery is best effort, not guaranteed: OS scheduling, approximate location, battery controls, force-stop, and network loss can delay or prevent location updates. Do not promise instant alerts.

### Eligibility and privacy

A notification is eligible only when all conditions hold at evaluation time:

- Note exists, is active, not deleted, and `expiresAt` is in the future.
- Viewer is not the note creator.
- Viewer has not already been notified for this note during the note's lifetime.
- Viewer is currently within the note's configured radius, using a sufficiently accurate fix.
- The note is visible to this viewer under the same privacy, block, moderation, and account rules as `GET /vibe-notes/nearby` and `/open`.
- Viewer has not disabled this notification category and has a registered push device. If push is unavailable, do not fabricate delivery success; the notification row may still be created if the product's existing in-app notification policy allows it.

Do not expose the creator's location or the note's exact center in the notification. The creator's public profile fields may be returned by `/open` only if they are already allowed by the existing note visibility contract.

## Notification contract

Enqueue through the existing notification service and push path:

```json
{
  "type": "VIBE_NOTE_NEARBY",
  "title": "A vibe just landed nearby ✨",
  "body": "Tap to discover it.",
  "data": {
    "noteId": "<note UUID>"
  },
  "dedupeKey": "vibe-note-nearby:<note UUID>:<recipient UUID>"
}
```

The `user_id` is the recipient. `noteId` is required and must be the canonical note ID. Keep push copy generic even if the in-app card reveals note content. Do not include lat/lng in `data` or in the notification row. A creator name/avatar can be added later as optional display metadata, but is not required for this flow.

### Dedupe and re-entry

- Enforce uniqueness on `(recipient_id, note_id)` for the lifetime of the note, using the dedupe key above or an equivalent unique constraint. Concurrent location updates must still produce one notification.
- Repeated fixes while the user remains inside the radius do not send another notification.
- Exiting and re-entering the same note radius does not send another notification. A note is a one-time discovery per viewer, not a recurring beacon.
- If an enqueue attempt fails transiently, retry idempotently with the same dedupe key. A successful database row with failed FCM delivery remains available in the in-app notification list; do not create another row on a later fix.
- Expiry or deletion invalidates pending geofence jobs. A delayed job must re-check note status and eligibility immediately before enqueue.

## Reveal endpoint behavior

No new reveal endpoint is required. Use `POST /vibe-notes/:noteId/open` as the authoritative check and response before showing the reveal animation.

Recommended status behavior (use the API's existing error envelope):

| Condition | Response | App behavior |
|---|---|---|
| Active, viewer eligible, and in radius | `200` with full note, `isUnlocked: true` | Animate reveal card with the note body. |
| Valid note but outside radius / fix too inaccurate | `403` with stable code `VIBE_NOTE_OUT_OF_RANGE` | Show “This vibe is no longer close enough to reveal.” Do not reveal cached preview/body. |
| Expired or deleted note | `410` with stable code `VIBE_NOTE_ENDED` | Show “This vibe has ended.” |
| Unknown ID or note hidden by privacy/block rules | `404` with stable code `VIBE_NOTE_NOT_FOUND` | Show “This vibe is no longer available.” Do not confirm whether a hidden note exists. |
| Invalid UUID | `400` with stable validation code | Treat as an invalid link; do not retry. |
| Rate limit | `429` with retry metadata | Show a retry option only when retry is meaningful. |

The server must repeat authorization and radius checks on every open. Notification delivery is not proof of access: a user may travel away, the note may expire, or access may be revoked between delivery and tap. Never return full body from a stale list cache or notification payload. Keep `/open` idempotent for an already-opened eligible note.

## Abuse and operational limits

- Apply the existing create-note limits, radius and lifetime caps, text length validation, and moderation checks before a note can participate in matching.
- Rate-limit location updates per authenticated user and bound candidate note queries by geospatial index, active time window, and reasonable result cap. Do not scan all notes for each fix.
- Cap notification fanout per note and recipient; one viewer-note pair is the hard idempotency boundary. Protect against fake GPS and high-frequency clients with server-side rate limits and anomaly monitoring, while treating device coordinates as untrusted input.
- Do not use this feature to infer or store a user's movement history. Restrict access to location and matching logs; logs must not contain raw coordinates or note bodies.
- Respect account deletion, note deletion, blocks, moderation takedowns, notification opt-out, and token removal. Push delivery errors must not undo a valid notification row.

## Acceptance criteria

- An eligible viewer entering a note radius produces one notification row and push with exactly the generic copy and `data.noteId` above.
- Duplicate/concurrent updates, dwell inside the radius, and exit/re-entry create no duplicate row for that note.
- Self-notifications, expired/deleted notes, blocked/private/ineligible viewers, opt-outs, and inaccurate/out-of-range fixes produce no notification.
- Push tap and in-app notification tap resolve to `vibeNote` with the same `noteId`.
- Opted-in app registers only a bounded set of eligible note regions, removes stale regions, and uploads a fresh fix only after a geofence entry (or normal foreground Nearby use).
- A note already containing the viewer when first registered does not immediately notify; crossing into it later can notify once.
- Opening rechecks current access; full content is returned only when still eligible and in range. Expired, deleted, unavailable, and out-of-range outcomes match the table.
- Location evaluation is asynchronous, rate-limited, bounded by geospatial queries, and does not persist a location trail. Background network failure is bounded/retried idempotently and never blocks the app UI.
- Tests cover boundary distance, stale/inaccurate fixes, expiry between match and enqueue/open, concurrent duplicate fixes, re-entry, self-view, blocks/privacy, notification opt-out, push failure, and missing/deleted notes.

## Platform reference

OS geofencing avoids continuous GPS polling but is constrained by device registration limits and approximate transition timing. Use platform limits as hard caps, reserve slots for other app features, and treat event delivery as best effort. Android recommends a practical minimum radius of about 100–150 m for more dependable transitions; smaller note radii may not trigger consistently.

- [Apple: Monitoring geographic conditions](https://developer.apple.com/documentation/CoreLocation/monitoring-the-user-s-proximity-to-geographic-regions)
- [Apple: Requesting location authorization](https://developer.apple.com/documentation/CoreLocation/requesting-authorization-to-use-location-services)
- [Android: Create and monitor geofences](https://developer.android.com/develop/sensors-and-location/location/geofencing)
- [Android: Background location access](https://developer.android.com/develop/sensors-and-location/location/background)
- [Android 15 stopped package behavior](https://developer.android.com/about/versions/15/behavior-changes-all)
