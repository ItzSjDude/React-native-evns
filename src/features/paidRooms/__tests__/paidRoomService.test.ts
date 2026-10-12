import {apiRequest} from '../../../core/api/apiClient';
import {configurePaidRoom, getPaidRoomProduct, getPaidRoomsEnabled, isPaidAccessRequired, verifyPaidRoomPurchase} from '../paidRoomService';

jest.mock('../../../core/api/apiClient', () => ({apiRequest: jest.fn()}));
const api = apiRequest as jest.Mock;
beforeEach(() => api.mockReset());

test('monetization flag: true only when paidRoomsEnabled; any error hides the section', async () => {
  api.mockResolvedValueOnce({giftsEnabled: true, paidRoomsEnabled: true});
  await expect(getPaidRoomsEnabled('p1')).resolves.toBe(true);
  expect(api).toHaveBeenLastCalledWith('/parties/p1/monetization', {auth: 'required', signal: undefined});
  api.mockResolvedValueOnce({paidRoomsEnabled: false});
  await expect(getPaidRoomsEnabled('p1')).resolves.toBe(false);
  api.mockRejectedValueOnce({status: 403});
  await expect(getPaidRoomsEnabled('p1')).resolves.toBe(false);
});

test('reads the product: null for a free room or a disabled feature (404); other errors surface', async () => {
  api.mockResolvedValueOnce({partyId: 'p1', productId: 'room_sku', currency: 'INR', hasAccess: false});
  await expect(getPaidRoomProduct('p1')).resolves.toEqual({partyId: 'p1', productId: 'room_sku', currency: 'INR', hasAccess: false});
  api.mockResolvedValueOnce(null);
  await expect(getPaidRoomProduct('p1')).resolves.toBeNull();
  api.mockRejectedValueOnce({status: 404});
  await expect(getPaidRoomProduct('p1')).resolves.toBeNull();
  api.mockRejectedValueOnce({status: 500});
  await expect(getPaidRoomProduct('p1')).rejects.toMatchObject({status: 500});
});

test('host config sends exactly {productId, currency} (the backend body is strict)', async () => {
  api.mockResolvedValue({});
  await configurePaidRoom('p1', ' room_sku ');
  expect(api).toHaveBeenCalledWith('/parties/p1/paid-room', {auth: 'required', method: 'PUT', body: JSON.stringify({productId: 'room_sku', currency: 'INR'})});
});

test('purchase posts exactly {productId, purchaseToken} (no packageName: the backend body is strict)', async () => {
  api.mockResolvedValue({partyId: 'p1', hasAccess: true, status: 'ACTIVE'});
  await verifyPaidRoomPurchase('p1', 'room_sku', 'tok-1');
  expect(api).toHaveBeenCalledWith('/parties/p1/paid-room/purchase', {auth: 'required', method: 'POST', body: JSON.stringify({productId: 'room_sku', purchaseToken: 'tok-1'})});
});

test('only the "purchase access" 403 opens the gate, not "party is full"', () => {
  expect(isPaidAccessRequired({status: 403, message: 'Purchase access to this room before joining'})).toBe(true);
  expect(isPaidAccessRequired({status: 403, message: 'This party is full'})).toBe(false);
  expect(isPaidAccessRequired({status: 404, message: 'Purchase access'})).toBe(false);
  expect(isPaidAccessRequired(null)).toBe(false);
});
