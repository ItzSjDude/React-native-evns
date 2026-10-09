import React from 'react';
import {act, create} from 'react-test-renderer';
import {PermissionsAndroid} from 'react-native';
import AudioRoomStage from '../AudioRoomStage';
import VideoPartyStage from '../video/VideoPartyStage';
import PartyCreateSheet from '../PartyCreateSheet';
import {createParty, setPartyState, type JoinedParty, type PartyParticipant} from '../partyService';
import {PARTY_VIDEO_ROOM_OPTIONS, roomOptionsFor} from '../video/videoConfig';
import {PARTY_AUDIO_ROOM_OPTIONS} from '../audioConfig';

const mockLocal = {identity: 'me', setMicrophoneEnabled: jest.fn().mockResolvedValue(undefined), setCameraEnabled: jest.fn().mockResolvedValue(undefined), getTrackPublication: jest.fn()};
const mockHooks: {cameraOn: boolean; tracks: unknown[]} = {cameraOn: false, tracks: []};
jest.mock('@livekit/react-native', () => ({
  VideoTrack: 'VideoTrack',
  useIsSpeaking: () => false,
  useTracks: () => mockHooks.tracks,
  useConnectionState: () => 'connected',
  useRoomContext: () => ({on: jest.fn(), off: jest.fn(), state: 'connected', disconnect: jest.fn()}),
  useParticipants: () => [],
  useLocalParticipant: () => ({localParticipant: mockLocal, isMicrophoneEnabled: false, isCameraEnabled: mockHooks.cameraOn}),
}));
const mockSnapshot: {current: Record<string, any>} = {current: {}};
jest.mock('../usePartyRoomState', () => ({usePartyRoomState: () => ({snapshot: mockSnapshot.current, messages: [], addMessages: jest.fn(), refresh: jest.fn().mockResolvedValue(null), syncError: null})}));
jest.mock('../PartyRoomPanel', () => () => null);
jest.mock('../AudioOutputSheet', () => () => null);
jest.mock('../RoomChatStream', () => () => null);
jest.mock('../../users', () => ({UserProfileModal: () => null}));
jest.mock('../partyService', () => ({
  createParty: jest.fn(), getPartyInvitees: jest.fn().mockResolvedValue([]), setPartyState: jest.fn().mockResolvedValue({}),
  deletePartyChat: jest.fn(), respondPartyInvitation: jest.fn(), transferPartyHost: jest.fn(), updatePartySettings: jest.fn(), approvePartySeat: jest.fn(), blockPartyParticipant: jest.fn(),
  cancelPartySeatRequest: jest.fn(), denyPartySeat: jest.fn(), endParty: jest.fn(), inviteToPartySeat: jest.fn(), joinParty: jest.fn(), leaveParty: jest.fn(), movePartySpeakerToAudience: jest.fn(),
  patchPartySeat: jest.fn(), releasePartySeat: jest.fn(), removePartyParticipant: jest.fn(), reportPartyParticipant: jest.fn(), requestPartySeat: jest.fn(), sendPartyChat: jest.fn(), setPartyCoHost: jest.fn(),
}));

const person = (userId: string, seatIndex: number | null, extra: Partial<PartyParticipant> = {}): PartyParticipant => ({
  userId, name: userId.toUpperCase(), avatarUrl: null, role: seatIndex === 0 ? 'HOST' : 'MEMBER', muted: false, videoEnabled: false, seatIndex, locked: false, active: true, joinedAt: null, leftAt: null, ...extra,
});
const session = (kind: 'AUDIO' | 'VIDEO') => ({party: {id: 'p1', kind}, participants: [], media: {}} as unknown as JoinedParty);
const snapshot = (kind: 'AUDIO' | 'VIDEO', participants: PartyParticipant[], seatCount = 4) => ({
  party: {id: 'p1', kind, seatCount, title: 'Room', topic: null, host: {id: 'host', name: 'H', avatarUrl: null}}, participants, seatRequests: [], lockedSeats: [], chatMessages: [], realtimeUrl: null,
});
const labels = (tree: ReturnType<typeof create>) => tree.root.findAll(node => typeof node.props.accessibilityLabel === 'string').map(node => node.props.accessibilityLabel as string);
const has = (tree: ReturnType<typeof create>, pattern: RegExp) => labels(tree).some(label => pattern.test(label));
const mountStage = async (kind: 'AUDIO' | 'VIDEO', participants: PartyParticipant[]) => {
  mockSnapshot.current = snapshot(kind, participants);
  let tree!: ReturnType<typeof create>;
  await act(async () => {tree = create(<AudioRoomStage session={session(kind)} onClose={jest.fn()} closeRequest={{current: null}} connectionError={null} expanded onMinimize={jest.fn()} onExpand={jest.fn()} />);});
  return tree;
};

