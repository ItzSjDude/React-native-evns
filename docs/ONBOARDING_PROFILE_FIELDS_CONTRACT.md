# Onboarding profile fields: backend contract

Onboarding now collects four extra fields. The app collects them but does **not** send them yet
(`SEND_PROFILE_EXTRAS = false` in `src/features/auth/onboarding/options.ts`) because `PATCH /auth/me`
would reject unknown keys. Flip the flag once this ships.

## `PATCH /auth/me` (additional optional body fields)

| Field | Type | Allowed values |
|---|---|---|
| `gender` | string | `male`, `female`, `non_binary`, `prefer_not_to_say` |
| `country` | string | Country name, max 80 chars (app sends English names, e.g. `India`) |
| `profession` | string | 1-60 chars. Presets: `Student`, `Developer`, `Designer`, `Creator`, `Business`; otherwise free text |
| `intent` | string | `meet_nearby`, `join_parties`, `find_events`, `network`, `host_room`, `organise_events`, `chat`, `explore` |

Existing fields are unchanged: `name`, `handle`, `interests[]`, `avatarUrl`. `city` is no longer sent by onboarding.

## `GET /auth/me`
Return the four fields on the user object (`null` when unset), alongside the existing profile fields.

## Errors
Same shape as today: `400` with `details[].field` set to the field name (`gender`, `country`, `profession`, `intent`).
