# gathr-api: Explore tab and Hiva Plus paywall

The app's Explore tab and paywall were redesigned (2026-10-13). Most of it is app-only, but a few things
need backend work before the app can stop using static placeholders. Everything below was checked against
`gathr-api` `main`.

## What already works (no backend work)

| App feature | Existing backend |
|---|---|
| Pin up to 5 chats and sort into folders | `MAX_PINS = 5` in `conversationInbox.service.js` (409 past 5, 403 `PLUS_REQUIRED` for free) |
| Optional Plus badge | `showPlusBadge` in `/me/settings` |
| "Drop a vibe" | existing vibe-note endpoints |
| "Say hi!" | existing start-direct-conversation endpoint |
| Eye button (visibility) | `GET/POST /me/visibility` |
| 403 `PLUS_REQUIRED` for Plus-only filters | `location.service.js` |

The location-permission gate, header buttons and paywall layout are app-only.

## 1. `GET /nearby`: return `bio` and `gender`

Explore cards show a name, a gender icon and a one-line bio. Today each row is only
`{id, name, avatarUrl, distance...}` (`location.repository.js` selects `u.id, u.name, u.avatar_url`), so the
app renders static cards.

Add to every person in the response (and to `GET /users/search` rows if they share the shape):

| Field | Type | Notes |
|---|---|---|
| `bio` | string \| null | From `users.bio` (max 240). `null` when unset |
| `gender` | `male` \| `female` \| `non_binary` \| `prefer_not_to_say` \| null | Depends on the `gender` field from `docs/ONBOARDING_PROFILE_FIELDS_CONTRACT.md`. No `gender` column exists on `main` yet, so ship that contract first |

Rules:
- Respect the existing privacy rules (private profiles, blocks). Do not add anything else about the person.
- `prefer_not_to_say` and `null` are shown with no gender icon.

## 2. `GET /nearby`: radius range

The Explore chips are **10 km, 20 km, 40 km** (free) and **60+ km** (Plus, locked for free users).
`nearbyQuery` caps `radiusMeters` at **25000**, so 40 km and 60+ km are rejected today.

- Raise the cap: free users up to **40000** m, Plus users up to **100000** m (backend dev may pick a
  different Plus ceiling, tell the app).
- A free user sending `radiusMeters > 40000` gets `403 PLUS_REQUIRED` (same error the filters use).
- The app sends `100000` for the "60+ km" chip and `10000` / `20000` / `40000` for the others.
- Keep the default (2000) and the minimum so existing callers are unaffected.

## 3. Paywall: add a `weekly` plan

The paywall shows **Weekly, Monthly, Yearly** (tags: Monthly "Best Value", Yearly "Popular"). The plan list
comes from `GET /me/subscription` `plans`, built from config `subscriptions.base_plan_ids`, default
`monthly,yearly`.

- Create a `weekly` base plan (billing period `P1W`) under the existing product `hiva_plus` in Play Console.
- Set `subscriptions.base_plan_ids` to `weekly,monthly,yearly` (the app renders them in the order returned).
- Check the Play verification path accepts the new base plan (`validateCanonical` allow-list) and that
  renewal/expiry handling works for a weekly period.

Until this ships the paywall shows Monthly and Yearly from Play, plus static placeholders when Play can't load.

## 4. Paywall: expose both tiers' limits

The paywall quotes "40 new chats a day, up from 5 on free" and "10 vibe notes valid for 24h, up from 2 valid
for 4h". The app can't read these: `GET /me/subscription` `limits` only has the caller's **current** tier, and
the Plus numbers only appear in a 429 `LIMIT_REACHED` (`plusMax`). The app therefore hardcodes
`FREE_DEFAULTS` / `PLUS_DEFAULTS` in `src/features/plus/pricing.ts`.

They also disagree with the server: `free_dm_starts_per_day` defaults to **10**, the paywall says **5**.

Do one of:
- **Recommended:** add both tiers to `GET /me/subscription`:
  ```json
  {
    "limits": { "...": "unchanged, the caller's current tier" },
    "tiers": {
      "free": { "dmStartsPerDay": 5, "vibeNotesPerDay": 2, "vibeNoteMaxMinutes": 240, "randomMatchesPerDay": 5 },
      "plus": { "dmStartsPerDay": 40, "vibeNotesPerDay": 10, "vibeNoteMaxMinutes": 1440, "randomMatchesPerDay": 5 }
    }
  }
  ```
  The app will then drop its hardcoded numbers.
- Or set `subscriptions.free_dm_starts_per_day` to 5 so the current copy is true.

## 5. Advanced Filters: two filters named in the paywall do not exist

Paywall copy: "Filter by City, languages, age range, active now, similar interests, and more".
`GET /nearby` supports `city`, `language`, `activeNow` and a single `interest`. Missing:

| Filter | Proposed query | Rules |
|---|---|---|
| Age range | `minAge`, `maxAge` (ints, 18-99) | Plus only (`403 PLUS_REQUIRED`). Needs a stored date of birth; people with no known age are excluded when either is set. Never return a date of birth or exact age |
| Similar interests | `similarInterests=true` | Plus only. Only people sharing at least one interest with the caller. Today `interest` needs a named interest |

If you don't want to build these, tell the app team and the copy will be reworded to what exists.

## Done when

- [ ] `/nearby` rows include `bio` and `gender` (null-safe), `GET /users/search` too if shared
- [ ] `/nearby` accepts `radiusMeters` up to 40000 free and up to the Plus ceiling for Plus; 403 `PLUS_REQUIRED` above 40000 for free
- [ ] `weekly` base plan created in Play Console, listed first in `subscriptions.base_plan_ids`, verified and renewed correctly
- [ ] `GET /me/subscription` returns `tiers.free` and `tiers.plus` (or free DM limit set to 5)
- [ ] Age range and similar-interests filters added, or the team confirms the copy changes
- [ ] Tests for the radius gate, the new fields and the weekly plan