beforeEach(() => {jest.clearAllMocks(); mockHooks.cameraOn = false; mockHooks.tracks = []; mockLocal.identity = 'me';});

describe('create sheet', () => {
  const submit = async (pick?: string) => {
    let tree!: ReturnType<typeof create>;
    await act(async () => {tree = create(<PartyCreateSheet onClose={jest.fn()} onCreated={jest.fn()} />);});
    (createParty as jest.Mock).mockResolvedValue({party: {}, participants: []});
    if (pick) await act(async () => tree.root.findByProps({accessibilityLabel: pick}).props.onPress());
    await act(async () => tree.root.findByProps({accessibilityLabel: 'Party name'}).props.onChangeText('Movie night'));
    await act(async () => tree.root.findByProps({accessibilityLabel: 'Create party'}).props.onPress());
    return (createParty as jest.Mock).mock.calls[0][0];
  };
  test('defaults to an audio party with 8 seats', async () => {
    expect(await submit()).toMatchObject({kind: 'AUDIO', seatCount: 8});
  });
  test('video choice sends kind VIDEO with 4 seats', async () => {
    expect(await submit('Video party')).toMatchObject({kind: 'VIDEO', seatCount: 4});
  });
});

describe('video stage', () => {
  const live = new Map();
  test('renders one tile per seat with video, avatar fallback and empty seats', async () => {
    const camera = {participant: {identity: 'a'}, publication: {track: {}, isMuted: false}};
    const a = person('a', 0), b = person('b', 1, {muted: true});
    let tree!: ReturnType<typeof create>;
    await act(async () => {tree = create(<VideoPartyStage seatCount={4} speakers={[a, b]} liveById={live} localIdentity="a" lockedSeats={[3]} onSeatPress={jest.fn()} />);});
    mockHooks.tracks = [camera];
    await act(async () => {tree.update(<VideoPartyStage seatCount={4} speakers={[a, b]} liveById={live} localIdentity="a" lockedSeats={[3]} onSeatPress={jest.fn()} />);});
    expect(tree.root.findAllByType('VideoTrack' as never)).toHaveLength(1);
    expect(labels(tree)).toEqual(expect.arrayContaining(['A, you, on stage, camera on', 'B, muted, camera off', 'Request speaker seat 3', 'Locked seat 4']));
  });
  test('tapping an empty seat reports its index', async () => {
    const onSeatPress = jest.fn();
    let tree!: ReturnType<typeof create>;
    await act(async () => {tree = create(<VideoPartyStage seatCount={4} speakers={[]} liveById={live} localIdentity="a" onSeatPress={onSeatPress} />);});
    await act(async () => tree.root.findByProps({accessibilityLabel: 'Request speaker seat 2'}).props.onPress());
    expect(onSeatPress).toHaveBeenCalledWith(undefined, 1);
  });
});

