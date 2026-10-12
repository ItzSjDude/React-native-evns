import React from 'react';
import {Text} from 'react-native';
import {act, create, type ReactTestRenderer} from 'react-test-renderer';
import PartyRoomPreview from '../PartyRoomPreview';
import {joinParty, type PartyRoom} from '../partyService';

jest.mock('../partyService', () => ({joinParty: jest.fn(), getPartyRoom: jest.fn(), setPartyReminder: jest.fn(), startScheduledParty: jest.fn(), cancelScheduledParty: jest.fn()}));
jest.mock('../../auth', () => ({loadSession: jest.fn().mockResolvedValue({user: {id: 'me'}})}));
jest.mock('../../paidRooms', () => {
  const {Text: T} = require('react-native');
  const R = require('react');
  return {
    isPaidAccessRequired: (e: {status?: number; message?: string}) => e?.status === 403 && /purchase access/i.test(e.message ?? ''),
    PaidRoomGate: ({onEntitled}: {onEntitled: () => void}) => R.createElement(T, {accessibilityLabel: 'gate', onPress: onEntitled}, 'GATE'),
  };
});

const room = {id: 'b', kind: 'AUDIO', status: 'ACTIVE', title: 'Room b', topic: null, category: null, language: null, interestTags: [], host: {id: 'host', name: 'Host', avatarUrl: null}, participantCount: 2, scheduledStartAt: null} as PartyRoom;
const join = jest.mocked(joinParty);
let tree: ReactTestRenderer;
const mount = async (onJoined = jest.fn()) => {
  await act(async () => {tree = create(<PartyRoomPreview room={room} onJoined={onJoined} onClose={jest.fn()} />);});
  return onJoined;
};
const press = () => act(async () => tree.root.findByProps({accessibilityLabel: 'Join audio party'}).props.onPress());
const hasGate = () => tree.root.findAllByType(Text).some(node => node.props.children === 'GATE');
beforeEach(() => jest.clearAllMocks());
afterEach(async () => {await act(async () => tree.unmount());});

test('a non-entitled joiner (including via a shared link) gets the gate from the join 403', async () => {
  join.mockRejectedValueOnce({status: 403, message: 'Purchase access to this room before joining'});
  const onJoined = await mount();
  await press();
  expect(hasGate()).toBe(true);
  expect(onJoined).not.toHaveBeenCalled();
});

test('hosts, co-hosts and invited members (backend lets them join) never see the gate', async () => {
  join.mockResolvedValueOnce({party: {id: 'b'}} as never);
  const onJoined = await mount();
  await press();
  expect(hasGate()).toBe(false);
  expect(onJoined).toHaveBeenCalledTimes(1);
});

test('other 403s (party full) show the message, not the gate', async () => {
  join.mockRejectedValueOnce({status: 403, message: 'This party is full'});
  await mount();
  await press();
  expect(hasGate()).toBe(false);
  expect(tree.root.findByProps({accessibilityRole: 'alert'}).props.children).toBe('This party is full');
});

test('after the server confirms entitlement the gate re-runs the normal join', async () => {
  join.mockRejectedValueOnce({status: 403, message: 'Purchase access to this room before joining'});
  join.mockResolvedValueOnce({party: {id: 'b'}} as never);
  const onJoined = await mount();
  await press();
  await act(async () => tree.root.findByProps({accessibilityLabel: 'gate'}).props.onPress());
  expect(join).toHaveBeenCalledTimes(2);
  expect(onJoined).toHaveBeenCalledTimes(1);
  expect(hasGate()).toBe(false);
});
