import React from 'react';
import {act, create, type ReactTestRenderer} from 'react-test-renderer';
import PartyRoomPanel from '../PartyRoomPanel';
import type {PartyParticipant, PartyRoom} from '../partyService';
import * as svc from '../extras/extrasService';

jest.mock('../extras/extrasService', () => ({
  ...jest.requireActual('../extras/extrasService'),
  listPartyPolls: jest.fn(), createPartyPoll: jest.fn(), votePartyPoll: jest.fn(), getActivePartyGame: jest.fn(),
  startPartyGame: jest.fn(), advancePartyGame: jest.fn(), spinPartyGame: jest.fn(), endPartyGame: jest.fn(),
  getPartyMonetization: jest.fn(), listPartyGifts: jest.fn(),
}));
const m = svc as unknown as Record<string, jest.Mock>;

const person = (userId: string, role: PartyParticipant['role'], seatIndex: number | null): PartyParticipant => ({userId, name: userId, avatarUrl: null, role, seatIndex, active: true, muted: false, locked: false, videoEnabled: false, joinedAt: '2026-10-06', leftAt: null});
const participants = [person('host', 'HOST', 0), person('friend', 'MEMBER', null)];
const base = {onClose: jest.fn(), onSelect: jest.fn(), participants, requests: [], lockedSeats: [], seatCount: 8, busy: false, error: null, onAction: jest.fn(), title: 'Party', partyId: 'p1',
  settings: {id: 'p1', kind: 'AUDIO', status: 'ACTIVE', title: 'Party', topic: null, category: null, language: null, interestTags: [], host: {id: 'host', name: 'host', avatarUrl: null}, participantCount: 2, scheduledStartAt: null} as PartyRoom};
const poll = (votes = [0, 0], selected: string | null = null, closed = false) => ({id: 'poll', question: 'Pick one', closed, selectedOptionId: selected,
  options: [{id: 'a', label: 'Cats', votes: votes[0]}, {id: 'b', label: 'Dogs', votes: votes[1]}]});
let tree: ReactTestRenderer;
const labels = () => tree.root.findAll(n => typeof n.props.accessibilityLabel === 'string').map(n => n.props.accessibilityLabel as string);
const text = () => tree.root.findAll(n => (n.type as unknown) === 'Text').map(n => [n.props.children].flat().join('')).join('|');
const flush = async () => {await act(async () => {await Promise.resolve(); await Promise.resolve();});};
const mount = async (identity: string, kind: 'info' | 'polls' | 'games' | 'gifts') => {
  await act(() => {tree = create(<PartyRoomPanel {...base} identity={identity} panel={{kind}} />);});
  await flush();
};
const notFound = () => Promise.reject({status: 404, message: 'nope'});

beforeEach(() => {
  Object.values(m).forEach(fn => fn.mockReset?.());
  m.listPartyPolls.mockResolvedValue([]); m.getActivePartyGame.mockResolvedValue(null);
  m.getPartyMonetization.mockResolvedValue({giftsEnabled: false, paidRoomsEnabled: false}); m.listPartyGifts.mockResolvedValue([]);
});
afterEach(() => act(() => tree?.unmount()));

test('tool entries hidden when the backend says unavailable (404/403/disabled)', async () => {
  m.listPartyPolls.mockImplementation(notFound);
  m.getActivePartyGame.mockImplementation(() => Promise.reject({status: 403}));
  await mount('host', 'info');
  expect(labels()).not.toContain('Polls');
  expect(labels()).not.toContain('Mic games');
  expect(labels()).not.toContain('Gifts');
  expect(labels()).toContain('Share party');
});

test('tool entries shown when endpoints respond and gifts enabled', async () => {
  m.getPartyMonetization.mockResolvedValue({giftsEnabled: true, paidRoomsEnabled: false});
  await mount('friend', 'info');
  expect(labels()).toEqual(expect.arrayContaining(['Polls', 'Mic games', 'Gifts']));
});

test('voting updates results from the server response', async () => {
  m.listPartyPolls.mockResolvedValue([poll([1, 1])]);
  m.votePartyPoll.mockResolvedValue(poll([2, 1], 'a'));
  await mount('friend', 'polls');
  expect(text()).toContain('2 votes');
  await act(async () => {tree.root.findByProps({accessibilityLabel: 'Vote Cats'}).props.onPress();});
  await flush();
  expect(m.votePartyPoll).toHaveBeenCalledWith('p1', 'poll', 'a');
  expect(text()).toContain('3 votes');
  expect(text()).toContain('67%');
});

test('closed polls cannot be voted on and show final results', async () => {
  m.listPartyPolls.mockResolvedValue([poll([3, 1], 'a', true)]);
  await mount('friend', 'polls');
  expect(text()).toContain('Final results');
  expect(tree.root.findByProps({accessibilityLabel: 'Vote Dogs'}).props.disabled).toBe(true);
});

