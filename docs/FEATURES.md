# Hiva app: features

What the app does today, by area, with where it lives and how finished it is. Written from the code on the
`staging` branch (including uncommitted work) and the backend contract in `gathr-api/API.md`. Nothing here was
measured on a device unless it says so.

**Status key:** **Done** works end to end · **Partial** works but a documented piece is missing · **Not in app**
backend exists, no app UI.

Stack: React Native 0.87 (New Architecture, Hermes), React 19, React Navigation, Redux Toolkit + redux-persist,
NativeWind, Reanimated 4, LiveKit (rooms), Firebase (auth, push, crashlytics), Razorpay, Google Play Billing.
Android is the primary target. iOS builds exist but the iOS-only items below are unverified.

## Tabs

| Tab | Screen | What it holds |
| --- | --- | --- |
| Home | `features/home` | For you feed, Events list |
| Explore (Nearby) | `features/nearby` | People nearby, Events, vibe notes |
| Party | `features/party` | Audio/video rooms |
| Chat | `features/messages` | Inbox, DMs, event chats, party chats |
| Me | `features/profile` | Profile, settings, organiser and creator entry points |

## Features

### Sign-in and onboarding: `features/auth` · Done

- Google sign-in, exchanged through Firebase for an API session (`POST /auth/firebase`). Tokens live in Keychain;
  token refresh is single-flight.
- Five-step onboarding: profile, interests, details (gender, country, profession), intent, photo. Date of birth
  is collected inside it (age gate; underage accounts are blocked and can delete the account).
- Existing sessions without a confirmed age get a "confirm age" screen.
- **Needs backend:** `gender`, `country`, `profession`, `intent` on `PATCH /auth/me`. This is in `gathr-api` only
  on branch `feat/onboarding-profile-fields` (migration 086). Until it is deployed and the migration is applied,
  saving these fields against the deployed API will not work.

### Home feed: `features/home` · Done

- Post feed with likes, comments, share, save, follow, report, delete; compose with text and images.
- Sponsored (AdMob native) rows every few posts.
- Comments sheet: paged, plus opening on the page that holds a notification's comment (`aroundCommentId`) with
  "Load earlier comments".
- Feed is a FlashList.

### Events: `features/events`, `features/eventNetworking` · Mostly done

- Browse published events, event detail, interest, free tickets, **My tickets** (QR), waitlist. There is no ticket-transfer UI in the app (the backend has transfer).
- Event networking: opt in, attendee list, connect (when the organiser enables it for an event).
- A 404 on a ticket or purchase action (events switched off, or event gone) shows a plain explanation.
- **Partial:** paid events open an organiser chat, but the chat has no payment-card or ticket UI and no `mark-paid`
  call, so the paid flow cannot be completed in the app.

### Organiser: `features/organizer` · Partial

- Become an organiser (workspace + verification document), credits and purchases (Razorpay, for ticket-credit packs
  only), create events.
- **Broken against the current backend:** the dashboard calls `organizer-dashboard`, `organizer-summary` and
  `check-ins` routes that exist on no backend branch (verified against `origin/main` routes). Those screens cannot
  load until the backend adds them or the app is changed to use the routes that do exist.
- Backend gate: publishing a paid event or issuing a paid ticket needs `payout_status = VERIFIED`; the only code
  that references it is the check in `event.service.js` and `ticket.service.js`, so nothing in this repo sets it.
- **Not in app:** offline scanner, ticket tiers, ticket transfer management, payment-card sharing.
- Backend also has discount codes, CSV export, webhooks, analytics and an analyst role; none have app UI.

### Explore / Nearby: `features/nearby` · Partial

- Opt-in location visibility, people nearby, discovery presets, Social Passport (other cities), distance filters.
- Vibe notes: drop a note at a place, reveal it when nearby, geofence alerts (native Android and iOS bridges).
- **Broken against the current backend:** the app calls `/me/vibe-note-alerts` and `/vibe-notes/geofence-candidates`,
  which are not in `origin/main`'s routes, so alert preferences and geofence candidates cannot load.
