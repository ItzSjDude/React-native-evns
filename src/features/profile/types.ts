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
  stats: {following: number; hosted: number; posts: number};
};

export type ProfileResponse = {user: UserProfile} & UserProfile;

export type ProfileUpdate = {
  name?: string;
  handle?: string;
  bio?: string | null;
  city?: string | null;
  interests?: string[];
};

export type ProfilePost = {
  id: string;
  body: string | null;
  createdAt: string;
  media: unknown[];
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

export type ProfileItem = ProfilePost | ProfileParty | ProfileEvent;
export type ProfilePage<T> = {items: T[]; hasMore: boolean; offset: number};
