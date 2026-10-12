import React from 'react';
import {Platform} from 'react-native';
import * as Iap from 'react-native-iap';
import {act, create, type ReactTestRenderer} from 'react-test-renderer';
import {resetBillingForTests} from '../../plus/billing';
import PaidRoomGate from '../PaidRoomGate';
import {getPaidRoomProduct, verifyPaidRoomPurchase} from '../paidRoomService';

jest.mock('../paidRoomService', () => ({getPaidRoomProduct: jest.fn(), verifyPaidRoomPurchase: jest.fn()}));

const iap = Iap as unknown as typeof Iap & {__emitPurchase: (p: unknown) => void; __resetListeners: () => void};
const getProduct = getPaidRoomProduct as jest.Mock;
const verify = verifyPaidRoomPurchase as jest.Mock;
const product = (hasAccess = false) => ({partyId: 'p1', productId: 'room_sku', currency: 'INR', hasAccess});
const play = (overrides: Record<string, unknown> = {}) => ({id: 'GPA.9', productId: 'room_sku', purchaseToken: 'SECRET-TOKEN-123', purchaseState: 'purchased', platform: 'android', store: 'google', ...overrides});
const flush = async () => {await act(async () => {await new Promise<void>(resolve => setTimeout(resolve, 0));});};
const text = (tree: ReactTestRenderer) => JSON.stringify(tree.toJSON());
const press = async (tree: ReactTestRenderer, label: string) => {
  const node = tree.root.findAll(n => typeof n.props.onPress === 'function' && n.props.accessibilityLabel?.startsWith(label))[0];
  await act(async () => {node.props.onPress();});
  await flush();
};
let tree: ReactTestRenderer;
const onEntitled = jest.fn();
const mount = async () => {
  await act(async () => {tree = create(<PaidRoomGate partyId="p1" onEntitled={onEntitled} onClose={jest.fn()} />);});
  await flush();
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.replaceProperty(Platform, 'OS', 'android');
  iap.__resetListeners();
  resetBillingForTests();
  getProduct.mockResolvedValue(product());
  (Iap.fetchProducts as jest.Mock).mockResolvedValue([{id: 'room_sku', displayPrice: '₹199', type: 'in-app'}]);
  (Iap.getAvailablePurchases as jest.Mock).mockResolvedValue([]);
});
afterEach(async () => {await act(async () => tree.unmount());});

test('a non-entitled joiner sees terms, the localized price, Buy and Restore', async () => {
  await mount();
  expect(Iap.fetchProducts).toHaveBeenCalledWith({skus: ['room_sku'], type: 'in-app'});
  const out = text(tree);
  expect(out).toContain('Buy access · ₹199');
  expect(out).toContain('Restore purchase');
  expect(out).toMatch(/refund/i);
  expect(out).toMatch(/reschedules/i);
  expect(out).toMatch(/cancelled/i);
  expect(onEntitled).not.toHaveBeenCalled();
});

test('already entitled on the server: continues straight to the normal join', async () => {
  getProduct.mockResolvedValue(product(true));
  await mount();
  expect(onEntitled).toHaveBeenCalledTimes(1);
});

test('purchase success posts the token, refetches entitlement, then joins; the app never acknowledges and never logs the token', async () => {
  const spies = (['log', 'warn', 'error', 'info', 'debug'] as const).map(level => jest.spyOn(console, level).mockImplementation(() => {}));
  verify.mockResolvedValue({partyId: 'p1', hasAccess: true, status: 'ACTIVE'});
  await mount();
  getProduct.mockResolvedValue(product(true));
  await press(tree, 'Buy access');
  expect(Iap.requestPurchase).toHaveBeenCalledWith({type: 'in-app', request: {google: {skus: ['room_sku']}}});
  expect(onEntitled).not.toHaveBeenCalled(); // the local Play callback alone unlocks nothing
  await act(async () => {iap.__emitPurchase(play());});
  await flush();
  expect(verify).toHaveBeenCalledWith('p1', 'room_sku', 'SECRET-TOKEN-123');
  expect(getProduct).toHaveBeenCalledTimes(2);
  expect(onEntitled).toHaveBeenCalledTimes(1);
  expect(Iap.finishTransaction).not.toHaveBeenCalled();
  spies.forEach(spy => {expect(JSON.stringify(spy.mock.calls)).not.toContain('SECRET-TOKEN-123'); spy.mockRestore();});
});

test('server says access is not active after the post: stays gated', async () => {
  verify.mockResolvedValue({partyId: 'p1', hasAccess: true, status: 'ACTIVE'});
  await mount();
  await press(tree, 'Buy access');
  await act(async () => {iap.__emitPurchase(play());});
  await flush();
  expect(onEntitled).not.toHaveBeenCalled();
  expect(text(tree)).toContain('isn’t active yet');
});

test('pending Play purchases grant nothing and are not posted', async () => {
  await mount();
  await press(tree, 'Buy access');
  await act(async () => {iap.__emitPurchase(play({purchaseState: 'pending'}));});
  await flush();
  expect(verify).not.toHaveBeenCalled();
  expect(onEntitled).not.toHaveBeenCalled();
  expect(text(tree)).toContain('pending');
});

test.each([
  [409, 'already linked to another Hiva account'],
  [404, 'aren’t available right now'],
  [503, 'aren’t available right now'],
  [400, 'couldn’t confirm this purchase'],
])('backend %s maps to friendly copy and unlocks nothing', async (status, copy) => {
  verify.mockRejectedValue({status, message: 'raw backend message'});
  await mount();
  await press(tree, 'Buy access');
  await act(async () => {iap.__emitPurchase(play());});
  await flush();
  expect(text(tree)).toContain(copy);
  expect(text(tree)).not.toContain('raw backend message');
  expect(onEntitled).not.toHaveBeenCalled();
  expect(Iap.finishTransaction).not.toHaveBeenCalled();
});

test('restore re-posts the owned purchase, refetches and joins; nothing owned shows a notice', async () => {
  verify.mockResolvedValue({partyId: 'p1', hasAccess: true, status: 'ACTIVE'});
  await mount();
  await press(tree, 'Restore purchase');
  expect(verify).not.toHaveBeenCalled();
  expect(text(tree)).toContain('No purchase of this room was found');
  (Iap.getAvailablePurchases as jest.Mock).mockResolvedValue([play()]);
  getProduct.mockResolvedValue(product(true));
  await press(tree, 'Restore purchase');
  expect(verify).toHaveBeenCalledWith('p1', 'room_sku', 'SECRET-TOKEN-123');
  expect(onEntitled).toHaveBeenCalledTimes(1);
  expect(Iap.finishTransaction).not.toHaveBeenCalled();
});
