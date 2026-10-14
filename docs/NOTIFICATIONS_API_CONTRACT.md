# Notifications display contract

This is what the Hiva app needs from gathr-api `/notifications` to render the notification list
with the sender's photo, a post thumbnail and inline actions ("Follow back", "Join", "Reply").

The app side ships already. Each key below is optional, and the app falls back to the current
type icon when one is missing, so the backend can roll these out one producer at a time.

Status against gathr-api `main` (`302e690`):

- No notification carries any information about the person who triggered it.
- Follows, post likes and post comments create no notifications at all.

## 1. Display keys in `data`

Add these keys to the `data` object you already pass to `notificationService.enqueue`. Nothing
else changes: same table, same list endpoint, same push path. `fcm.service.js` already turns
`data` values into strings for FCM, so the same keys reach the app over push too.

| Key | Type | Meaning |
|---|---|---|
| `actorId` | uuid string | The user who caused the notification. Required for "Follow back". |
| `actorName` | string | That user's display name at the time of the event. |
| `actorAvatarUrl` | https URL string | That user's `users.avatar_url`. Leave it out when the user has no photo. |
| `imageUrl` | https URL string | Thumbnail of the content the notification is about, e.g. the post's first image. Leave it out when there is none. |

Rules:

- Leave a key out rather than sending `null`, `""` or a placeholder.
- URLs must be absolute `https://`. The app ignores anything else, including old `file://` paths.
- Take a snapshot of the name and avatar when you enqueue. A later name or photo change will not
  update old rows, which is acceptable. It avoids a join on every list read and keeps push and list
  identical.
- Never set `actorId` to the recipient. Don't notify users about their own actions.

### Which existing producers should send them

| Type | Producer | `actorId` / `actorName` / `actorAvatarUrl` = | `imageUrl` |
|---|---|---|---|
| `PARTY_INVITE`, `PARTY_REMINDER` | `party.service.js` invite | the party host | – |
| `PARTY_SCHEDULED_START` | `party.service.js` `notifyScheduledStart` | the party host | – |
| `NEW_MESSAGE` | `chat.service.js` | the message sender | – |
| `PAYMENT_CARD_SHARED`, `PAYMENT_MARKED_PAID` | `chat.service.js` | the user who shared or marked the card | – |
| `PURCHASE_REQUESTED` | `event.service.js` | the buyer (already in `data.userId`) | event cover, if any |
| `USER_ARRIVED` | `arrival.service.js` | the user who arrived (already in `data.userId`) | – |
| `VIBE_NOTE_NEARBY` | `vibeNote.service.js` | the note's creator | – |

Event, ticket, credit, workspace and waitlist notifications come from the system, so they need no
actor fields. `imageUrl` may carry the event cover for those.

## 2. New social notification types

Add these to `NOTIFICATION_TYPE` in `src/constants`:

```js
USER_FOLLOWED: 'USER_FOLLOWED',
POST_LIKED: 'POST_LIKED',
POST_COMMENTED: 'POST_COMMENTED',
```

### `USER_FOLLOWED`

- **When:** `follow.service.js` `follow(followerId, targetId)` creates a new follow. Skip it if
  the follow already existed.
- **Recipient:** `targetId`.
- **Title:** `"<follower name> started following you"`. **Body:** `null`.
- **`data`:** `{ userId: followerId, actorId, actorName, actorAvatarUrl }`. The app opens the
  follower's profile using `userId`.
- **`dedupeKey`:** `follow:<followerId>`. Unfollowing and following again then can't spam the
  recipient.

### `POST_LIKED`

- **When:** `post.service.js` `setLike(postId, userId, true)` adds a like. Don't send one on unlike.
- **Recipient:** the post author. Skip it when the author liked their own post.
- **Title:** `"<liker name> liked your post"`. **Body:** `null`, or the first 80 characters of a
  text-only post.
- **`data`:** `{ postId, actorId, actorName, actorAvatarUrl, imageUrl }`. `imageUrl` is the
  `posts.media[0].url` of an `IMAGE` item; leave it out for text-only posts. The app opens the post
  using `postId`.
