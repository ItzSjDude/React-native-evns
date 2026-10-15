# UX and Accessibility Audit (WCAG 2.1 AA, mobile)

Audience: Frontend-Dev. Scope: `src/features/*`, `src/components/*`, `src/Constants/*`, `global.css`, `tailwind.config.js`.
Method: static code reading plus scripted scans (JSX tag parsing, regex greps, contrast arithmetic with the WCAG relative-luminance formula). Nothing was run. Anything that depends on how TalkBack, VoiceOver or the layout engine behaves at runtime is marked **UNVERIFIED**.

## 1. Summary

| Severity | Count | Meaning |
|---|---|---|
| BLOCKER | 2 | Fails a core task or misleads the user on a money or error path; fix before release |
| MAJOR | 19 | WCAG AA failure or serious UX defect on a main flow |
| MINOR | 15 | Polish, consistency, or low-reach issues |

What is already good (do not regress):
- Every Pressable/Touchable has an `accessibilityRole`. My scan of 344 interactive JSX tags found 0 icon-only buttons without a label. The 53 without `accessibilityLabel` all contain visible `<Text>` (their name is derived from the text).
- All 35 `TextInput`s carry `accessibilityLabel`. 3 of 4 `Switch`es do.
- All 20 `<Modal>`s implement `onRequestClose`, so the Android back button works.
- 53 `accessibilityRole="alert"` usages, and `BottomSheet`, `Dialog`, `SplashScreen` and `SlideInScreen` all honour `isReduceMotionEnabled`.
- Destructive flows for posts, account, block, ticket cancel and room end/leave are confirmed (`PostCard.tsx:71-96`, `SettingsScreen.tsx:349-359`).

## 2. Contrast numbers (computed)

Tokens: `global.css:7-60`, `src/Constants/Colors.tsx`, `tailwind.config.js`, `src/features/home/feedTheme.ts`. Pass = 4.5:1 for text under 18.66px bold or 24px regular. Non-text UI = 3:1.

