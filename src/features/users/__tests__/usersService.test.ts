import {apiRequest, apiRequestPage} from '../../../core/api/apiClient';
import {accessOf, followUser, getFollowList, getViewerFollowingIds, reportUser, unfollowUser} from '../usersService';

jest.mock('../../../core/api/apiClient', () => ({apiRequest: jest.fn(), apiRequestPage: jest.fn()}));

beforeEach(() => jest.clearAllMocks());

test('follow, unfollow and report hit the documented routes', async () => {
  await followUser('u 2');
  expect(apiRequest).toHaveBeenLastCalledWith('/users/u%202/follow', {auth: 'required', method: 'POST'});
  await unfollowUser('u2');
  expect(apiRequest).toHaveBeenLastCalledWith('/users/u2/follow', {auth: 'required', method: 'DELETE'});
  await reportUser('u2', 'Spam or scam');
  expect(apiRequest).toHaveBeenLastCalledWith('/reports', {auth: 'required', method: 'POST',
    body: JSON.stringify({targetType: 'user', targetId: 'u2', reason: 'Spam or scam'})});
});

test('follow lists are paged and the viewer lookup stops when there are no more pages', async () => {
  (apiRequestPage as jest.Mock)
    .mockResolvedValueOnce({data: [{id: 'a'}, {id: 'b'}], meta: {limit: 100, offset: 0, hasMore: true}})
    .mockResolvedValueOnce({data: [{id: 'c'}], meta: {limit: 100, offset: 2, hasMore: false}});
  expect([...await getViewerFollowingIds('me')]).toEqual(['a', 'b', 'c']);
  expect(apiRequestPage).toHaveBeenNthCalledWith(2, '/users/me/following?limit=100&offset=2', {auth: 'required'});

  (apiRequestPage as jest.Mock).mockResolvedValueOnce({data: [], meta: {limit: 20, offset: 40, hasMore: false}});
  expect(await getFollowList('u2', 'followers', 40)).toEqual({items: [], hasMore: false, offset: 40});
});

test('403 and 404 map to private and unavailable', () => {
  expect(accessOf({status: 403})).toBe('private');
  expect(accessOf({status: 404})).toBe('unavailable');
  expect(accessOf({status: 500})).toBeNull();
});