- **`dedupeKey`:** `post-like:<postId>:<likerId>`. Unlike followed by like then can't spam.
- **Grouping (gathr-api PR #30):** while the author has an unread `POST_LIKED` row for the post, a new
  liker updates it instead of adding one. The title becomes `"Asha and 2 others liked your post"`, the actor
  fields switch to the newest liker, `data.actorCount` holds the number of likers and `data.actorIds` the
  latest 50, and the row moves back to the top. A liker already counted changes nothing. After the row is
  read, the next like starts a new group.
- **Push image:** FCM sets `notification.image` to `imageUrl`, falling back to `actorAvatarUrl`.

### `POST_COMMENTED`

- **When:** `post.service.js` `addComment(postId, authorId, { body })` succeeds.
- **Recipient:** the post author. Skip it when authors comment on their own post.
- **Title:** `"<commenter name> commented on your post"`. **Body:** the comment, cut to 120
  characters.
- **`data`:** `{ postId, commentId, actorId, actorName, actorAvatarUrl, imageUrl }`.
- **`dedupeKey`:** none. Every comment is its own notification.

### Privacy

Before enqueuing a social notification, apply the same block check the feed uses. Never notify a
user about someone they have blocked, or who has blocked them.

## 3. Example list rows

```json
{
  "id": "6f1c…",
  "user_id": "<recipient>",
  "type": "POST_LIKED",
  "title": "Ravi Sharma liked your post",
  "body": null,
  "data": {
    "postId": "a91e…",
    "actorId": "3b77…",
    "actorName": "Ravi Sharma",
    "actorAvatarUrl": "https://cdn.example/avatars/3b77.webp",
    "imageUrl": "https://cdn.example/posts/a91e-0.webp"
  },
  "read_at": null,
  "created_at": "2026-10-12T09:30:00.000Z",
  "dedupe_key": "post-like:a91e…:3b77…"
}
```

```json
{
  "type": "PARTY_INVITE",
  "title": "Sachin Jangir started an audio party",
  "body": "Tap to join.",
  "data": {
    "partyId": "p12…",
    "kind": "AUDIO",
    "actorId": "u45…",
    "actorName": "Sachin Jangir",
    "actorAvatarUrl": "https://cdn.example/avatars/u45.webp"
  }
}
```

## 4. What the app does with each field

| Field present | App shows |
|---|---|
| `actorAvatarUrl` | The actor's round photo, with a small type badge. Without it, the type icon in a circle. |
| `imageUrl` | A square thumbnail on the right of the row. |
| `type = USER_FOLLOWED` + `actorId` | A "Follow back" button, which turns into "Following" once followed. Hidden when you already follow them. |
| `PARTY_INVITE`, `PARTY_SCHEDULED_START` | A "Join" button that opens the party. |
| `NEW_MESSAGE` | A "Reply" button that opens the conversation. |
| `USER_ARRIVED` | A "Say hi" button. |
| Event, ticket, waitlist and purchase types | A "View" button. |

The thumbnail takes priority over the action button, which takes priority over nothing. Tapping a
row or its button opens the existing deep-link target (`partyId`, `postId`, `conversationId`,
`eventId`, `userId`, `noteId`).

App reference: `src/features/notifications/types.ts` (`NotificationDisplayData`) and
`NotificationsSheet.tsx`.

## 5. Done when

- [ ] The producers in section 1 include the actor keys, with no `null`s and only https URLs.
- [ ] `USER_FOLLOWED`, `POST_LIKED` and `POST_COMMENTED` exist in `NOTIFICATION_TYPE` and are sent
  from `follow()`, `setLike(…, true)` and `addComment()`.
- [ ] No self-notifications, and none between blocked users.
- [ ] Unfollow followed by follow, and unlike followed by like, don't create duplicate rows (because of the `dedupeKey`).
- [ ] Push payloads carry the same keys, which already happens through `stringifyData`.
- [ ] Tests cover: a like creates one row for the author; a self-like creates none; a re-like
  creates no second row; a comment body over 120 characters is cut.
