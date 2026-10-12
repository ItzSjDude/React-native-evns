import React from 'react';
import {Text, TextInput} from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import SearchScreen from '../SearchScreen';
import {RECENT_SEARCHES_KEY} from '../recentSearches';
import {searchPeople, searchRooms} from '../searchService';
import type {PersonResult, RoomResult} from '../types';

jest.mock('../../users', () => {
  const {Text: MockText} = require('react-native');
  return {
    UserProfileModal: ({userId, initial, visible}: {userId: string; initial?: {name: string}; visible: boolean}) =>
      visible ? <MockText testID="user-profile-modal">{`profile:${userId}:${initial?.name}`}</MockText> : null,
  };
});
jest.mock('../searchService', () => ({
  ...jest.requireActual('../searchService'),
  searchPeople: jest.fn(),
  searchRooms: jest.fn(),
}));

type Renderer = ReactTestRenderer.ReactTestRenderer;
const mockPeople = searchPeople as jest.Mock;
const mockRooms = searchRooms as jest.Mock;

const asha: PersonResult = {id: 'u2', name: 'Asha K', handle: 'asha_k', avatarUrl: null, isFollowing: true};
const room = (overrides: Partial<RoomResult>): RoomResult => ({
  id: 'r1', kind: 'AUDIO', status: 'ACTIVE', title: 'Late night lofi', topic: null, category: null, language: null,
  interestTags: [], host: {id: 'h1', name: 'Dev', avatarUrl: null}, participantCount: 12, scheduledStartAt: null, ...overrides,
});

const texts = (tree: Renderer) => tree.root.findAllByType(Text).map(node => [node.props.children].flat().join(''));
const byLabel = (tree: Renderer, label: string) =>
  tree.root.findAll(node => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function');
const press = (tree: Renderer, label: string) => ReactTestRenderer.act(async () => {
  const [node] = byLabel(tree, label);
  if (!node) throw new Error(`No pressable labelled "${label}"`);
  node.props.onPress();
});
const input = (tree: Renderer) => tree.root.findByType(TextInput);
const type = (tree: Renderer, value: string) => ReactTestRenderer.act(async () => {input(tree).props.onChangeText(value);});
const advance = (ms: number) => ReactTestRenderer.act(async () => {jest.advanceTimersByTime(ms);});

let tree: Renderer | undefined;
const render = async (props: Partial<React.ComponentProps<typeof SearchScreen>> = {}) => {
  await ReactTestRenderer.act(async () => {
    tree = ReactTestRenderer.create(<SearchScreen visible onClose={jest.fn()} {...props} />);
  });
  return tree!;
};

beforeEach(async () => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  await AsyncStorage.clear();
  mockPeople.mockResolvedValue([asha]);
  mockRooms.mockResolvedValue([]);
});
afterEach(async () => {
  await ReactTestRenderer.act(async () => tree?.unmount());
  tree = undefined;
  jest.useRealTimers();
});

test('debounces typing by 300ms and searches only the final term', async () => {
  const screen = await render();
  expect(input(screen).props.autoFocus).toBe(true);
  await type(screen, 'a');
  await advance(100);
  await type(screen, 'as');
  await advance(100);
  await type(screen, 'ash');
  await advance(299);
  expect(mockPeople).not.toHaveBeenCalled();
  expect(mockRooms).not.toHaveBeenCalled();
  await advance(1);
  expect(mockPeople).toHaveBeenCalledTimes(1);
  expect(mockPeople).toHaveBeenCalledWith('ash', expect.objectContaining({signal: expect.any(Object)}));
  expect(mockRooms).toHaveBeenCalledTimes(1);
  expect(mockRooms).toHaveBeenCalledWith('ash', expect.objectContaining({signal: expect.any(Object)}));
});

test('a new query aborts the in-flight request and its late response is ignored', async () => {
  let resolveFirst!: (rows: PersonResult[]) => void;
  mockPeople.mockImplementationOnce(() => new Promise(resolve => {resolveFirst = resolve;}));
  const screen = await render();
  await type(screen, 'old');
  await advance(300);
  const firstSignal: AbortSignal = mockPeople.mock.calls[0][1].signal;
  const firstRoomsSignal: AbortSignal = mockRooms.mock.calls[0][1].signal;
  expect(firstSignal.aborted).toBe(false);

  mockPeople.mockResolvedValueOnce([{...asha, id: 'u9', name: 'Newer Person', handle: null, isFollowing: false}]);
  await type(screen, 'new');
  expect(firstSignal.aborted).toBe(true);
  expect(firstRoomsSignal.aborted).toBe(true);
  await advance(300);
  expect(mockPeople.mock.calls[1][0]).toBe('new');

  await ReactTestRenderer.act(async () => {resolveFirst([asha]);});
  expect(texts(screen)).toContain('Newer Person');
  expect(texts(screen)).not.toContain('Asha K');
});

