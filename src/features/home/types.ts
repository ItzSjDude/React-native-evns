/**
 * API contracts mirror gathr-api `post.service.js#publicPost` and
 * `validators/post.schema.js`. Keep them in sync with the backend.
 */

/** `post.schema.js#create` body max length. */
export const POST_BODY_MAX_LENGTH = 2000;
/** Comment body limit agreed with the backend comments contract. */
export const COMMENT_BODY_MAX_LENGTH = 500;
/** `post.schema.js#feed` default/max are 20/50. */
export const FEED_PAGE_SIZE = 20;
export const COMMENTS_PAGE_SIZE = 20;

export type ApiPostAuthor = {id: string; name: string; avatarUrl: string | null};

export type ApiPostMedia = {url: string; type: 'IMAGE'};

export type ApiPostReactions = {likeCount: number; viewerHasLiked: boolean};

export type ApiPost = {
  id: string;
  body: string | null;
  media: ApiPostMedia[];
  visibility: 'PUBLIC' | string;
  createdAt: string;
  updatedAt: string;
  author: ApiPostAuthor;
  reactions: ApiPostReactions;
  /** Optional until the comments backend ships everywhere. */
  commentCount?: number;
  shareCount?: number;
};

/** `GET /posts/feed` data (cursor paginated, not the offset `meta` envelope). */
export type ApiFeedResponse = {
  posts: ApiPost[];
  page: {limit: number; hasMore: boolean; nextCursor: string | null};
};

export type CreatePostInput = {body?: string; media?: ApiPostMedia[]};

export type HomeComment = {
  id: string;
  body: string;
  createdAt: string;
  author: ApiPostAuthor;
};

export type HomeCommentPage = {items: HomeComment[]; hasMore: boolean; offset: number};

/** UI model for one feed item. `time` is derived at render from `createdAt`. */
export type HomePost = {
  id: string;
  authorId: string;
  author: string;
  authorAvatarUrl: string | null;
  createdAt: string;
  content: string;
  images: string[];
  likes: number;
  likedByViewer: boolean;
  comments: number;
  shares: number;
  /** True while an optimistic post is waiting for the server. */
  pending?: boolean;
};

export type HomeFeedPage = {posts: HomePost[]; hasMore: boolean; nextCursor: string | null};
