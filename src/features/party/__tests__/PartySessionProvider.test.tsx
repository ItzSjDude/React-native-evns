import React from 'react';
import {Alert, AppState} from 'react-native';
import {act, create, type ReactTestRenderer} from 'react-test-renderer';
import {PartySessionProvider, resetRetainedPartySession, usePartySession} from '../PartySessionProvider';
import {joinParty, type JoinedParty} from '../partyService';
import {stopPartyAudioService} from '../../../core/audio/backgroundAudio';

const mockRoomProps: {current: Record<string, any> | null} = {current: null};
jest.mock('../PartyAudioRoom', () => (props: Record<string, any>) => {mockRoomProps.current = props; return null;});
jest.mock('../partyService', () => ({joinParty: jest.fn()}));
jest.mock('../../auth', () => ({loadSession: jest.fn().mockResolvedValue({user: {id: 'me'}})}));
jest.mock('../../../core/audio/backgroundAudio', () => ({stopPartyAudioService: jest.fn().mockResolvedValue(undefined)}));

const party = (id: string, status = 'ACTIVE'): JoinedParty => ({
  party: {id, kind: 'AUDIO', status, title: `Room ${id}`, topic: null, category: null, language: null, interestTags: [], host: {id: 'host', name: 'Host', avatarUrl: null}, participantCount: 1, scheduledStartAt: null, participants: []},
  participants: [],
  media: {provider: 'livekit', url: 'wss://lk', roomName: id, token: `token-${id}`, expiresAt: '2099-01-01T00:00:00Z'},
} as unknown as JoinedParty);

let ctx: ReturnType<typeof usePartySession>;
const Probe = () => {ctx = usePartySession(); return null;};
const join = joinParty as jest.Mock;
let tree: ReactTestRenderer;
const mount = async () => {await act(async () => {tree = create(<PartySessionProvider><Probe /></PartySessionProvider>);});};
const unmount = async () => {await act(async () => tree.unmount());};

beforeEach(() => {
  resetRetainedPartySession();
  mockRoomProps.current = null;
  jest.clearAllMocks();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  (AppState as {currentState: string}).currentState = 'active';
});

test('a fresh runtime stops an orphaned background audio service left by a previous JS context', async () => {
  await mount();
  expect(stopPartyAudioService).toHaveBeenCalledTimes(1);
  expect(ctx.session).toBeNull();
  await unmount();
});

test('re-opening the same party refreshes it without the "already in a party" prompt', async () => {
  await mount();
  await act(async () => ctx.open(party('a')));
  await act(async () => mockRoomProps.current!.onMinimize());
  expect(mockRoomProps.current!.expanded).toBe(false);
  await act(async () => ctx.open(party('a')));
  expect(Alert.alert).not.toHaveBeenCalled();
  expect(mockRoomProps.current!.expanded).toBe(true);
  await unmount();
});

test('joining another party while in one shows the guidance with a leave option', async () => {
  await mount();
  await act(async () => ctx.open(party('a')));
  const leave = jest.fn();
  mockRoomProps.current!.leaveRequest.current = leave;
  await act(async () => mockRoomProps.current!.onMinimize());
  await act(async () => ctx.open(party('b')));
  expect(ctx.session?.party.id).toBe('a');
  expect(Alert.alert).toHaveBeenCalledWith('Already in a party', expect.stringContaining('Room a'), expect.any(Array));
  const buttons = (Alert.alert as jest.Mock).mock.calls[0][2] as {text: string; onPress?: () => void}[];
  expect(buttons.map(b => b.text)).toEqual(['Stay', 'Return to party', 'Leave current party']);
  const dismissPreview = jest.fn();
  await act(async () => ctx.promptActiveParty(dismissPreview));
  const leaveButton = ((Alert.alert as jest.Mock).mock.calls[1][2] as {text: string; onPress: () => void}[])[2];
  await act(async () => leaveButton.onPress());
  expect(dismissPreview).toHaveBeenCalled();
  expect(leave).toHaveBeenCalled();
  expect(mockRoomProps.current!.expanded).toBe(true);
  await unmount();
});

test('a recreated surface restores the party minimized with a fresh media token', async () => {
  await mount();
  await act(async () => ctx.open(party('a')));
  await unmount(); // MainActivity destroyed: React surface stops, JS runtime survives.
  mockRoomProps.current = null;
  join.mockResolvedValue({...party('a'), media: {...party('a').media, token: 'fresh'}});
  await mount();
  expect(join).toHaveBeenCalledWith('a');
  expect(stopPartyAudioService).toHaveBeenCalledTimes(1); // only the first runtime mount
  expect(ctx.session?.party.id).toBe('a');
  expect(mockRoomProps.current!.session.media.token).toBe('fresh');
  expect(mockRoomProps.current!.expanded).toBe(false);
  // Join guard still works after restore.
  await act(async () => ctx.open(party('b')));
  expect(Alert.alert).toHaveBeenCalledWith('Already in a party', expect.any(String), expect.any(Array));
  await unmount();
});

test('a recreated surface resets cleanly when the stale party is gone', async () => {
  await mount();
  await act(async () => ctx.open(party('a')));
  await unmount();
  mockRoomProps.current = null;
  join.mockRejectedValue({status: 404, message: 'Party not found'});
  await mount();
  expect(ctx.session).toBeNull();
  expect(mockRoomProps.current).toBeNull();
  await act(async () => ctx.open(party('b')));
  expect(Alert.alert).not.toHaveBeenCalled();
  expect(ctx.session?.party.id).toBe('b');
  await unmount();
});

test('closing the room forgets it so a later surface does not restore it', async () => {
  await mount();
  await act(async () => ctx.open(party('a')));
  await act(async () => mockRoomProps.current!.onClose());
  await unmount();
  await mount();
  expect(join).not.toHaveBeenCalled();
  expect(ctx.session).toBeNull();
  await unmount();
});

test('the room is not mounted until the app is in the foreground', async () => {
  await mount();
  await act(async () => ctx.open(party('a')));
  await unmount();
  mockRoomProps.current = null;
  join.mockResolvedValue(party('a'));
  (AppState as {currentState: string}).currentState = 'background';
  const listeners: ((state: string) => void)[] = [];
  const spy = jest.spyOn(AppState, 'addEventListener').mockImplementation(((_: string, fn: (state: string) => void) => {listeners.push(fn); return {remove: jest.fn()};}) as never);
  await mount();
  expect(mockRoomProps.current).toBeNull();
  await act(async () => listeners.forEach(fn => fn('active')));
  expect(mockRoomProps.current!.session.party.id).toBe('a');
  spy.mockRestore();
  await unmount();
});