test('closing the screen aborts the pending search', async () => {
  mockPeople.mockImplementationOnce(() => new Promise(() => {}));
  const screen = await render();
  await type(screen, 'asha');
  await advance(300);
  const signal: AbortSignal = mockPeople.mock.calls[0][1].signal;
  await ReactTestRenderer.act(async () => {screen.update(<SearchScreen visible={false} onClose={jest.fn()} />);});
  expect(signal.aborted).toBe(true);
});

test('recent searches are persisted to AsyncStorage and restored on the next open', async () => {
  const screen = await render();
  await type(screen, '  Lofi  ');
  await advance(300);
  await ReactTestRenderer.act(async () => {input(screen).props.onSubmitEditing();});
  expect(AsyncStorage.setItem).toHaveBeenCalledWith(RECENT_SEARCHES_KEY, JSON.stringify(['Lofi']));
  await ReactTestRenderer.act(async () => screen.unmount());

  const next = await render();
  expect(texts(next)).toContain('Lofi');
  await press(next, 'Search Lofi');
  expect(input(next).props.value).toBe('Lofi');

  await press(next, 'Clear search');
  await press(next, 'Remove Lofi from recent searches');
  expect(AsyncStorage.removeItem).toHaveBeenCalledWith(RECENT_SEARCHES_KEY);
  expect(texts(next)).toContain('Find people and rooms');
});

test('a corrupt recent-searches entry falls back to the empty state', async () => {
  await AsyncStorage.setItem(RECENT_SEARCHES_KEY, '{not json');
  const screen = await render();
  expect(texts(screen)).toContain('Find people and rooms');
});

test('tapping a person opens their profile and remembers the query', async () => {
  const screen = await render();
  await type(screen, 'asha');
  await advance(300);
  expect(texts(screen)).toEqual(expect.arrayContaining(['Asha K', '@asha_k', 'Following']));
  expect(screen.root.findAllByProps({testID: 'user-profile-modal'})).toHaveLength(0);
  await press(screen, "Open Asha K's profile");
  expect(screen.root.findByProps({testID: 'user-profile-modal'}).props.children).toBe('profile:u2:Asha K');
  expect(AsyncStorage.setItem).toHaveBeenCalledWith(RECENT_SEARCHES_KEY, JSON.stringify(['asha']));
});

test('rooms tab renders live and scheduled badges and opens the party', async () => {
  const onOpenParty = jest.fn();
  const live = room({});
  const scheduled = room({id: 'r2', status: 'SCHEDULED', title: 'Sunday book club', participantCount: 0, scheduledStartAt: '2026-10-11T14:00:00Z'});
  mockRooms.mockResolvedValue([live, scheduled]);
  const screen = await render({onOpenParty});
  await type(screen, 'club');
  await advance(300);
  await press(screen, 'Rooms results');
  const shown = texts(screen);
  expect(shown).toEqual(expect.arrayContaining(['Late night lofi', 'Sunday book club', 'LIVE', '12']));
  expect(screen.root.findAll(node => node.props.accessibilityLabel === 'Live now')).not.toHaveLength(0);
  expect(screen.root.findAll(node => typeof node.props.accessibilityLabel === 'string' && node.props.accessibilityLabel.startsWith('Scheduled '))).not.toHaveLength(0);
  await press(screen, 'Open room Sunday book club');
  expect(onOpenParty).toHaveBeenCalledWith('r2', scheduled);
});

test('shows coming-soon for people when the endpoint is missing, plus error and no-results states', async () => {
  mockPeople.mockRejectedValue({status: 404, message: 'Route not found'});
  mockRooms.mockResolvedValueOnce([]);
  const screen = await render();
  await type(screen, 'zzz');
  await advance(300);
  expect(texts(screen)).toContain('No results for “zzz”');

  await press(screen, 'People results');
  expect(texts(screen)).toContain('People search is coming soon');

  mockRooms.mockRejectedValueOnce({status: 500, message: 'Server is down'});
  await press(screen, 'Rooms results');
  await type(screen, 'zzzz');
  await advance(300);
  expect(texts(screen)).toEqual(expect.arrayContaining(['Couldn’t search rooms', 'Server is down']));

  mockRooms.mockResolvedValueOnce([room({title: 'Recovered'})]);
  await press(screen, 'Try again');
  await advance(300);
  expect(texts(screen)).toContain('Recovered');
});