describe('video room', () => {
  test('seated speakers get a camera toggle, audience does not', async () => {
    const speaker = await mountStage('VIDEO', [person('host', 0), person('me', 1)]);
    expect(has(speaker, /^Turn camera on$/)).toBe(true);
    const audience = await mountStage('VIDEO', [person('host', 0), person('me', null)]);
    expect(has(audience, /^(Turn camera|Switch camera)/)).toBe(false);
    expect(has(audience, /^Request to speak$/)).toBe(true);
  });
  test('turning the camera on requests permission, syncs the backend, then publishes', async () => {
    const tree = await mountStage('VIDEO', [person('host', 0), person('me', 1)]);
    await act(async () => {await tree.root.findByProps({accessibilityLabel: 'Turn camera on'}).props.onPress();});
    expect(setPartyState).toHaveBeenCalledWith('p1', {videoEnabled: true});
    expect(mockLocal.setCameraEnabled).toHaveBeenCalledWith(true);
  });
  test('denied camera permission on Android shows no publish', async () => {
    const platform = require('react-native').Platform;
    const original = platform.OS; platform.OS = 'android';
    jest.spyOn(PermissionsAndroid, 'check').mockResolvedValue(false);
    jest.spyOn(PermissionsAndroid, 'request').mockResolvedValue('denied');
    const alert = jest.spyOn(require('react-native').Alert, 'alert').mockImplementation(() => {});
    const tree = await mountStage('VIDEO', [person('host', 0), person('me', 1)]);
    await act(async () => {await tree.root.findByProps({accessibilityLabel: 'Turn camera on'}).props.onPress();});
    platform.OS = original;
    expect(alert).toHaveBeenCalledWith('Camera access needed', expect.any(String), expect.any(Array));
    expect(mockLocal.setCameraEnabled).not.toHaveBeenCalledWith(true);
  });
  test('the camera is released when the speaker is moved to the audience', async () => {
    mockHooks.cameraOn = true;
    const tree = await mountStage('VIDEO', [person('host', 0), person('me', 1)]);
    mockSnapshot.current = snapshot('VIDEO', [person('host', 0), person('me', null)]);
    await act(async () => {tree.update(<AudioRoomStage session={session('VIDEO')} onClose={jest.fn()} closeRequest={{current: null}} connectionError={null} expanded onMinimize={jest.fn()} onExpand={jest.fn()} />);});
    expect(mockLocal.setCameraEnabled).toHaveBeenCalledWith(false);
  });
  test('the camera is released when the room is minimized and when it unmounts', async () => {
    mockHooks.cameraOn = true;
    const props = {session: session('VIDEO'), onClose: jest.fn(), closeRequest: {current: null}, connectionError: null, onMinimize: jest.fn(), onExpand: jest.fn()};
    mockSnapshot.current = snapshot('VIDEO', [person('host', 0), person('me', 1)]);
    let tree!: ReturnType<typeof create>;
    await act(async () => {tree = create(<AudioRoomStage {...props} expanded />);});
    expect(mockLocal.setCameraEnabled).not.toHaveBeenCalled();
    await act(async () => {tree.update(<AudioRoomStage {...props} expanded={false} />);});
    expect(mockLocal.setCameraEnabled).toHaveBeenCalledWith(false);
    mockLocal.setCameraEnabled.mockClear();
    await act(async () => tree.unmount());
    expect(mockLocal.setCameraEnabled).toHaveBeenCalledWith(false);
  });
});

describe('audio room regression', () => {
  test('audio rooms have no camera control and never touch the camera', async () => {
    mockHooks.cameraOn = true;
    const tree = await mountStage('AUDIO', [person('host', 0), person('me', 1)]);
    expect(has(tree, /^(Turn camera|Switch camera)/)).toBe(false);
    expect(has(tree, /^Mute microphone$|^Unmute microphone$/)).toBe(true);
    expect(has(tree, /audio party/)).toBe(true);
    await act(async () => tree.unmount());
    expect(mockLocal.setCameraEnabled).not.toHaveBeenCalled();
  });
  test('room options: video caps capture at 480p, audio is untouched', () => {
    expect(roomOptionsFor('AUDIO')).toBe(PARTY_AUDIO_ROOM_OPTIONS);
    expect(roomOptionsFor('VIDEO')).toBe(PARTY_VIDEO_ROOM_OPTIONS);
    expect(PARTY_VIDEO_ROOM_OPTIONS.videoCaptureDefaults?.resolution).toMatchObject({width: 640, height: 480});
  });
});
