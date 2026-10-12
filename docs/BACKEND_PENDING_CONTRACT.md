# gathr-api: pending work for the Hiva app

This is the backend work the Hiva app is waiting on, as of 2026-10-11, against gathr-api `main` at
`5ecd653`. The app side of each item is already built, or is noted below.

## 1. Review and own PR #30: grouped likes, push images, party title

PR: https://github.com/ItzSjDude/gathr-api/pull/30 (`fix/notification-polish` → `main`).
It was opened from the app side. Please review it as your own work: merge it, change it, or close
it and implement this spec yourself.

### 1a. Grouped `POST_LIKED`

- While the post author still has an **unread** `POST_LIKED` row for a post, a new like
  **updates that row** instead of inserting another.
  - `title`: `"<newest liker> and <N> other(s) liked your post"`. Use "other" when N = 1.
  - `data.actorId`, `actorName` and `actorAvatarUrl` become the newest liker's. If the newest liker
    has no avatar, remove `actorAvatarUrl` rather than keeping the previous liker's.
  - `data.actorCount`: number of distinct likers in the group (a number in REST, a string over FCM).
  - `data.actorIds`: the most recent liker ids, newest first, capped at 50.
  - `created_at = now()`, so the row moves back to the top. `read_at` stays `null`.
- If the liker is already in `data.actorIds`, for example after unlike → like: **no change and no
  push**.
- Once the author has read the row, the next like **starts a new group**: insert as today, with
  `dedupeKey: post-like:<postId>:<likerId>`.
- Realtime and push are sent only when a row was actually inserted or updated.
- Comments and follows are **not** grouped.

### 1b. Push picture

- In the FCM v1 message, set `notification.image` and `apns.fcm_options.image` to `data.imageUrl`,
  or `data.actorAvatarUrl` when there is no image. Use https URLs only; leave the field out otherwise.

### 1c. Party invite title

- `"<host> started an audio party"`. Video stays `"… started a video party"`. Today the audio title
  reads "a audio".

### Done when

- [ ] `npm test` passes, including the DB suites. These weren't run when the PR was made, because the
  test Postgres needs PostGIS.
- [ ] Liking a post with three different users while it is unread gives one row:
  "C and 2 others liked your post", `actorCount: 3`.
- [ ] A repeat liker changes nothing and sends no push.
- [ ] After the row is marked read, the next like creates a new row.
- [ ] An Android push for a liked image post shows the post image.

## 2. (Optional) Make like-grouping race-safe

If two **first** likes arrive at the same moment with no unread row yet, both can insert. If that
matters, add a partial unique index and fold on conflict:

```sql
CREATE UNIQUE INDEX IF NOT EXISTS uq_notifications_unread_post_like
  ON notifications (user_id, (data->>'postId'))
  WHERE type = 'POST_LIKED' AND read_at IS NULL;
```

Done when two likes sent in parallel end up as one row with `actorCount: 2`.

## 3. Open a comment that isn't on the first page

The app now scrolls to and highlights `data.commentId` when you tap a `POST_COMMENTED`
notification, but only when that comment is in the first page it loads (`limit=20`, oldest
first). For a comment further down, the app needs to load the page that contains it.

### Request

```http
GET /posts/:postId/comments?aroundCommentId=<commentId>&limit=20
```

- `aroundCommentId` is optional. When it's set, ignore `offset` and return the page that contains
  that comment, using the same ordering (`created_at ASC, id ASC`), the same block filtering and the
  same deleted-comment rules as today.
- Page start: `offset = floor(index / limit) * limit`, where `index` is the comment's 0-based
  position among the comments this viewer can see.

### Response

This is the existing envelope plus `meta.focusIndex`:

```json
{
  "success": true,
  "data": [ /* comments, same shape as today */ ],
  "meta": { "limit": 20, "offset": 40, "hasMore": true, "focusIndex": 3 }
}
```

- `meta.offset` is the page start that was actually used.
- `meta.focusIndex` is the comment's position within `data` (0-based).
- If the comment is missing, deleted or hidden from this viewer, answer as if `aroundCommentId` was
  not sent: first page, no `focusIndex`. Don't return 404.

### Done when

- [ ] Comment #45 of 60 with `limit=20` returns `offset: 40`, `focusIndex: 4` (or as computed),
  and `hasMore: true`.
- [ ] A deleted or blocked comment id falls back to the first page.
- [ ] Without `aroundCommentId`, behaviour is unchanged.

Once this ships, the app will use `meta.offset` and `meta.focusIndex`, and add "Load earlier comments".

## Not backend work (for reference)

- On iOS, push images also need a Notification Service Extension in the app. That is app-side work
  and will be done separately.
