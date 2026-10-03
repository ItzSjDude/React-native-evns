import {apiRequest, apiRequestPage} from '../../core/api/apiClient';
import type {ProfileEvent, ProfilePage, ProfileParty, ProfilePost, ProfileResponse, ProfileTab, ProfileUpdate, UserProfile} from './types';

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
