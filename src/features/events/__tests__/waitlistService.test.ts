import {apiRequest, apiRequestPage} from '../../../core/api/apiClient';
import {claimWaitlistOffer, getMyWaitlistEntries, joinEventWaitlist, leaveEventWaitlist} from '../waitlistService';

jest.mock('../../../core/api/apiClient', () => ({apiRequest: jest.fn(), apiRequestPage: jest.fn()}));
const request = apiRequest as jest.Mock;
const page = apiRequestPage as jest.Mock;

beforeEach(() => jest.clearAllMocks());

test('loads the signed-in user’s active waitlist entries', async () => {
  page.mockResolvedValue({data: [{id: 'q1', event_id: 'e1', status: 'WAITING'}], meta: {limit: 100, offset: 0, hasMore: false}});
  await expect(getMyWaitlistEntries()).resolves.toMatchObject([{id: 'q1', status: 'WAITING'}]);
  expect(page).toHaveBeenCalledWith('/waitlist/mine?limit=100&offset=0', {auth: 'required'});
});

test('joins, leaves and claims using the server-owned waitlist entry', async () => {
  request.mockResolvedValue({id: 'q1', event_id: 'e1', status: 'WAITING'});
  await joinEventWaitlist('e1');
  expect(request).toHaveBeenLastCalledWith('/waitlist/events/e1/join', {auth: 'required', method: 'POST'});
  await leaveEventWaitlist('e1');
  expect(request).toHaveBeenLastCalledWith('/waitlist/events/e1/leave', {auth: 'required', method: 'DELETE'});
  await claimWaitlistOffer('q1');
  expect(request).toHaveBeenLastCalledWith('/waitlist/entries/q1/claim', {auth: 'required', method: 'POST'});
});