- Needs a device check: the people list only shows when visibility is on (the emulator run had it off).

### Party rooms: `features/party`, `features/paidRooms`, `features/hostStudio` · Done

- Audio and video rooms on LiveKit: join, seats, request to speak, mute, audio output picker, background audio
  service, room chat, polls, games, gifts.
- Paid rooms (gate + refund flow), scheduled rooms, invite links, Host Studio (templates, run of show, questions).
- Gifts are bought through Google Play Billing, in line with Play policy for digital goods.

### Chat: `features/messages` · Done

- Inbox with folders, requests, unread, search; direct messages with realtime (socket, polling fallback), typing,
  read marks, message cache, follow-up reminders.
- Event and party conversations appear in the same inbox.
- Chat lists are plain FlatLists on purpose (scroll-to-end behaviour).

### Notifications: `features/notifications` · Done

- FCM push through notifee, notification bell and sheet, grouped "liked your post" rows, deep links to posts,
  comments, parties and events.

### Profile and settings: `features/profile`, `features/users` · Done

- Own profile (posts, rooms, events, gifts tabs), edit profile, share profile, follow lists, other users' profiles.
- Settings: notifications, quiet hours, privacy (private profile, online status, seat invites), blocked users,
  ad privacy choices, delete account. (The backend has a `language` setting; there is no language control in the
  app.)
- "Become a creator" banner leads to creator onboarding.
- A dev-only "Preview onboarding" button shows in debug builds (`__DEV__`).

### Hiva Plus and monetisation: `features/plus`, `features/creator`, `features/ads`

- **Plus (Partial):** subscription through Google Play, badge, profile themes, discovery filters, limits and
  paywall. If Play offers fail to load, the paywall shows fixed prices.
- **Creator (Partial):** the app calls `/creators/me/onboarding`, which is not in `origin/main`'s creator routes;
  it also sends bank details. Gift summary, wallet and payout requests exist on the backend.
- **Ads (Done):** AdMob native cards in the feed and events list; consent and privacy options.
- Play Billing covers Plus, gifts, themes and paid rooms. Event tickets are paid by the buyer directly to the
  organiser (payment card shared in chat), not through the app. Razorpay in the app is only for organiser
  ticket-credit packs.

### Search: `features/search` · Done

- People and rooms search, recent searches.

## Cross-cutting

| Area | State |
| --- | --- |
| API client | 15 s timeout, single-flight refresh, typed errors; base URL set by `HIVA_API_URL` (default `api-ede.itzsjdude.in`) |
| Realtime | One socket for chat and notifications, 30 s heartbeat |
| Crash reporting | Firebase Crashlytics |
| Images | `RemoteImage` (react-native-fast-image v10) |
| Lists | FlashList for feeds and long lists |
| Tests | 89 Jest suites; `npm run typecheck`; CI workflow in `.github/workflows/ci.yml` |

## Known gaps

See `docs/TASKS.md` for the verified, prioritised backlog.

1. Paid-event purchase cannot finish in chat (no payment-card/ticket UI, no `mark-paid`), and nothing in the
   backend sets organiser `payout_status` to `VERIFIED`, which paid events require.
2. Onboarding profile fields are not on the deployed backend yet.
3. Organiser scanner, tiers and payment-cards have no app UI, and the organiser dashboard and creator onboarding
   call routes that are not in the backend.
4. iOS: no Sign in with Apple (App Review rule 4.8 applies when Google is the only login), iOS billing is
   unverified, and the `voip` background mode needs a justification or removal.
5. Release build: ProGuard/R8 is off, and a release build without `android/keystore.properties` is signed with
   the debug key.
6. Performance work is code-level only; nothing has been profiled on a device or a release build.
