import {apiRequest, apiRequestPage} from '../../core/api/apiClient';
import type {
  FollowListKind, FollowListUser, FollowResult, ProfileAccess, PublicUserProfile, UserContentItem,
  UserContentTab, UserGiftSummary, UserPage, UserReport,
} from './types';

const user = (userId: string) => `/users/${encodeURIComponent(userId)}`;

/**
 * `GET /users/:userId/profile` is live. Set this to false only to run against an older server, where the
 * route would 404 and read as "blocked"; the modal then works from the caller's preview and the paged endpoints.
 */
export const PUBLIC_PROFILE_ENDPOINT_ENABLED = true;

export const getUserProfile = (userId: string) =>
  apiRequest<PublicUserProfile>(`${user(userId)}/profile`, {auth: 'required'});

export const followUser = (userId: string) =>
  apiRequest<FollowResult>(`${user(userId)}/follow`, {auth: 'required', method: 'POST'});

export const unfollowUser = (userId: string) =>
  apiRequest<FollowResult>(`${user(userId)}/follow`, {auth: 'required', method: 'DELETE'});

export async function getFollowList(userId: string, kind: FollowListKind, offset = 0, limit = 20): Promise<UserPage<FollowListUser>> {
  const response = await apiRequestPage<FollowListUser[]>(`${user(userId)}/${kind}?limit=${limit}&offset=${offset}`, {auth: 'required'});
  return {items: response.data, hasMore: response.meta.hasMore, offset: response.meta.offset};
}

export async function getUserContentPage(userId: string, tab: UserContentTab, offset = 0): Promise<UserPage<UserContentItem>> {
  const response = await apiRequestPage<UserContentItem[]>(`${user(userId)}/${tab}?limit=20&offset=${offset}`, {auth: 'required'});
  return {items: response.data, hasMore: response.meta.hasMore, offset: response.meta.offset};
}

export const getUserGiftSummary = (userId: string) =>
  apiRequest<UserGiftSummary>(`${user(userId)}/gift-summary`, {auth: 'required'});

export const blockUser = (userId: string) =>
  apiRequest<void>(`${user(userId)}/block`, {auth: 'required', method: 'POST'});

export const unblockUser = (userId: string) =>
  apiRequest<void>(`${user(userId)}/block`, {auth: 'required', method: 'DELETE'});

export const reportUser = (userId: string, reason: string, details?: string) => {
  const body: UserReport = {targetType: 'user', targetId: userId, reason, ...(details ? {details} : {})};
  return apiRequest<{id: string; status: string}>('/reports', {auth: 'required', method: 'POST', body: JSON.stringify(body)});
};

/**
 * Who the viewer follows, used to seed Follow/Following buttons because list rows carry no
 * `isFollowing`. Capped so a huge following list can't stall the UI; beyond the cap a row reads
 * "Follow", and pressing it is harmless because follow is idempotent.
 */
export async function getViewerFollowingIds(viewerId: string, maxPages = 5): Promise<Set<string>> {
  const ids = new Set<string>();
  let offset = 0;
  for (let page = 0; page < maxPages; page++) {
    const result = await getFollowList(viewerId, 'following', offset, 100);
    result.items.forEach(item => ids.add(item.id));
    if (!result.hasMore || !result.items.length) break;
    offset = result.offset + result.items.length;
  }
  return ids;
}

export const statusOf = (error: unknown) => (error as {status?: number})?.status;
export const messageOf = (error: unknown) => (error as {message?: string})?.message || 'Please try again.';

export const accessOf = (error: unknown): ProfileAccess | null =>
  statusOf(error) === 403 ? 'private' : statusOf(error) === 404 ? 'unavailable' : null;
