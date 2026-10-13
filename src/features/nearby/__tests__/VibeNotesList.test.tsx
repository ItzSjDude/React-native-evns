import React from 'react';
import {Text} from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import VibeNotesList, {noteDistanceLabel, postedAgoLabel, timeLeftLabel} from '../VibeNotesList';
import {deleteVibeNote, getNearbyVibeNotes, openVibeNote} from '../vibeNoteService';
import type {VibeNote} from '../vibeNoteTypes';

jest.mock('../../auth', () => ({loadSession: jest.fn().mockResolvedValue({user: {id: 'me'}})}));
jest.mock('../VibeNoteComposer', () => () => null);
jest.mock('../vibeNoteService', () => ({getNearbyVibeNotes: jest.fn(), openVibeNote: jest.fn(), deleteVibeNote: jest.fn()}));

const list = getNearbyVibeNotes as jest.Mock;
const open = openVibeNote as jest.Mock;
const remove = deleteVibeNote as jest.Mock;

const now = Date.now();
const note = (overrides: Partial<VibeNote> & {id: string}): VibeNote => ({
  body: `body ${overrides.id}`, distanceMeters: 120, radiusMeters: 150, isUnlocked: true,
  createdAt: new Date(now - 5 * 60_000).toISOString(), expiresAt: new Date(now + 200 * 60_000 + 5000).toISOString(),
  creator: {id: 'other', name: 'Asha', avatarUrl: null}, ...overrides,
});

const allText = (renderer: ReactTestRenderer.ReactTestRenderer) =>
  renderer.root.findAllByType(Text).map(node => React.Children.toArray(node.props.children).join('')).join('\n');
const all = (renderer: ReactTestRenderer.ReactTestRenderer, label: string) =>
  renderer.root.findAll(node => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function');

let tree: ReactTestRenderer.ReactTestRenderer;
const render = async () => { await ReactTestRenderer.act(async () => { tree = ReactTestRenderer.create(<VibeNotesList radiusMeters={2000} />); }); };

beforeEach(() => {
  jest.clearAllMocks();
  open.mockResolvedValue(undefined);
  remove.mockResolvedValue(undefined);
  list.mockResolvedValue([
    note({id: 'a'}),
    note({id: 'b', creator: {id: 'me', name: 'Me', avatarUrl: null}}),
    note({id: 'c', isUnlocked: false, body: undefined, preview: 'secret start'}),
  ]);
});
afterEach(() => ReactTestRenderer.act(() => tree.unmount()));

test('lists notes with creator, distance and time, locking the ones out of range', async () => {
  await render();
  expect(list).toHaveBeenCalledWith(2000);
  const text = allText(tree);
  expect(text).toContain('body a');
  expect(text).toContain('Asha · 120 m away · 5m ago · 3h 20m left');
  expect(text).toContain('secret start');
  expect(text).toContain('Get within 150 m to read it');
  expect(text).not.toContain('body c');
});

test('the People preview stays short and can reveal all nearby notes', async () => {
  await ReactTestRenderer.act(async () => {tree = ReactTestRenderer.create(<VibeNotesList radiusMeters={2000} previewLimit={2} showComposeAction={false} />);});
  expect(allText(tree)).toContain('body a');
  expect(allText(tree)).toContain('body b');
  expect(allText(tree)).not.toContain('secret start');
  await ReactTestRenderer.act(async () => {all(tree, 'See all vibe notes')[0].props.onPress();});
  expect(allText(tree)).toContain('secret start');
  await ReactTestRenderer.act(async () => {all(tree, 'Show fewer vibe notes')[0].props.onPress();});
  expect(allText(tree)).not.toContain('secret start');
});

test('tapping an unlocked note opens it once; a failing open does not break the UI', async () => {
  open.mockRejectedValue(new Error('offline'));
  await render();
  await ReactTestRenderer.act(async () => { all(tree, 'Open vibe note')[0].props.onPress(); });
  expect(open).toHaveBeenCalledWith('a');
  await ReactTestRenderer.act(async () => { all(tree, 'Locked vibe note')[0].props.onPress(); });
  expect(open).toHaveBeenCalledTimes(1);
  expect(allText(tree)).toContain('body a');
});

test('only the author sees delete, and deleting removes the note', async () => {
  await render();
  const buttons = all(tree, 'Delete vibe note');
  expect(buttons).toHaveLength(1);
  await ReactTestRenderer.act(async () => { await buttons[0].props.onPress(); });
  expect(remove).toHaveBeenCalledWith('b');
  expect(allText(tree)).not.toContain('body b');
  expect(allText(tree)).toContain('body a');
});

test('a failed delete keeps the note and shows the error', async () => {
  remove.mockRejectedValue({status: 500, message: 'Boom'});
  await render();
  await ReactTestRenderer.act(async () => { await all(tree, 'Delete vibe note')[0].props.onPress(); });
  expect(allText(tree)).toContain('body b');
  expect(allText(tree)).toContain('Boom');
});

test('shows an empty state and a retryable error', async () => {
  list.mockResolvedValueOnce([]);
  await render();
  expect(allText(tree)).toContain('No notes within 2 km yet');
  expect(allText(tree)).toContain('Be the first to leave one.');
  list.mockRejectedValueOnce({status: 400, message: 'Post your location before searching vibe notes'});
  await ReactTestRenderer.act(async () => { tree.update(<VibeNotesList radiusMeters={5000} />); });
  expect(allText(tree)).toContain('Post your location before searching vibe notes');
});

test('formats time and distance', () => {
  expect(timeLeftLabel(new Date(now + 12 * 60_000 + 5000).toISOString(), now)).toBe('12m left');
  expect(timeLeftLabel(new Date(now + 120 * 60_000 + 5000).toISOString(), now)).toBe('2h left');
  expect(timeLeftLabel(new Date(now - 1000).toISOString(), now)).toBe('ending');
  expect(postedAgoLabel(new Date(now - 30_000).toISOString(), now)).toBe('now');
  expect(postedAgoLabel(new Date(now - 125 * 60_000).toISOString(), now)).toBe('2h ago');
  expect(noteDistanceLabel(4)).toBe('10 m away');
  expect(noteDistanceLabel(1500)).toBe('1.5 km away');
});
