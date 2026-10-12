import {apiRequest} from '../../../core/api/apiClient';
import {
  advancePartyGame, createPartyPoll, endPartyGame, getActivePartyGame, getPartyMonetization, isUnavailable, listPartyGifts, listPartyPolls,
  cancelPartyGiftReservation, listPartyGiftCatalog, pollTotal, purchasePartyGift, reservePartyGift, spinPartyGame, startPartyGame, votePartyPoll,
} from '../extras/extrasService';

jest.mock('../../../core/api/apiClient', () => ({apiRequest: jest.fn()}));
const request = apiRequest as jest.Mock;
beforeEach(() => {jest.resetAllMocks(); request.mockResolvedValue({});});

test('poll endpoints use the documented paths and bodies', async () => {
  await listPartyPolls('p1');
  expect(request).toHaveBeenLastCalledWith('/parties/p1/polls', {auth: 'required', signal: undefined});
  await createPartyPoll('p1', 'Q?', ['a', 'b']);
  expect(request).toHaveBeenLastCalledWith('/parties/p1/polls', {auth: 'required', method: 'POST', body: JSON.stringify({question: 'Q?', options: ['a', 'b']})});
  await votePartyPoll('p1', 'poll', 'opt');
  expect(request).toHaveBeenLastCalledWith('/parties/p1/polls/poll/vote', {auth: 'required', method: 'POST', body: JSON.stringify({optionId: 'opt'})});
});

test('game endpoints use the documented paths and bodies', async () => {
  await getActivePartyGame('p1');
  expect(request).toHaveBeenLastCalledWith('/parties/p1/games/active', {auth: 'required', signal: undefined});
  await startPartyGame('p1', 'LUCKY_WHEEL');
  expect(request).toHaveBeenLastCalledWith('/parties/p1/games', {auth: 'required', method: 'POST', body: JSON.stringify({type: 'LUCKY_WHEEL'})});
  await advancePartyGame('p1', 'g', {mode: 'dare'});
  expect(request).toHaveBeenLastCalledWith('/parties/p1/games/g/advance', {auth: 'required', method: 'POST', body: JSON.stringify({mode: 'dare'})});
  await advancePartyGame('p1', 'g');
  expect(request).toHaveBeenLastCalledWith('/parties/p1/games/g/advance', {auth: 'required', method: 'POST', body: '{}'});
  await spinPartyGame('p1', 'g');
  expect(request).toHaveBeenLastCalledWith('/parties/p1/games/g/spin', {auth: 'required', method: 'POST'});
  await endPartyGame('p1', 'g');
  expect(request).toHaveBeenLastCalledWith('/parties/p1/games/g/end', {auth: 'required', method: 'POST'});
});

test('monetization and gift list paths', async () => {
  await getPartyMonetization('p1');
  expect(request).toHaveBeenLastCalledWith('/parties/p1/monetization', {auth: 'required', signal: undefined});
  await listPartyGifts('p1');
  expect(request).toHaveBeenLastCalledWith('/parties/p1/gifts?limit=20', {auth: 'required', signal: undefined});
  await listPartyGiftCatalog('p1', 'creator/one');
  expect(request).toHaveBeenLastCalledWith('/parties/p1/gifts/catalog?creatorId=creator%2Fone', {auth: 'required', signal: undefined});
  await reservePartyGift('p1', {creatorId: 'creator', productId: 'rose', idempotencyKey: 'gift:123:abc'});
  expect(request).toHaveBeenLastCalledWith('/parties/p1/gifts/play-reservations', {auth: 'required', method: 'POST', body: JSON.stringify({creatorId: 'creator', productId: 'rose', idempotencyKey: 'gift:123:abc'})});
  await cancelPartyGiftReservation('p1', 'reservation/id');
  expect(request).toHaveBeenLastCalledWith('/parties/p1/gifts/play-reservations/reservation%2Fid', {auth: 'required', method: 'DELETE'});
  await purchasePartyGift('p1', {creatorId: 'creator', productId: 'rose', purchaseToken: 'play-token', reservationId: 'reservation'});
  expect(request).toHaveBeenLastCalledWith('/parties/p1/gifts/play-purchase', {auth: 'required', method: 'POST', body: JSON.stringify({creatorId: 'creator', productId: 'rose', purchaseToken: 'play-token', reservationId: 'reservation'})});
});

test('helpers', () => {
  expect(isUnavailable({status: 404})).toBe(true);
  expect(isUnavailable({status: 403})).toBe(true);
  expect(isUnavailable({status: 500})).toBe(false);
  expect(isUnavailable(new Error('x'))).toBe(false);
  expect(pollTotal({id: '', question: '', closed: false, selectedOptionId: null, options: [{id: 'a', label: 'a', votes: 2}, {id: 'b', label: 'b', votes: 3}]})).toBe(5);
});
