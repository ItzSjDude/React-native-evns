import {apiRequest} from '../../../core/api/apiClient';

export type PartyPollOption = {id: string; label: string; votes: number};
export type PartyPoll = {id: string; question: string; closed: boolean; selectedOptionId: string | null; options: PartyPollOption[]};

export type PartyGameType = 'TRUTH_OR_DARE' | 'LUCKY_WHEEL';
export type TruthOrDareState = {currentSeatIndex: number; mode: 'truth' | 'dare' | null; prompt: string | null};
export type LuckyWheelState = {result: number | null; spinning: boolean};
export type PartyGame = {
  id: string; partyId: string; startedBy: string; startedAt: string; endedAt: string | null;
} & ({type: 'TRUTH_OR_DARE'; state: TruthOrDareState} | {type: 'LUCKY_WHEEL'; state: LuckyWheelState});

export type PartyMonetization = {giftsEnabled: boolean; paidRoomsEnabled: boolean};
export type PartyGiftStatus = 'PENDING' | 'PAID' | 'FAILED' | 'REFUND_REQUESTED' | 'REFUNDED';
export type PartyGift = {
  id: string; partyId: string; senderId: string; creatorId: string;
  creator: {handle: string | null; displayName: string | null};
  giftType: string; quantity: number; amountMinor: number; currency: string;
  status: PartyGiftStatus; receiptCode: string | null; createdAt: string;
};

const json = (method: string, body?: unknown) => ({auth: 'required' as const, method, ...(body === undefined ? {} : {body: JSON.stringify(body)})});

export const listPartyPolls = (partyId: string, signal?: AbortSignal) =>
  apiRequest<PartyPoll[]>(`/parties/${partyId}/polls`, {auth: 'required', signal});
export const createPartyPoll = (partyId: string, question: string, options: string[]) =>
  apiRequest<PartyPoll>(`/parties/${partyId}/polls`, json('POST', {question, options}));
export const votePartyPoll = (partyId: string, pollId: string, optionId: string) =>
  apiRequest<PartyPoll>(`/parties/${partyId}/polls/${pollId}/vote`, json('POST', {optionId}));

export const getActivePartyGame = (partyId: string, signal?: AbortSignal) =>
  apiRequest<PartyGame | null>(`/parties/${partyId}/games/active`, {auth: 'required', signal});
export const startPartyGame = (partyId: string, type: PartyGameType) =>
  apiRequest<PartyGame>(`/parties/${partyId}/games`, json('POST', {type}));
export const advancePartyGame = (partyId: string, gameId: string, body?: {mode?: 'truth' | 'dare'; prompt?: string}) =>
  apiRequest<PartyGame>(`/parties/${partyId}/games/${gameId}/advance`, json('POST', body ?? {}));
export const spinPartyGame = (partyId: string, gameId: string) =>
  apiRequest<PartyGame>(`/parties/${partyId}/games/${gameId}/spin`, json('POST'));
export const endPartyGame = (partyId: string, gameId: string) =>
  apiRequest<PartyGame>(`/parties/${partyId}/games/${gameId}/end`, json('POST'));

export const getPartyMonetization = (partyId: string, signal?: AbortSignal) =>
  apiRequest<PartyMonetization>(`/parties/${partyId}/monetization`, {auth: 'required', signal});
export const listPartyGifts = (partyId: string, signal?: AbortSignal) =>
  apiRequest<PartyGift[]>(`/parties/${partyId}/gifts?limit=20`, {auth: 'required', signal});

export const errorStatus = (error: unknown) => (error as {status?: number} | null)?.status ?? 0;
/** 404 (route/party missing) and 403 (feature disabled or not allowed) mean "hide this feature". */
export const isUnavailable = (error: unknown) => [403, 404].includes(errorStatus(error));
export const errorMessage = (error: unknown, fallback: string) => {
  const message = (error as {message?: string} | null)?.message;
  return typeof message === 'string' && message ? message : fallback;
};
export const pollTotal = (poll: PartyPoll) => poll.options.reduce((sum, option) => sum + option.votes, 0);
