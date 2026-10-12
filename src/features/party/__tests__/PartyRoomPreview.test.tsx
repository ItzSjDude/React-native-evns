import React from 'react';
import {act, create, type ReactTestRenderer} from 'react-test-renderer';
import PartyRoomPreview from '../PartyRoomPreview';
import {joinParty, type PartyRoom} from '../partyService';

jest.mock('../partyService', () => ({joinParty: jest.fn(), getPartyRoom: jest.fn(), setPartyReminder: jest.fn(), startScheduledParty: jest.fn(), cancelScheduledParty: jest.fn()}));
jest.mock('../../auth', () => ({loadSession: jest.fn().mockResolvedValue({user: {id: 'me'}})}));

const room = {id: 'b', kind: 'AUDIO', status: 'ACTIVE', title: 'Room b', topic: null, category: null, language: null, interestTags: [], host: {id: 'host', name: 'Host', avatarUrl: null}, participantCount: 2, scheduledStartAt: null} as PartyRoom;
let tree: ReactTestRenderer;

test('joining while in another party prompts instead of silently failing', async () => {
  const onBlocked = jest.fn();
  const onJoined = jest.fn();
  await act(async () => {tree = create(<PartyRoomPreview room={room} activePartyId="a" onBlocked={onBlocked} onJoined={onJoined} onClose={jest.fn()} />);});
  await act(async () => tree.root.findByProps({accessibilityLabel: 'Join audio party'}).props.onPress());
  expect(onBlocked).toHaveBeenCalledTimes(1);
  expect(joinParty).not.toHaveBeenCalled();
  expect(onJoined).not.toHaveBeenCalled();
  // The guidance sits in the fixed footer next to the button, not below the scrollable details.
  const alert = tree.root.findByProps({accessibilityRole: 'alert'});
  expect(alert.props.children).toMatch(/already in a party/i);
  await act(async () => tree.unmount());
});

test('the active party offers to return instead of joining again', async () => {
  const onResume = jest.fn();
  await act(async () => {tree = create(<PartyRoomPreview room={room} activePartyId="b" onResume={onResume} onJoined={jest.fn()} onClose={jest.fn()} />);});
  await act(async () => tree.root.findByProps({accessibilityLabel: 'Return to party'}).props.onPress());
  expect(onResume).toHaveBeenCalled();
  expect(joinParty).not.toHaveBeenCalled();
  await act(async () => tree.unmount());
});
