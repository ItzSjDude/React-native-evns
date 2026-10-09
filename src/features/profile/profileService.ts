import {apiRequest, apiRequestPage} from '../../core/api/apiClient';
import type {BlockedUser, GiftSummary, LocationVisibility, UserSettings, ProfileEvent, ProfilePage, ProfileParty, ProfilePost, ProfileResponse, ProfileTab, ProfileUpdate, UserProfile} from './types';

export const getMyProfile = async (): Promise<UserProfile> => {
  const response = await apiRequest<ProfileResponse>('/auth/me', {auth: 'required'});
  return response.user;
};

export const updateMyProfile = async (input: ProfileUpdate): Promise<UserProfile> => {
  const response = await apiRequest<ProfileResponse>('/auth/me', {
    auth: 'required', method: 'PATCH', body: JSON.stringify(input),
  });
  return response.user;
};

export async function getProfilePage(
  userId: string,
  tab: 'posts',
  offset?: number,
): Promise<ProfilePage<ProfilePost>>;
export async function getProfilePage(
  userId: string,
  tab: 'parties',
  offset?: number,
): Promise<ProfilePage<ProfileParty>>;
export async function getProfilePage(
  userId: string,
  tab: 'events',
  offset?: number,
): Promise<ProfilePage<ProfileEvent>>;
export async function getProfilePage(
  userId: string,
  tab: ProfileTab,
  offset?: number,
): Promise<ProfilePage<ProfilePost | ProfileParty | ProfileEvent>>;
export async function getProfilePage(
  userId: string,
  tab: ProfileTab,
  offset = 0,
): Promise<ProfilePage<ProfilePost | ProfileParty | ProfileEvent>> {
  const response = await apiRequestPage<(ProfilePost | ProfileParty | ProfileEvent)[]>(
    `/users/${encodeURIComponent(userId)}/${tab}?limit=20&offset=${offset}`,
    {auth: 'required'},
  );
  return {items: response.data, hasMore: response.meta.hasMore, offset: response.meta.offset};
}

export const getNearbyVisibility = () =>
  apiRequest<LocationVisibility>('/me/visibility', {auth: 'required'});

export const setNearbyVisibility = (visible: boolean) =>
  apiRequest<LocationVisibility>('/me/visibility', {auth: 'required', method: 'POST', body: JSON.stringify({visible})});

export const getMySettings = () => apiRequest<UserSettings>('/me/settings', {auth: 'required'});

export const updateMySettings = (patch: Partial<UserSettings>) =>
  apiRequest<UserSettings>('/me/settings', {auth: 'required', method: 'PATCH', body: JSON.stringify(patch)});

export const getBlockedUsers = () => apiRequest<BlockedUser[]>('/users/blocked/details', {auth: 'required'});

export const unblockUser = (userId: string) =>
  apiRequest<void>(`/users/${encodeURIComponent(userId)}/block`, {auth: 'required', method: 'DELETE'});

export const getGiftSummary = (userId: string) =>
  apiRequest<GiftSummary>(`/users/${encodeURIComponent(userId)}/gift-summary`, {auth: 'required'});

export const deleteMyAccount = () =>
  apiRequest<{deleted: boolean}>('/auth/me', {auth: 'required', method: 'DELETE', body: JSON.stringify({confirm: 'DELETE'})});
