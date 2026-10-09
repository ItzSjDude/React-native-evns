import {apiRequest, apiRequestPage} from '../../core/api/apiClient';
import {
  COMMENTS_PAGE_SIZE,
  FEED_PAGE_SIZE,
  type ApiFeedResponse,
  type ApiPost,
  type ApiPostMedia,
  type ApiPostReactions,
  type CreatePostInput,
  type HomeComment,
  type HomeCommentPage,
  type HomeFeedPage,
  type HomePost,
} from './types';

const postPath = (postId: string) => `/posts/${encodeURIComponent(postId)}`;

export const mapPost = (post: ApiPost): HomePost => ({
  id: post.id,
  authorId: post.author.id,
  author: post.author.name || 'Someone',
  authorAvatarUrl: post.author.avatarUrl ?? null,
  authorIsPlus: post.author.isPlus ?? false,
  createdAt: post.createdAt,
  content: post.body ?? '',
  // Older clients saved device-local file:// paths instead of uploaded URLs; those can never load for other viewers.
  images: (post.media ?? []).filter(item => item.type === 'IMAGE' && /^https?:\/\//i.test(item.url)).map(item => item.url),
  likes: post.reactions?.likeCount ?? 0,
  likedByViewer: post.reactions?.viewerHasLiked ?? false,
  comments: post.commentCount ?? 0,
  shares: post.shareCount ?? 0,
});

export type FeedScope = 'all' | 'following';

/** `scope=following` limits the feed to people the viewer follows (the Following tab); `all` is everyone. */
export const getFeedPage = async (cursor?: string | null, limit = FEED_PAGE_SIZE, scope: FeedScope = 'all'): Promise<HomeFeedPage> => {
  const query = `limit=${limit}${scope === 'following' ? '&scope=following' : ''}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
  const response = await apiRequest<ApiFeedResponse>(`/posts/feed?${query}`, {auth: 'required'});
  return {
    posts: response.posts.map(mapPost),
    hasMore: response.page.hasMore,
    nextCursor: response.page.nextCursor,
  };
};

/**
 * `POST /posts` needs text and/or media. Empty text is omitted (the schema
 * rejects ""), and media must be the https `fileUrl`s from `uploadMedia`.
 */
export const createPost = async (body: string, media: ApiPostMedia[] = []): Promise<HomePost> => {
  const text = body.trim();
  const input: CreatePostInput = {...(text ? {body: text} : {}), ...(media.length ? {media} : {})};
  const post = await apiRequest<ApiPost>('/posts', {auth: 'required', method: 'POST', body: JSON.stringify(input)});
  return mapPost(post);
};

export const reportPost = (postId: string, reason: string) => apiRequest<{id: string}>('/reports', {
  auth: 'required', method: 'POST', body: JSON.stringify({targetType: 'post', targetId: postId, reason}),
});

export const getPost = async (postId: string): Promise<HomePost> => mapPost(await apiRequest<ApiPost>(postPath(postId), {auth: 'required'}));

export const deletePost = (postId: string) => apiRequest<void>(postPath(postId), {auth: 'required', method: 'DELETE'});

export const likePost = (postId: string) => apiRequest<ApiPostReactions>(`${postPath(postId)}/reactions/like`, {
  auth: 'required', method: 'POST',
});

export const unlikePost = (postId: string) => apiRequest<ApiPostReactions>(`${postPath(postId)}/reactions/like`, {
  auth: 'required', method: 'DELETE',
});

export const getPostComments = async (postId: string, offset = 0, limit = COMMENTS_PAGE_SIZE): Promise<HomeCommentPage> => {
  const page = await apiRequestPage<HomeComment[]>(`${postPath(postId)}/comments?limit=${limit}&offset=${offset}`, {auth: 'required'});
  return {items: page.data, hasMore: page.meta.hasMore, offset: page.meta.offset};
};

export const addPostComment = (postId: string, body: string) => apiRequest<HomeComment>(`${postPath(postId)}/comments`, {
  auth: 'required', method: 'POST', body: JSON.stringify({body}),
});

export const deletePostComment = (postId: string, commentId: string) => apiRequest<void>(
  `${postPath(postId)}/comments/${encodeURIComponent(commentId)}`,
  {auth: 'required', method: 'DELETE'},
);
