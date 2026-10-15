# Onboarding profile fields: backend contract

Onboarding collects these fields and sends them in the final `PATCH /auth/me` request.
The API needs migration `086_onboarding_profile_fields.sql` (gathr-api branch `feat/onboarding-profile-fields`) before the updated app is released.

## `PATCH /auth/me` (additional optional body fields)

| Field | Type | Allowed values |
|---|---|---|
| `gender` | string | `male`, `female`, `non_binary`, `prefer_not_to_say` |
| `country` | string | Country name, 1–80 chars; `null` clears it (app sends English names, e.g. `India`) |
| `profession` | string | 1-60 chars. Presets: `Student`, `Developer`, `Designer`, `Creator`, `Business`; otherwise free text |
| `intent` | string | `meet_nearby`, `join_parties`, `find_events`, `network`, `host_room`, `organise_events`, `chat`, `explore` |

Existing fields are unchanged: `name`, `handle`, `interests[]`, `avatarUrl`. `city` is no longer sent by onboarding.

## `GET /auth/me`
Return the four fields on the user object (`null` when unset), alongside the existing profile fields.

## Errors
Same shape as today: `400` with `details[].field` set to the field name (`gender`, `country`, `profession`, `intent`).
