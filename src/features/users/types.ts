/** What a caller already knows about a person (feed author, room participant, nearby row). */
export type UserPreview = {name: string; avatarUrl: string | null; handle?: string | null};

/**
 * Another user's public profile. Today the client only has `UserPreview` plus what the paged
 * endpoints reveal; the rest arrives once the backend ships `GET /users/:userId/profile`.
 */
export type PublicUserProfile = {
  id: string;
  name: string;
  handle: string | null;
  avatarUrl: string | null;
  bio: string | null;
  city: string | null;
  interests: string[];
  coverImageUrl?: string | null;
  isPrivate: boolean;
  isFollowing: boolean;
  followsYou?: boolean;
  stats: {followers: number; following: number; posts: number; giftsReceived: number};
};

/** `POST|DELETE /users/:userId/follow` */
export type FollowResult = {userId: string; isFollowing: boolean; followers: number};

export type FollowListKind = 'followers' | 'following';

/** Row of `GET /users/:userId/followers|following`. */
export type FollowListUser = {id: string; name: string; handle: string | null; avatarUrl: string | null; followedAt: string};

export type UserContentTab = 'posts' | 'parties' | 'events';

export type UserPost = {
  id: string;
  body: string | null;
  createdAt: string;
  media: {url: string; type: string}[];
  author: {id: string; name: string; avatarUrl: string | null};
  reactions: {likeCount: number; viewerHasLiked: boolean};
  commentCount: number;
};

export type UserParty = {
  id: string;
  title: string;
  kind: string;
  status: string;
  scheduled_start_at: string | null;
  participant_count: number;
};

export type UserEvent = {
  id: string;
  title: string;
  cover_url: string | null;
  starts_at: string;
  venue: string | null;
  status: string;
  attendee_count: number;
};

export type UserContentItem = UserPost | UserParty | UserEvent;

export type UserPage<T> = {items: T[]; hasMore: boolean; offset: number};

export type UserGiftSummary = {
  totalReceived: number;
  byGift: {type: string; name: string; count: number}[];
  topSupporters: {id: string; name: string; avatarUrl: string | null; total: number}[];
};

/** `POST /reports` body for a user target. */
export type UserReport = {targetType: 'user'; targetId: string; reason: string; details?: string};

/** 403 = private profile you don't follow; 404 = blocked, deleted or suspended. */
export type ProfileAccess = 'open' | 'private' | 'unavailable';
