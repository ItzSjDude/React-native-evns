import {apiRequest} from '../../core/api/apiClient';
import {createCapabilityProbe, useCapability} from '../../core/api/capability';

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

const onboardingProbe = createCapabilityProbe(getMyCreatorOnboarding);

/** Whether `GET /creators/me/onboarding` is deployed (F-04.6); the banner and screen stay hidden on 404. */
export const useCreatorOnboardingAvailable = (active = true) => useCapability(onboardingProbe, active);
