# Inline ads requirements

## App placements

Use Google AdMob native ads, rendered in Hiva's card style with a visible **Sponsored** label and the provider's advertiser, media, and call-to-action assets.

- **Home → For you:** after each four organic posts (posts 4, 8, 12, …).
- **Explore → People:** after each four nearby people cards.
- **Explore → Passport people:** after each four city results, using the same people-list cadence.
- **Events lists:** after each four event cards. This applies to the Events view from Home and Explore.
- Count only organic content rows. Headers, loading indicators, empty/error states, ads, and section controls do not count. Keep cadence continuous over paginated results. Ads do not change post/event/person indexes, pagination cursors, or tap targets.
- An unfilled, failed, consent-blocked, or not-yet-configured slot collapses completely. Do not show a fake placeholder or reserve blank space.
- Load ads only when their card mounts, destroy the native ad when it unmounts, and do not load on private conversations, audio party screens, profiles, ticket check-in, or payout screens.
- The current app shows these placements to all signed-in tiers. If Plus should remove ads, that entitlement and the app rule need to be agreed before launch; it is not currently a Plus entitlement.

## Backend and account requirements

For **Google-served AdMob ads**, Hiva does not need to create ad inventory, campaign APIs, an ad table, or a custom ad-serving backend. AdMob selects and serves ads and provides impression/click reporting in its console. The app already gets feed/list content from the existing APIs; those APIs need no ad-specific response fields.

Before production, Hiva must:

1. Create/verify Hiva's AdMob publisher account and register the Android and iOS apps.
2. Create native ad units for the placements (one shared unit is possible; separate units make per-surface reporting clearer) and provide each platform's **App ID** and each placement's **Ad Unit ID** to the app team.
3. Replace the sample App IDs under `react-native-google-mobile-ads` in `app.json`, and set `android_native_ad_unit_id` / `ios_native_ad_unit_id` there. The current Google sample App IDs and native ad unit are for development testing only; production JavaScript intentionally requests no ads until real units are configured.
4. Complete store disclosures: Google Play's “contains ads” declaration and Data Safety form, and Apple's App Privacy details / applicable tracking disclosures. Configure Google UMP privacy messages for regions where consent is required. The app requests consent before SDK initialization and exposes **Profile → Settings → Privacy → Ad privacy choices**.
5. Confirm advertiser/content suitability, age audience and geographic restrictions for Hiva. Keep ads clearly separate from user posts and event listings; never disguise paid content as an organic card.
6. Verify test ads on physical devices, consent/no-consent behavior, no-fill/network failure, and release builds with real IDs before rollout. Do not click live ads during testing.

Use Google's test App IDs and `TestIds.NATIVE` only for local development. Do not request real ads on emulators or use production inventory while debugging.

## If Hiva wants to sell its own sponsored posts/events

That is a separate first-party promotion product, not AdMob. It needs backend campaign creation and review, advertiser/workspace eligibility, payment or credit billing, targeting and frequency caps, start/end times, moderation, impression/click accounting, reporting, and an authenticated API that returns a sponsored item with a clear `Sponsored` label. Do not insert organizer events into these AdMob slots as a shortcut; the existing monetization plan defers self-serve promotions.

## Acceptance checks

- Each placement appears after organic item 4, then every 4 organic items; pagination does not reset its count.
- Ad failure, no consent, offline state, or unconfigured production IDs leave no blank row and never hide an organic item.
- The native creative visibly identifies itself as sponsored, and its provider click/impression assets work.
- No ad request is made before consent permits requests or on excluded private/action screens.
