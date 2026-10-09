import {apiRequest} from '../../../core/api/apiClient';
import type {AgeInfo, AuthMeResponse, AuthUser} from '../types';

/** Reads age fields from either the top level or `user`; absent on servers without the age gate. */
export function ageInfoOf(response: AuthMeResponse | null | undefined): AgeInfo {
  const user = response?.user;
  const ageStatus = user?.ageStatus ?? response?.ageStatus;
  const dateOfBirthSet = user?.dateOfBirthSet ?? response?.dateOfBirthSet;
  return {
    ...(ageStatus ? {ageStatus} : {}),
    ...(typeof dateOfBirthSet === 'boolean' ? {dateOfBirthSet} : {}),
  };
}

export function userOf(response: AuthMeResponse): Partial<AuthUser> {
  const {user, ...top} = response;
  return {...top, ...user};
}

export const fetchMe = () => apiRequest<AuthMeResponse>('/auth/me', {auth: 'required'});

/** `PATCH /auth/me {dateOfBirth}`; accepted once, then the server answers 400 `DOB_LOCKED`. */
export const submitDateOfBirth = (isoDate: string) =>
  apiRequest<AuthMeResponse>('/auth/me', {auth: 'required', method: 'PATCH', body: JSON.stringify({dateOfBirth: isoDate})});

export const deleteAccount = () =>
  apiRequest<{deleted: boolean}>('/auth/me', {auth: 'required', method: 'DELETE', body: JSON.stringify({confirm: 'DELETE'})});
