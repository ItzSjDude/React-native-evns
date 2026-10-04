import {apiRequest, apiRequestPage} from '../../core/api/apiClient';
import type {ApiPost, CreatePostInput, HomeComment, PostFeed} from './types';

const postPath = (postId: string) => `/posts/${encodeURIComponent(postId)}`;

const logResponse = <T>(operation: string, response: T): T => {
  console.log(`[posts] ${operation} response`, response);
  return response;
};

export const getPostFeed = async (limit = 20, cursor?: string | null): Promise<PostFeed> => {
  const query = new URLSearchParams({limit: String(limit)});
  if (cursor) query.set('cursor', cursor);
  return logResponse('GET /posts/feed', await apiRequest<PostFeed>(`/posts/feed?${query.toString()}`, {auth: 'required'}));
};

export const createPost = async (input: CreatePostInput): Promise<ApiPost> => logResponse(
  'POST /posts', await apiRequest<ApiPost>('/posts', {
    auth: 'required', method: 'POST', body: JSON.stringify(input),
  }),
);

export const getPost = async (postId: string): Promise<ApiPost> => logResponse(
  'GET /posts/:id', await apiRequest<ApiPost>(postPath(postId), {auth: 'required'}),
);

export const deletePost = async (postId: string): Promise<void> => {
  await apiRequest<void>(postPath(postId), {auth: 'required', method: 'DELETE'});
  console.log('[posts] DELETE /posts/:id response', undefined);
};

export const likePost = async (postId: string) => logResponse(
  'POST /posts/:id/reactions/like', await apiRequest<ApiPost['reactions']>(`${postPath(postId)}/reactions/like`, {
    auth: 'required', method: 'POST',
  }),
);

export const unlikePost = async (postId: string) => logResponse(
  'DELETE /posts/:id/reactions/like', await apiRequest<ApiPost['reactions']>(`${postPath(postId)}/reactions/like`, {
    auth: 'required', method: 'DELETE',
  }),
);

export const getPostComments = async (postId: string): Promise<HomeComment[]> => {
  const response = await apiRequestPage<HomeComment[]>(`${postPath(postId)}/comments?limit=100&offset=0`, {auth: 'required'});
  return logResponse('GET /posts/:id/comments', response.data);
};

export const addPostComment = async (postId: string, body: string): Promise<HomeComment> => logResponse(
  'POST /posts/:id/comments', await apiRequest<HomeComment>(`${postPath(postId)}/comments`, {
    auth: 'required', method: 'POST', body: JSON.stringify({body}),
  }),
);
