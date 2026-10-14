import {apiRequest} from '../../core/api/apiClient';

export type CreatorCategory = 'MUSIC' | 'PODCASTS' | 'ART' | 'COMEDY' | 'GAMING' | 'EDUCATION' | 'OTHER';
export type CreatorOnboarding = {
  status: 'NOT_STARTED' | 'PENDING' | 'APPROVED' | 'REJECTED';
  payoutStatus: 'NOT_SUBMITTED' | 'PENDING' | 'VERIFIED' | 'REJECTED';
  payoutEligible: boolean;
  maskedAccount: string | null;
  rejectionReason?: string | null;
  about?: string;
  categories?: CreatorCategory[];
};

export const getMyCreatorOnboarding = () =>
  apiRequest<CreatorOnboarding>('/creators/me/onboarding', {auth: 'required'});

export const submitMyCreatorOnboarding = (body: {
  about: string;
  categories: CreatorCategory[];
  accountHolder: string;
  accountNumber: string;
  ifsc: string;
}) => apiRequest<CreatorOnboarding>('/creators/me/onboarding', {
  auth: 'required', method: 'PUT', body: JSON.stringify(body),
});
