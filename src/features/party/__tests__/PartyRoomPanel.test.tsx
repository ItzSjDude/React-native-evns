import React from 'react';
import {act, create, type ReactTestRenderer} from 'react-test-renderer';
import PartyRoomPanel from '../PartyRoomPanel';
import type {PartyParticipant} from '../partyService';
const person = (userId: string, role: PartyParticipant['role'], seatIndex: number | null): PartyParticipant => ({userId, name: userId, avatarUrl: null, role, seatIndex, active: true, muted: true, locked: false, videoEnabled: false, joinedAt: '2026-10-06', leftAt: null});
const participants = [person('host', 'HOST', 0), person('friend', 'MEMBER', null)];
const base = {onClose: jest.fn(), onSelect: jest.fn(), participants, requests: [], lockedSeats: [], seatCount: 8, busy: false, error: null, onAction: jest.fn(), title: 'Party'};
let tree: ReactTestRenderer;
afterEach(() => act(() => tree?.unmount()));
test('host can approve pending requests into available seats', async () => {
  const onAction = jest.fn();
  await act(() => {tree = create(<PartyRoomPanel {...base} identity="host" panel={{kind: 'requests'}} onAction={onAction} requests={[{id: 'request', userId: 'friend', name: 'Friend', avatarUrl: null, status: 'PENDING', requestedAt: 'now'}]} />);});
  const approve = tree.root.findByProps({accessibilityLabel: 'Approve'});
  await act(() => approve.props.onPress());
  expect(onAction).toHaveBeenCalledWith('approve', 'request');
});
test('listener sees no moderator actions for another participant', async () => {
  await act(() => {tree = create(<PartyRoomPanel {...base} identity="friend" panel={{kind: 'person', personId: 'host'}} />);});
  const labels = tree.root.findAll(node => typeof node.props.accessibilityLabel === 'string').map(node => node.props.accessibilityLabel);
  expect(labels).not.toContain('Remove from room');
  expect(labels).not.toContain('Mute microphone');
  expect(labels).toContain('Report participant');
});
test('host exit clearly ends for everyone and requires the explicit end action', async () => {
  const onAction = jest.fn();
  await act(() => {tree = create(<PartyRoomPanel {...base} identity="host" panel={{kind: 'exit'}} onAction={onAction} />);});
  expect(onAction).not.toHaveBeenCalled();
  await act(() => tree.root.findByProps({accessibilityLabel: 'End for everyone'}).props.onPress());
  expect(onAction).toHaveBeenCalledWith('exit');
});