test('only host/co-host can start polls; listeners see an empty state', async () => {
  await mount('friend', 'polls');
  expect(labels()).not.toContain('New poll');
  expect(text()).toContain('No polls yet');
  await act(() => tree.unmount());
  await mount('host', 'polls');
  expect(labels()).toContain('New poll');
});

test('host creates a poll through the composer', async () => {
  m.createPartyPoll.mockResolvedValue(poll());
  await mount('host', 'polls');
  await act(async () => tree.root.findByProps({accessibilityLabel: 'New poll'}).props.onPress());
  await act(async () => {tree.root.findByProps({accessibilityLabel: 'Poll question'}).props.onChangeText('Pick one');
    tree.root.findByProps({accessibilityLabel: 'Poll option 1'}).props.onChangeText('Cats');
    tree.root.findByProps({accessibilityLabel: 'Poll option 2'}).props.onChangeText('Dogs');});
  await act(async () => {tree.root.findByProps({accessibilityLabel: 'Start poll'}).props.onPress();});
  await flush();
  expect(m.createPartyPoll).toHaveBeenCalledWith('p1', 'Pick one', ['Cats', 'Dogs']);
  expect(text()).toContain('Pick one');
});

test('vote errors are shown', async () => {
  m.listPartyPolls.mockResolvedValue([poll()]);
  m.votePartyPoll.mockRejectedValue({status: 409, message: 'This poll is closed'});
  await mount('friend', 'polls');
  await act(async () => {tree.root.findByProps({accessibilityLabel: 'Vote Cats'}).props.onPress();});
  await flush();
  expect(text()).toContain('This poll is closed');
});

const todGame = (mode: 'truth' | 'dare' | null = null) => ({id: 'g', partyId: 'p1', type: 'TRUTH_OR_DARE' as const, state: {currentSeatIndex: 0, mode, prompt: null}, startedBy: 'host', startedAt: 'now', endedAt: null});

test('game state is visible to listeners without host controls', async () => {
  m.getActivePartyGame.mockResolvedValue(todGame('dare'));
  await mount('friend', 'games');
  expect(text()).toContain('Truth or Dare');
  expect(text()).toContain('dare');
  expect(labels()).not.toContain('End game');
  expect(labels()).not.toContain('Start Lucky Wheel');
  expect(labels()).not.toContain('Next player');
});

test('host sees controls and can start, spin and end', async () => {
  m.startPartyGame.mockResolvedValue({id: 'w', partyId: 'p1', type: 'LUCKY_WHEEL', state: {result: null, spinning: false}, startedBy: 'host', startedAt: 'now', endedAt: null});
  m.spinPartyGame.mockResolvedValue({id: 'w', partyId: 'p1', type: 'LUCKY_WHEEL', state: {result: 0, spinning: false}, startedBy: 'host', startedAt: 'now', endedAt: null});
  m.endPartyGame.mockResolvedValue({});
  await mount('host', 'games');
  await act(async () => {tree.root.findByProps({accessibilityLabel: 'Start Lucky Wheel'}).props.onPress();});
  await flush();
  expect(m.startPartyGame).toHaveBeenCalledWith('p1', 'LUCKY_WHEEL');
  await act(async () => {tree.root.findByProps({accessibilityLabel: 'Spin the wheel'}).props.onPress();});
  await flush();
  expect(m.spinPartyGame).toHaveBeenCalledWith('p1', 'w');
  expect(text()).toContain('The wheel picked');
  await act(async () => {tree.root.findByProps({accessibilityLabel: 'End game'}).props.onPress();});
  await flush();
  expect(m.endPartyGame).toHaveBeenCalledWith('p1', 'w');
  expect(text()).not.toContain('The wheel picked');
});

test('gifts list only shows paid gifts when enabled', async () => {
  m.getPartyMonetization.mockResolvedValue({giftsEnabled: true, paidRoomsEnabled: false});
  const gift = (id: string, status: string) => ({id, partyId: 'p1', senderId: 's', creatorId: 'c', creator: {handle: 'amy', displayName: 'Amy'}, giftType: 'rose', quantity: 2, amountMinor: 5000, currency: 'INR', status, receiptCode: null, createdAt: 'now'});
  m.listPartyGifts.mockResolvedValue([gift('1', 'PAID'), gift('2', 'PENDING')]);
  await mount('friend', 'gifts');
  expect(text()).toContain('2 × ');
  expect(text()).toContain('To Amy');
  expect(tree.root.findAll(n => (n.type as unknown) === 'Text' && [n.props.children].flat().join('').startsWith('To Amy'))).toHaveLength(1);
});
