export type ProfileTab = 'posts' | 'parties' | 'events';

export type UserProfile = {
  id: string;
  name: string;
  email: string;
  avatar_url: string | null;
  cover_image_url: string | null;
  handle: string | null;
  bio: string | null;
  interests: string[];
  city: string | null;
  created_at?: string;
  /** followers and giftsReceived arrive once the profile-settings backend is deployed. */
  stats: {following: number; hosted: number; posts: number; followers?: number; giftsReceived?: number};
};

export type ProfileResponse = {user: UserProfile} & UserProfile;

export type ProfileUpdate = {
  name?: string;
  handle?: string;
  bio?: string | null;
  city?: string | null;
  interests?: string[];
  /** https `fileUrl` from `uploadMedia(file, 'avatar')`; null removes the photo. */
  avatarUrl?: string | null;
  /** https `fileUrl` from `uploadMedia(file, 'misc')`; null removes the cover. */
  coverImageUrl?: string | null;
};

export type ProfilePost = {
  id: string;
  body: string | null;
  createdAt: string;
  media: {url: string; type: string}[];
  author: {id: string; name: string; avatarUrl: string | null};
  reactions: {likeCount: number; viewerHasLiked: boolean};
  commentCount: number;
};

export type ProfileParty = {
  id: string;
  title: string;
  kind: string;
  status: string;
  scheduled_start_at: string | null;
  participant_count: number;
};

export type ProfileEvent = {
  id: string;
  title: string;
  cover_url: string | null;
  starts_at: string;
  venue: string | null;
  status: string;
  attendee_count: number;
};

export type LocationVisibility = {visible: boolean};

export type ProfileItem = ProfilePost | ProfileParty | ProfileEvent;
export type ProfilePage<T> = {items: T[]; hasMore: boolean; offset: number};

export type SeatInvitesFrom = 'everyone' | 'followers' | 'nobody';
export type UserSettings = {
  notifyFollowedLive: boolean;
  notifyGiftsMentions: boolean;
  joinMuted: boolean;
  hideOnlineStatus: boolean;
  privateProfile: boolean;
  seatInvitesFrom: SeatInvitesFrom;
  language: 'en' | 'hi' | 'hinglish';
};

export type BlockedUser = {id: string; name: string; handle: string | null; avatarUrl: string | null; blockedAt: string};

export type GiftSummary = {
  totalReceived: number;
  byGift: {type: string; name: string; count: number}[];
  topSupporters: {id: string; name: string; avatarUrl: string | null; total: number}[];
};
