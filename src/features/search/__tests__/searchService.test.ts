import {apiRequest} from '../../../core/api/apiClient';
import {isSearchUnavailable, searchPeople, searchRooms} from '../searchService';
import {pushRecent} from '../recentSearches';

jest.mock('../../../core/api/apiClient', () => ({apiRequest: jest.fn()}));
const mockRequest = apiRequest as jest.Mock;

beforeEach(() => jest.clearAllMocks());

test('searchRooms queries party discovery with the search term and forwards the abort signal', async () => {
  const signal = new AbortController().signal;
  const room = (id: string, status: string, participantCount: number, scheduledStartAt: string | null = null) =>
    ({id, status, participantCount, scheduledStartAt, host: {id: 'h', name: 'H', avatarUrl: null}});
  mockRequest.mockResolvedValue({rooms: [room('s', 'SCHEDULED', 0, '2026-10-10T00:00:00Z'), room('a', 'ACTIVE', 2), room('b', 'ACTIVE', 9)], nextCursor: null});
  const rooms = await searchRooms(' lo fi & chill ', {limit: 5, signal});
  expect(mockRequest).toHaveBeenCalledWith('/parties/discover?limit=5&kind=AUDIO&search=lo%20fi%20%26%20chill', {auth: 'required', signal});
  expect(rooms.map(item => item.id)).toEqual(['b', 'a', 's']);
});

test('searchPeople calls the proposed /users/search contract and normalises rows', async () => {
  const signal = new AbortController().signal;
  mockRequest.mockResolvedValue([{id: 'u1', name: 'Asha', handle: 'asha'}, {id: 'u2', name: null, isFollowing: true}]);
  const people = await searchPeople('@as', {limit: 3, offset: 6, signal});
  expect(mockRequest).toHaveBeenCalledWith('/users/search?q=%40as&limit=3&offset=6', {auth: 'required', signal});
  expect(people).toEqual([
    {id: 'u1', name: 'Asha', handle: 'asha', avatarUrl: null, isFollowing: false},
    {id: 'u2', name: 'Hiva user', handle: null, avatarUrl: null, isFollowing: true},
  ]);
});

test('missing-route statuses are treated as "not available yet", others as errors', () => {
  expect(isSearchUnavailable({status: 404})).toBe(true);
  expect(isSearchUnavailable({status: 500})).toBe(false);
  expect(isSearchUnavailable(new Error('Aborted'))).toBe(false);
});

test('recent searches are de-duplicated case-insensitively and capped', () => {
  expect(pushRecent(['Lofi', 'jazz'], ' lofi ')).toEqual(['lofi', 'jazz']);
  expect(pushRecent(Array.from({length: 8}, (_, i) => `t${i}`), 'new')).toHaveLength(8);
  expect(pushRecent(['a'], '   ')).toEqual(['a']);
});
