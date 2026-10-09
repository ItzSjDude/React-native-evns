import {apiRequest} from '../../../core/api/apiClient';
import type {OnboardingProfile, OnboardingProfileResponse, OnboardingProfileUpdate} from './types';

export async function getOnboardingProfile(): Promise<OnboardingProfile> {
  const response = await apiRequest<OnboardingProfileResponse>('/auth/me', {auth: 'required'});
  return response.user ?? response;
}

export async function saveOnboardingProfile(input: OnboardingProfileUpdate): Promise<OnboardingProfile> {
  const response = await apiRequest<OnboardingProfileResponse>('/auth/me', {
    auth: 'required', method: 'PATCH', body: JSON.stringify(input),
  });
  return response.user ?? response;
}
