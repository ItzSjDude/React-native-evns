import React from 'react';
import {act, create, type ReactTestRenderer} from 'react-test-renderer';
import PaidAccessSection from '../PaidAccessSection';
import {configurePaidRoom, getPaidRoomProduct, getPaidRoomsEnabled} from '../paidRoomService';

jest.mock('../paidRoomService', () => ({getPaidRoomsEnabled: jest.fn(), getPaidRoomProduct: jest.fn(), configurePaidRoom: jest.fn()}));
let tree: ReactTestRenderer;
const mount = async () => {await act(async () => {tree = create(<PaidAccessSection partyId="p1" />);});};
afterEach(async () => {await act(async () => tree.unmount());});
beforeEach(() => {jest.clearAllMocks(); (getPaidRoomProduct as jest.Mock).mockResolvedValue(null);});

test('hidden unless the monetization flag enables paid rooms', async () => {
  (getPaidRoomsEnabled as jest.Mock).mockResolvedValue(false);
  await mount();
  expect(tree.toJSON()).toBeNull();
  expect(getPaidRoomProduct).not.toHaveBeenCalled();
});

test('shows terms before enabling and saves the Play product id', async () => {
  (getPaidRoomsEnabled as jest.Mock).mockResolvedValue(true);
  (configurePaidRoom as jest.Mock).mockResolvedValue({partyId: 'p1', productId: 'room_sku', currency: 'INR', status: 'ACTIVE'});
  await mount();
  const out = JSON.stringify(tree.toJSON());
  expect(out).toContain('Paid access');
  expect(out).toMatch(/refund/i);
  expect(out).toMatch(/reschedules/i);
  const input = tree.root.findAll(n => n.props.accessibilityLabel === 'Google Play product id' && !!n.props.onChangeText)[0];
  await act(async () => input.props.onChangeText('room_sku'));
  const button = tree.root.findAll(n => n.props.accessibilityLabel === 'Enable paid access' && typeof n.props.onPress === 'function')[0];
  await act(async () => button.props.onPress());
  expect(configurePaidRoom).toHaveBeenCalledWith('p1', 'room_sku');
  expect(JSON.stringify(tree.toJSON())).toContain('Paid access is on');
});
