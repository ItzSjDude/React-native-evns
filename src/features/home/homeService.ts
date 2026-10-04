import {apiRequest, apiRequestPage} from '../../core/api/apiClient';
import type {HomeComment} from './types';

const postPath = (postId: string) => `/posts/${encodeURIComponent(postId)}`;

export const likePost = (postId: string) => apiRequest<{id: string}>(`${postPath(postId)}/reactions`, {
  auth: 'required', method: 'POST', body: JSON.stringify({emoji: '❤️'}),
});

export const unlikePost = (postId: string) => apiRequest<void>(`${postPath(postId)}/reactions/%E2%9D%A4%EF%B8%8F`, {
  auth: 'required', method: 'DELETE',
});

export const getPostComments = async (postId: string): Promise<HomeComment[]> => {
  const page = await apiRequestPage<HomeComment[]>(`${postPath(postId)}/comments?limit=100&offset=0`, {auth: 'required'});
  return page.data;
};

export const addPostComment = (postId: string, body: string) => apiRequest<HomeComment>(`${postPath(postId)}/comments`, {
  auth: 'required', method: 'POST', body: JSON.stringify({body}),
});