| Pair (where used) | Light | Dark |
|---|---|---|
| `text` on background | 19.18 pass | 18.30 pass |
| `text-body` on background | 14.31 pass | 15.74 pass |
| `muted` on background / on card | 5.18 / 4.65 pass | 6.93 / 6.16 pass |
| `muted-light` (#8C91A1 / #687087) on bg / on card | **3.14 / 2.82 fail** | **4.00 / 3.55 fail** |
| `feed-muted` on bg (time, counts, "more", unselected feed tab) | 4.55 pass (on feed-card: **4.14 fail**) | **3.74 fail** (on feed-card 3.38) |
| `feed-dim` on bg | **2.82 fail** | **3.07 fail** |
| `primary` on bg / card / primary-dark | 4.97 / **4.46 / 4.13 fail** | 7.26 / n/a / 5.92 pass |
| `text-gold` #8B7CF6 on bg / card / gold-bg | **3.33 / 2.99 / 2.85 fail** | 5.94 / 5.27 pass |
| `text-coral` #FF786F on bg / card / coral-tint | **2.57 / 2.31 / 2.35 fail** | 7.68 / 6.82 pass |
| gold-ink on gold (buttons) | 5.53 pass | same |
| text-dark on coral (destructive button) | 6.98 pass | same |
| `purple-soft` on bg | 5.64 pass | 7.26 (#A78BFA) pass |
| white on `primary` (selected interest chip) | 4.97 pass | **2.72 fail** (`OnboardingSteps.tsx:231-233`) |
| Field borders `border` #E2E0E8 / #363342 vs bg (1.4.11, 3:1) | 1.31 fail | 1.61 fail |

Profile "Become a creator" banner (`Profile.tsx:313-322`, gradient #6D5DF6 -> #A855F7 -> #FF5D8F, white text):

| Position | Gradient colour | Title `text-white` 14px extrabold | Subtitle `text-white/85` 11.5px |
|---|---|---|---|
| Start | #6D5DF6 | 4.62 pass | **3.81 fail** |
| 25% | #8A59F6 | **4.34 fail** | **3.58 fail** |
| Middle | #A855F7 | **3.96 fail** | **3.30 fail** |
| 75% | #D459C3 | **3.49 fail** | **2.94 fail** |
| End | #FF5D8F | **2.91 fail** | **2.48 fail** |

The text sits in the left half of a wide pill (title on the left, subtitle can run across the middle, chevron on the right). Actual per-glyph contrast is **UNVERIFIED** at runtime, but at best the title is borderline and the subtitle fails at every sampled point.
Other white-on-colour: Paywall CTA (`PaywallSheet.tsx:161-162`) white on #B06CF2 is 3.35 fail (start #5B4FE8 is 5.63 pass). Room tiles (`ProfileItems.tsx:86`, `UserProfileItems.tsx:94`) `text-white/85` 12px on #C2552F is 3.74 fail. Onboarding identity card (`OnboardingSteps.tsx:122`) `text-white/60` 10px is about 3.1 fail.

Candidate replacements (all computed): light danger text #C2342B = 5.50 (or #D93A30 = 4.57); keep #FF786F in dark. Light gold-as-text: use #6750D9 (`purple-soft`) = 5.64. Dark `feed-muted` #8E8E97 = 6.08 on bg, 5.50 on feed-card. Dark `muted-light` #8A92A8 = 5.64 on card. Light `feed-dim` #767686 = 4.46 (nudge to #747483). Banner gradient #5B4FE8 -> #8E3FD6 -> #C23369 gives white 5.63 / 5.48 / 5.29 (title and subtitle at full white, not /85).

## 3. Findings

Format: ID | screen/component | file:line | criterion | fix.

### BLOCKER

**B-01 Paywall shows fake prices and swallows the load error** | Plus paywall | `PaywallSheet.tsx:42,75-80,93-102,159-164` | Heuristics 1 and 9 (visibility, error recovery); consumer-trust risk.
While plans load or if Play fails, `isStatic` renders hard-coded `$4.99/wk, $12.99/mo, $79.99/yr` (a `ponytail: temporary` comment) as selectable radios. `load.message` (set at line 80) is never rendered. The "Upgrade to Hiva Plus" button then just re-runs `fetchOptions()` (line 102) with no feedback. The audience is India, so `$` is also wrong.
Fix: render skeleton cards during `loading`; on error show the message in an alert with a "Retry" button and disable the CTA. Delete `STATIC_PLANS` or gate it behind `__DEV__`.

**B-02 `coral` used as text colour fails in light theme (2.57:1 on white)** | App-wide error/destructive text | `Colors.tsx:23` / `tailwind.config.js` (`coral: '#FF786F'`); 88 usages in 47 files, e.g. `Login.tsx:195`, `Onboarding.tsx:239-240`, `OnboardingSteps.tsx:41,54,242`, `SettingsScreen.tsx:238,311,355`, `Home.tsx:323,347`, `CommentsSheet.tsx:171,187` | WCAG 1.4.3.
In light mode (system theme, `global.css:7`), the only visual error signal is unreadable for low-vision users.
Fix: add a themed `danger` colour (light #C2342B, dark #FF786F) to `Colors.tsx`, `global.css` (`--c-danger`) and `tailwind.config.js`, then replace `text-coral`/`Colors.coral` used on text (not icons or fills).

### MAJOR

**M-01 Login Google button: incomplete name, no busy state, error not announced** | Login | `Login.tsx:138-186,195` | 4.1.2, 4.1.3, 3.3.1.
The button has no `accessibilityLabel`. Its name is "Continue with" (the Google logo `Image` has no label). It does not expose `accessibilityState={{busy,disabled}}` while `isLoading`. The `errorMessage` text (line 195) has no `alert` role or live region.
Fix: `accessibilityLabel={isLoading ? 'Signing in' : 'Continue with Google'}`, `accessibilityState={{busy: isLoading, disabled: isLoading}}`, error `accessibilityRole="alert" accessibilityLiveRegion="polite"`. Mark the logo `accessibilityElementsHidden`.

**M-02 Dynamic type is neutralised in `Typography`; no cap anywhere; fixed heights** | Login, Home empty/error states, Comments, Compose | `Typography.tsx:47`; whole app | 1.4.4, 1.4.10.
`fontSize: (size - 1) / PixelRatio.getFontScale()` is divided by the system font scale while `<Text>` multiplies it back (default `allowFontScaling`), so these texts net to a constant `size - 1` px. It also makes every `Typography` string 1px smaller than asked. Used in 4 files (comment bodies, "Send", empty and error states, Login button). Elsewhere text scales with no `maxFontSizeMultiplier` (0 hits) while containers are fixed: input rows `h-14` (`OnboardingSteps.tsx:49,52`), CTA `h-11` (`Onboarding.tsx:244`), plan cards `h-[80px]` with an absolute 9px tag (`PaywallSheet.tsx:145-148`), tab pill `h-[50px]` (`TabNavigation.tsx:187`), `h-[34px]` tabs (`ProfileContentTabs.tsx:15`), step counter `w-11` (`OnboardingSteps.tsx:26`), Dialog buttons `numberOfLines={1}` (`Dialog.tsx:90`). Clipping at 200% is **UNVERIFIED**.
Fix: use `fontSize: size` (drop the division and the `-1`); convert `h-*` on text containers to `min-h-*` + vertical padding; set `maxFontSizeMultiplier={1.5}` on the tab bar, step counter and badge texts; test at 200%.

**M-03 Brand "gold" and `primary` as text on light surfaces** | Events, networking, rooms, settings | `text-gold` in 47 lines/25 files: `EventDetailSheet.tsx:163,165,167`, `AttendeeCard.tsx:55`, `EventNetworkingSheet.tsx:126`, `RoomExtrasViews.tsx:160`; `text-primary` on card/tint (4.46/4.13) | 1.4.3.
`gold` is a fixed #8B7CF6 in both themes (`tailwind.config.js:34`): 3.33:1 on white.
Fix: for text use `text-purple-soft`/`text-primary` tokens (themed) or a new `gold-text` token (light #6750D9). Keep `gold` for fills. Darken light `primary` to about #6A4DE0 so it clears 4.5 on `card` and `primary-dark`.

**M-04 Muted/dim tokens fail** | Feed (time, counts, "more", unselected tab), search separators, age screen, chevrons | `feedTheme.ts:10-11,20-21`; `global.css:17-18,31-32,40-41`; `PostCard.tsx:118,136,175`; `Home.tsx:313`; `ConfirmAgeScreen.tsx:61`; `SearchRows.tsx:71` | 1.4.3, 1.4.11.
Dark `feed-muted` is 3.74:1 on the 17px unselected feed tab and 13px counts/time. `muted-light` 3.14 (light) / 4.00 (dark). Field borders are 1.3-1.6:1 (input boundaries, 1.4.11).
Fix: use the Section 2 candidate values; strengthen `--c-border-muted` to about 3:1 (`#8E8A9E` light, `#6B6780` dark) for input outlines only.

**M-05 White text on gradients** | Profile creator banner, Paywall CTA, room tiles, onboarding card | `Profile.tsx:313-322`; `PaywallSheet.tsx:161-162`; `ProfileItems.tsx:86`; `UserProfileItems.tsx:94`; `OnboardingSteps.tsx:118-128` | 1.4.3. Numbers in Section 2.
Fix: darken gradient stops (#5B4FE8 -> #8E3FD6 -> #C23369), use full `text-white` (no /85, no /60), raise subtitle to 12px, `numberOfLines={2}` rather than clipping.

**M-06 Selected interest chip: white on dark-theme primary = 2.72:1** | Onboarding step 5 | `OnboardingSteps.tsx:231-233` | 1.4.3.
Fix: `text-gold-ink` (or `text-text-dark`) on `bg-primary` in dark; `text-white` only in light (4.97).

**M-07 `accessibilityLabel` overrides swallow visible content** | Event ticket status, room cards, Settings rows, SheetRow | `EventDetailSheet.tsx:163` (label "Your ticket status" hides the status value), `MyTicketsSheet.tsx:81` (reads raw enum e.g. `CHECKED_IN`), `PartyRoomCard.tsx:41` (label "Open {title}" hides live/scheduled state, participant count, language, tags), `SettingsScreen.tsx:64-65` (label=`label` hides `hint` and `value`: "Active", quiet-hours "22:00 - 07:00", blocked count, "Everyone"), `BottomSheet.tsx:128-131` (`SheetRow` drops `description` and accessory text) | 1.3.1, 4.1.2.
Fix: build full labels (`${label}, ${value}`) and pass the hint via `accessibilityHint`; for `Text` use `accessibilityLabel={`Ticket status: ${human(status)}`}`; for room cards compose "title, Audio, 12 listening, Hindi".

**M-08 Interactive controls nested inside an accessible Pressable (UNVERIFIED)** | Notification rows (Follow back / action button), room card "More options" | `NotificationsSheet.tsx:233-285`, `PartyRoomCard.tsx:41,53` | 2.1.1, 4.1.2.
RN `Pressable` defaults to `accessible`, so on iOS a labelled parent normally hides its children from VoiceOver; TalkBack typically still exposes them. Likely unreachable by VoiceOver.
Fix: wrap the row in `<View accessible={false}>` with sibling pressables, or expose them as `accessibilityActions` (`onAccessibilityAction`) on the row ("Follow back", "More options").

**M-09 Unlabelled Switch, state not announced in room settings** | Host room panel | `PartyRoomPanel.tsx:120-121,311-317` | 4.1.2.
`SettingSwitch` has no `accessibilityLabel`; the wrapping `SheetRow` is `role=button` without `checked`.
Fix: `<Switch accessibilityLabel=... />` and make the row `accessibilityRole="switch"` with `accessibilityState={{checked}}`, as `SettingsScreen` `Row` already does. Move "One message every 10 seconds" into the hint.

**M-10 Tab accessible name differs from visible label** | Bottom tab bar | `TabNavigation.tsx:225-228,271-275` | 2.5.3 Label in Name.
Visible "Explore" but accessible name is the route name "Nearby"; "Chat" tab vs Messages screen; "Me" vs "Profile". Voice Control "tap Explore" fails. Inactive tabs are icon-only (labels only on the active tab), so no visible names exist for them.
Fix: set `tabBarAccessibilityLabel` per screen equal to the visible label ("Home", "Explore", "Party", "Chat", "Me") and keep one vocabulary (see m-10).

**M-11 Errors and success are not announced consistently** | Forms and lists | no live region/alert at: `Login.tsx:195`, `CommentsSheet.tsx:171,187`, `ComposePostSheet.tsx:142`, `Home.tsx:323,347`, `Party.tsx:375`, `Messages.tsx:427`, `Profile.tsx:345-351`, `FollowListSheet.tsx:35,99`, `UserProfileModal.tsx:334,348`, `EventNetworkingSheet.tsx:122`, `PartyCreateSheet.tsx:114`, `PaywallSheet.tsx:156` (success "Welcome to Hiva Plus!" is not announced, and the sheet closes 900 ms later) | 4.1.3, 3.3.1.
Only 12 `accessibilityLiveRegion` and 53 `role="alert"` exist in total. `role="alert"` on Android is **UNVERIFIED** as an announcement trigger.
Fix: one shared `InlineMessage` component (`accessibilityRole="alert"` + `accessibilityLiveRegion="polite"`, `assertive` for blocking errors), used for every error/success text. After a failed validation, move screen-reader focus to the first invalid field or the error (`AccessibilityInfo.setAccessibilityFocus`). Also on step change in Onboarding (focus the new `Prompt` header).

**M-12 Sheets and dialogs: no focus move or announcement on open (UNVERIFIED)** | `BottomSheet`, `DialogHost` | `BottomSheet.tsx:77-102`, `Dialog.tsx:78-97` | 2.4.3, 4.1.3.
Neither moves focus to the title or announces on open. In `BottomSheet` the first focusable element in reading order is the full-screen "Dismiss sheet" scrim `Pressable` (line 81), ahead of the content, and the title area also has a "Close sheet" button (duplicate). The drag handle is `role="adjustable"` with hint "Swipe down to close", which mis-describes how adjustable controls work (up/down swipes change the value). `Dialog` has `accessibilityViewIsModal` but the Lottie cat (line 83) is not hidden from AT, and `numberOfLines={1}` truncates long button labels. Whether `DialogHost` (mounted at root, `App.tsx:46`) can present above another open RN `<Modal>` on iOS is **UNVERIFIED**.
Fix: after `visible` becomes true call `AccessibilityInfo.setAccessibilityFocus(findNodeHandle(titleRef))` and `announceForAccessibility(title)`; set `accessibilityViewIsModal` on the sheet container; hide the scrim from AT (`importantForAccessibility="no"`, `accessibilityElementsHidden`) since Back and "Close" already exist; give the handle `accessible={false}` plus an `accessibilityActions` entry on the container (`escape`/`magicTap`); hide the Lottie (`importantForAccessibility="no-hide-descendants"`); remove `numberOfLines` from Dialog buttons.

**M-13 Touch targets below 44pt (iOS) / 48dp (Android)** | Many | Effective size = element size + 2x `hitSlop`. From a scripted scan of Pressable classes:
`ComposePostSheet.tsx:173` remove-photo 24+12 = 36; `:194` **Post** (primary) h-9 = 36, no hitSlop; `CommentsSheet.tsx:174` **Send** h-9 = 36; `CommentsSheet.tsx:41` "Delete" 12px link (about 28); `SearchScreen.tsx:82` clear 24+16 = 40; `Profile.tsx:266` change-photo 28+12 = 40; `DirectConversation.tsx:211-213` call/options 40x40 and 40x32, no hitSlop; `Party.tsx:205` 40x40, `:242` 32x40; `PartyRoomCard.tsx:53` 24x28+16 = 40x44; `SettingsScreen.tsx:88` **Unblock** h-8 = 32; `AudioRoomStage.tsx:278-279` Later/Join h-9; `AudioRoomStage.tsx:283,288` retry-audio h-9 and send 36x36; `RoomChatStream.tsx:177,189` 40x40; `ProfileSheets.tsx:129,155` interest chips min-h-9 (36); `PaywallSheet.tsx:167,172` Restore purchases min-h-[32] and Manage link (11px); `Nearby.tsx:478-546` many h-10; `Onboarding.tsx:244` CTA h-11 (44, meets iOS only); `LegalLinks.tsx:14-17` inline 12px links.
(WCAG 2.1 has no pixel minimum for target size; 2.5.5 is AAA. These are platform guidelines and WCAG 2.2 SC 2.5.8 AA = 24px.)
Fix: a shared `TOUCH = 48` rule: `min-h-12 min-w-12` or `hitSlop` to reach 48; convert `h-8/h-9/h-10` on interactive elements to `min-h-11`+. Largest wins: Post, Send, Unblock, call/overflow buttons, Restore purchases.

**M-14 Android keyboard avoidance inconsistent with edge-to-edge (UNVERIFIED)** | Onboarding, DM composer, party create, creator onboarding | `Onboarding.tsx:222`, `DirectConversation.tsx:195`, `PartyCreateSheet.tsx:73`, `CreatorOnboardingScreen.tsx:73` use `behavior={Platform.OS==='ios' ? 'padding' : undefined}`; `android/gradle.properties:44 edgeToEdgeEnabled=true`; `AndroidManifest.xml:63 adjustResize`. `BottomSheet.tsx:78` explicitly comments that `adjustResize` does not shrink under edge-to-edge for translucent Modals, and `ComposePostSheet.tsx:134`, `AudioRoomStage.tsx:258` use `'padding'` on Android.
Fix: verify on a device; if the keyboard covers the chat input or onboarding fields, use `'padding'` on Android for these four, or switch to `react-native-keyboard-controller`.

**M-15 Destructive actions without confirmation or undo** | Comments, vibe notes, room chat | `CommentsSheet.tsx:41,148-166` (Delete comment is immediate; 12px target); `VibeNotesList.tsx:47,105-119` (immediate; compare `MyVibesSheet.tsx:82` which confirms); `PartyRoomPanel.tsx:347` Delete message. There is no undo or snackbar pattern anywhere in the app (the only toast is `NotificationBanner`). Confirm UIs also differ: native `Alert.alert` (`MyVibesSheet.tsx:82`, `Nearby.tsx:221-244`) vs `showDialog`.
Fix: confirm via `showDialog` with `style:'destructive'`, or optimistic remove + an "Undo" snackbar (5 s, `accessibilityLiveRegion`) with the delete request delayed. Replace `Alert.alert` with `showDialog` for look consistency.

**M-16 Onboarding is a dead end at step 0 and high-friction** | Onboarding | `Onboarding.tsx:113-127,223`, `OnboardingSteps.tsx:21-22`; `validation.ts:23-47` | Heuristics 3 (user control), 7 (efficiency).
At step 0 the Back button is invisible (`opacity-0`) and the Android back handler returns `false`, so back exits the app. There is no "Log out / use another account" (only `ConfirmAgeScreen.tsx:38-61` has one). All five steps are mandatory (name, handle, photo when the picker is available, gender, country, DOB when the gate runs, profession, intent, interests). Draft state is local `useState`, so killing the app mid-flow restarts at step 0 (**UNVERIFIED** whether anything persists; I found no persistence). The interest limit message appears only after hitting the limit (`toggleInterest` silently returns).
Fix: add "Not you? Log out" on step 0; make photo, profession and intent skippable ("Skip for now"); merge steps 3 and 4 (profession + intent); persist the draft (redux-persist slice); announce "x of 8 selected" via `accessibilityLiveRegion`.

**M-17 Dead-end controls and missing escape routes** | DM header, Settings | `DirectConversation.tsx:211-212` show Audio/Video call buttons that only open "Calls unavailable" (`showDialog`); `SettingsScreen.tsx:290` the "Delete account" row renders only if `settings` loaded, so if the settings API fails the user has no in-app deletion path (a Google Play data-deletion requirement; **UNVERIFIED** policy status) while the other privacy rows silently disappear too.
Fix: hide the call buttons behind a feature flag (or disable with "Coming soon" description); render "Delete account" independent of `settings`, and show a "Couldn't load settings. Retry" row when `settings === null` after load failure.

**M-18 No offline state; raw technical errors shown to users** | All networked screens | `apiClient.ts:101,108,176`; `messageOf` copies in `Profile.tsx:54`, `SettingsScreen.tsx:48`, `Home` etc.; `Nearby.tsx:384` regex-matches `/permission|settings/i` on message text | Heuristics 1, 9.
`fetch` network failures surface as the library message (e.g. "Network request failed"; **UNVERIFIED** exact string) and non-JSON gateway errors as "Server returned a non-JSON response (502)." No NetInfo dependency, no global offline banner, only the 15 s timeout message. Retry copy varies ("Tap to retry", "Retry", "Try again").
Fix: map errors in `apiClient` to `{code:'OFFLINE'|'TIMEOUT'|'SERVER', message}` with friendly strings; add `@react-native-community/netinfo` + a slim "You're offline" banner (live region) and auto-retry on reconnect; replace the string regex with an error `code`.

**M-19 i18n and the `language` setting** | Whole app, Settings, Party create | No i18n library (no `react-i18next`, `I18nManager`, `expo-localization`); all copy is inline English. `UserSettings.language: 'en'|'hi'|'hinglish'` exists (`profile/types.ts:76`) but `SettingsScreen.tsx` has no language row and nothing reads it (dead field). The only language UI is the content language in `PartyCreateSheet.tsx:24,108-110` (default `'Hindi'`, options Hindi/English/Punjabi/Bengali), which does not match the discovery taxonomy `en/hi/hinglish` (`discoveryFilters.ts:3`), so Hinglish rooms cannot be created. Date/number formatting is mixed: hard-coded `'en-US'` in `DirectConversation.tsx:49` and `conversationPresentation.ts:38-39` vs device locale (`undefined`) in 9 other places; `compact()` hard-codes "k" (`Profile.tsx:45`); `is24Hour` picker vs 12-hour chat times; "Joined" etc. string-built (`Profile.tsx:220`). No RTL handling (no `writingDirection`/`start`/`end`; physical `ml-/mr-/left/right`, right-anchored pills with `rounded-l-full` at `Home.tsx:302`, `Party.tsx:213`). No `lang` equivalent to set; Android picks TTS language from the device.
Fix: decide scope. Minimum: wire `settings.language` to a Settings row, use the same code list for rooms and filters, drop `'en-US'`. If localisation is planned: adopt `i18next` + a `t()` wrapper, move strings per feature, use logical spacing (`ms-/me-`, `start-/end-`).

### MINOR

- **m-01 Infinite decorative animation without reduced-motion** | `Login.tsx:43-45,166-178` (`withRepeat(..., -1)` 4.6 s border sweep, never paused); `TabNavigation.tsx:176-181` (width tween) | 2.2.2, 2.3.3. Fix: gate on `AccessibilityInfo.isReduceMotionEnabled` or Reanimated 4 `ReducedMotionConfig`; stop the loop after 5 s. No flashing content (3 per second) found.
- **m-02 Status bar style** | `Onboarding.tsx:221` hard-codes `barStyle="dark-content"` on a theme-following background (dark icons on #0B0914 in dark mode); `Login.tsx` sets none while forcing `bg-white`. Use `ThemedStatusBar` (`components/ThemedStatusBar.tsx`) or force `dark-content` on Login. Rendering is UNVERIFIED.
- **m-03 Palette frozen at import** | `Onboarding.tsx:19`, `OnboardingSteps.tsx:13-14`, `PaywallSheet.tsx:51-52` call `Colors.*` inside `StyleSheet.create` at module load, so a live theme switch does not repaint them (`Colors.tsx` comment confirms a re-render is needed). Use className tokens instead.
- **m-04 PostCard semantics** | `PostCard.tsx:153-176` three separate focus stops (avatar, name, time) all opening the profile; time `Pressable` has no label; `:133` like/comment counts are in the visual but not in the label (label replaces children); image alt is generic "Post image N" (`:127`), carousel dots unlabelled (`:191`), compose has no alt-text field (`ComposePostSheet.tsx`). Fix: one author stop, `accessibilityLabel={`${n} likes. Like post`}` or `accessibilityValue={{text:`${n}`}}`, "Image 2 of 4", optional alt text.
- **m-05 Counters not live** | `CommentsSheet.tsx:178`, `ComposePostSheet.tsx:196` character counters (11-12px muted) appear at the threshold with no announcement, and `maxLength` truncates silently. Add `accessibilityLiveRegion="polite"` at thresholds (50/10/0).
- **m-06 Inline legal links** | `LegalLinks.tsx:14-17` 12px nested `Text` links are hard to hit. Make them separate 44pt buttons below the sign-in CTA.
- **m-07 Label-in-name mismatches** | `AudioRoomStage.tsx:278-279` visible "Later"/"Join" vs labels "Decline"/"Accept"; `Messages.tsx:401,404` placeholder "Search messages" vs label "Search conversations"; `Party.tsx:213-225` "Create" vs "Open create party" (contains the word; acceptable). 2.5.3. Fix: use the visible text as (the start of) the label.
- **m-08 Very small text** | 9px plan tag (`PaywallSheet.tsx:146`, muted on `border` 3.96:1 light), 10-11px badges and legal/renewal disclosure (`PaywallSheet.tsx:171-173`, 11px, which should be legible), 10px labels (`PartyRoomCard.tsx:48`). Raise to at least 12px; make the renewal and price disclosure at least 13px.
- **m-09 Hard-coded colours** | 95 `text-/bg-/border-[#hex]` classes and 66 `dark:...-[#hex]` overrides (e.g. `#B3AECB`, `#9C97B8`, `#17152A` in `Profile.tsx:254-308`) bypass tokens and hide contrast regressions. Move into `global.css` variables.
- **m-10 Copy consistency** (counts via grep of UI strings): Retry (44) vs Try again (18); "Tap to retry" (15; touch-specific, use "Retry"); Close/Done/Dismiss/Cancel used interchangeably; "Organiser dashboard" (`Profile.tsx:308`) vs "Organizer" group (`SettingsScreen.tsx:266`) vs "Organizer Pro"; party/room/rooms/"Audio party" (tab is "Party", profile tab is "Rooms", `Profile.tsx:44`); tab "Explore" vs screen/setting "Nearby" (`SettingsScreen.tsx:271`); straight vs curly apostrophes ("Couldn't" `Home.tsx:323` vs "isn’t" `SettingsScreen.tsx`). Tone is plain English throughout; there is no Hinglish copy even though the product targets India (see M-19). Publish a short voice-and-terms sheet (one term per concept) and apply it.
- **m-11 Auto-dismissing banner** | `NotificationBanner.tsx:9,28` toast disappears after 4.5 s (2.2.1). Mitigated because notifications persist in the sheet and the banner is a polite live region; pause the timer while a screen reader is running (`isScreenReaderEnabled`).
- **m-12 Duplicate dismiss controls** | `BottomSheet.tsx:81` scrim "Dismiss sheet" plus `:93` "Close sheet" plus `PaywallSheet.tsx:131` a third close; collapse to one (see M-12).
- **m-13 Store wording on cross-platform paywall** | `PaywallSheet.tsx:121,172` and `SettingsScreen.tsx:46,194-196` say "Google Play" unconditionally. If iOS ships, branch on `Platform.OS`. UNVERIFIED whether iOS billing is in scope. Likewise Login offers Google only; App Store guideline 4.8 (Sign in with Apple) may apply on iOS (UNVERIFIED).
- **m-14 Onboarding progress semantics** | `OnboardingSteps.tsx:28` `role="progressbar"` has a label but no `accessibilityValue` (`{min:1,max:5,now:step+1}`), and the visible "01/05" is a separate unlabeled text. Delete duplicates or hide one.
- **m-15 Non-WCAG consistency** | Dev-only "Preview onboarding" buttons are correctly behind `__DEV__` (`Login.tsx:187`, `Profile.tsx:258`). Settings uses a custom `Toggle` (`SettingsScreen.tsx:54-57`) with off-track `bg-border` at 1.3:1; the knob helps but make the off track at least 3:1.

## 4. Implementation tasks (sized)

Sizes: S = under 2 h, M = half a day, L = 1-2 days.

| # | Task | Fixes | Size |
|---|---|---|---|
| T1 | Add themed `danger` colour; replace coral text usages (grep `text-coral`, `Colors.coral` on `<Text>`/`Typography color`) | B-02 | M |
| T2 | Paywall: remove `STATIC_PLANS`, loading skeleton, render `load.message` with Retry, disable CTA | B-01 | S |
| T3 | Fix `Typography` scaling (use `size`), add `maxFontSizeMultiplier` presets, convert fixed `h-*` text containers to `min-h-*`; test at 200% | M-02 | M |
| T4 | Colour token pass in `global.css`, `Colors.tsx`, `feedTheme.ts` (Section 2 values); gold-as-text token; darken gradients; chip text colour | M-03, M-04, M-05, M-06 | M |
| T5 | `InlineMessage` component (alert + live region), swap into the 17 sites; focus-to-first-error helper | M-11 | M |
| T6 | Screen-reader names pass: Login button, label composition for ticket status/room card/Settings `Row`/`SheetRow`, tab `tabBarAccessibilityLabel`, label-in-name fixes, Switch label+row role | M-01, M-07, M-09, M-10, m-07 | M |
| T7 | BottomSheet/Dialog a11y: focus + announce on open, hide scrim and Lottie from AT, single close, handle semantics | M-12, m-12 | M |
| T8 | Nested-control audit on Notifications rows and PartyRoomCard (use `accessibilityActions`); verify on iOS VoiceOver | M-08 | M |
| T9 | Touch-target sweep: shared `min-h-12` rule and hitSlop on the Section M-13 list | M-13 | M |
| T10 | Confirmation/undo: `UndoSnackbar` + delete-comment/vibe-note/room-message flows; replace `Alert.alert` with `showDialog` | M-15, m-13 | M |
| T11 | Onboarding: logout escape on step 0, skippable steps, persisted draft, focus/announce per step, status bar | M-16, m-02, m-14 | L |
| T12 | Android keyboard verification and fix (4 screens) | M-14 | S |
| T13 | Error mapping + NetInfo offline banner + friendly copy; replace message regex | M-18 | L |
| T14 | Remove or flag dead call buttons; render Delete account independent of settings | M-17 | S |
| T15 | Reduced-motion for Login border and tab bar; stop loops after 5 s | m-01 | S |
| T16 | i18n decision + minimum: language row wired to `settings.language`, shared language codes, remove `'en-US'`, logical spacing | M-19 | L (S for the minimum) |
| T17 | Copy/terms sheet and apply (Retry, Close/Done, Organiser/Organizer, party/room) | m-10 | S |
| T18 | PostCard semantics, counters live region, alt text field, text size floor | m-04, m-05, m-08 | M |

Suggested order: T1, T2, T3, T4 (visual blockers/majors), then T5-T9 (assistive tech), then T10-T14 (flows), then T15-T18.

## 5. Not verified (needs a device)

- TalkBack/VoiceOver behaviour for M-08, M-12, the role `alert` on Android (M-11), `accessibilityViewIsModal` on Android, and whether `DialogHost` presents above an iOS `Modal`.
- Real pixel contrast on the gradient banner (position-dependent), and text clipping at 200% font scale (M-02).
- Keyboard overlap on Android (M-14), status-bar icon visibility (m-02), and exact fetch failure strings (M-18).
- Whether iOS is a shipping target (m-13); Play account-deletion policy status for M-17.
