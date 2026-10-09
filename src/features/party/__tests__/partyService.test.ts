import {apiRequest} from '../../../core/api/apiClient';
import {createParty, getPartyDiscoveryPage, joinParty, leaveParty, requestPartySeat, setPartyState, type PartyRoom} from '../partyService';

jest.mock('../../../core/api/apiClient', () => ({apiRequest: jest.fn()}));
const request = apiRequest as jest.Mock;

beforeEach(() => { jest.resetAllMocks(); });

test('loads audio discovery and preserves its pagination cursor', async () => {
  request.mockResolvedValue({rooms: [{id: 'audio', kind: 'AUDIO'} as PartyRoom], nextCursor: 'audio-next'});
  const result = await getPartyDiscoveryPage({category: 'MUSIC'});
  expect(request).toHaveBeenCalledWith('/parties/discover?limit=20&category=MUSIC&kind=AUDIO', {auth: 'required'});
  expect(request).toHaveBeenCalledTimes(1);
  expect(result.rooms.map(room => room.id)).toEqual(['audio']);
  expect(result.cursors).toEqual({audio: 'audio-next', video: null});

  request.mockClear();
  request.mockResolvedValue({rooms: [], nextCursor: null});
  await getPartyDiscoveryPage({category: 'MUSIC'}, result.cursors);
  expect(request).toHaveBeenCalledTimes(1);
  expect(request).toHaveBeenCalledWith('/parties/discover?limit=20&category=MUSIC&kind=AUDIO&cursor=audio-next', {auth: 'required'});
});

test('creates a public room using the supplied details without adding location coordinates', async () => {
  request.mockResolvedValue({party: {id: 'room'}, participants: []});
  await createParty({title: 'Acoustic Lounge', topic: 'Live music', kind: 'AUDIO', category: 'MUSIC', interestTags: ['music']});
  const [path, options] = request.mock.calls[0];
  expect(path).toBe('/parties');
  expect(options.auth).toBe('required');
  expect(options.method).toBe('POST');
  expect(JSON.parse(options.body)).toEqual({
    title: 'Acoustic Lounge', topic: 'Live music', kind: 'AUDIO', category: 'MUSIC',
    interestTags: ['music'], inviteeIds: [], visibility: 'PUBLIC', seatCount: 8,
  });
});

test('passes the selected four-seat room configuration to the API', async () => {
  request.mockResolvedValue({party: {id: 'room'}, participants: []});
  await createParty({title: 'Small circle', topic: '', kind: 'AUDIO', category: 'SOCIAL', interestTags: [], seatCount: 4});
  expect(JSON.parse(request.mock.calls[0][1].body).seatCount).toBe(4);
});

test('uses the backend LiveKit party lifecycle contract', async () => {
  request.mockResolvedValue({});

  await joinParty('party-1');
  expect(request).toHaveBeenLastCalledWith('/parties/party-1/join', {auth: 'required', method: 'POST'});

  await setPartyState('party-1', {muted: true});
  expect(request).toHaveBeenLastCalledWith('/parties/party-1/state', {
    auth: 'required', method: 'PATCH', body: JSON.stringify({muted: true}),
  });

  await requestPartySeat('party-1');
  expect(request).toHaveBeenLastCalledWith('/parties/party-1/seat-requests', {auth: 'required', method: 'POST'});

  await leaveParty('party-1');
  expect(request).toHaveBeenLastCalledWith('/parties/party-1/leave', {auth: 'required', method: 'POST'});
});
