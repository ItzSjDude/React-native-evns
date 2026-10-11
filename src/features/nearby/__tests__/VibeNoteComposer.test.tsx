import React from 'react';
import {Text, TextInput} from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import VibeNoteComposer from '../VibeNoteComposer';
import {getDeviceLocation} from '../deviceLocation';
import {createVibeNote} from '../vibeNoteService';
import {openPaywall, refreshSubscription, usePlus} from '../../plus';

jest.mock('../../plus', () => ({
  ...jest.requireActual('../../plus'),
  usePlus: jest.fn(), openPaywall: jest.fn(), refreshSubscription: jest.fn(),
}));
jest.mock('../deviceLocation', () => ({getDeviceLocation: jest.fn()}));
jest.mock('../vibeNoteService', () => ({createVibeNote: jest.fn()}));

const plus = usePlus as jest.Mock;
const create = createVibeNote as jest.Mock;

const plusState = (maxMinutes: number, isPlus: boolean, used = 1, perDay = 2) => ({
  enabled: true, isPlus,
  subscription: {limits: {vibeNotesPerDay: perDay, vibeNoteMaxMinutes: maxMinutes}, usage: {vibeNotesToday: used}},
});
const allText = (renderer: ReactTestRenderer.ReactTestRenderer) =>
  renderer.root.findAllByType(Text).map(node => React.Children.toArray(node.props.children).join('')).join('\n');
const byLabel = (renderer: ReactTestRenderer.ReactTestRenderer, label: string) =>
  renderer.root.findAll(node => node.props.accessibilityLabel === label && (typeof node.props.onPress === 'function' || node.type === TextInput))[0];

let tree: ReactTestRenderer.ReactTestRenderer;
const render = async (onClose = jest.fn(), onPosted = jest.fn()) => {
  await ReactTestRenderer.act(async () => { tree = ReactTestRenderer.create(<VibeNoteComposer visible onClose={onClose} onPosted={onPosted} />); });
  return {onClose, onPosted};
};
const type = (text: string) => ReactTestRenderer.act(() => { byLabel(tree, 'Vibe note').props.onChangeText(text); });
const press = (label: string) => ReactTestRenderer.act(async () => { await byLabel(tree, label).props.onPress(); });

beforeEach(() => {
  jest.clearAllMocks();
  (getDeviceLocation as jest.Mock).mockResolvedValue({lat: 13, lng: 80});
  (refreshSubscription as jest.Mock).mockResolvedValue(null);
  create.mockResolvedValue({id: 'n1'});
  plus.mockReturnValue(plusState(240, false));
});
afterEach(() => ReactTestRenderer.act(() => tree.unmount()));

test('free users get chips up to their limit, longer ones locked and opening the paywall', async () => {
  await render();
  expect(allText(tree)).toContain('1 of 2 posted today');
  for (const label of ['30m', '1h', '4h']) expect(byLabel(tree, label)).toBeDefined();
  expect(byLabel(tree, '12h')).toBeUndefined();
  await press('12h, Plus only');
  expect(openPaywall).toHaveBeenCalledWith('vibeNoteLifetime');
  expect(byLabel(tree, '24h, Plus only')).toBeDefined();
});

test('Plus users can pick every duration and nothing is locked', async () => {
  plus.mockReturnValue(plusState(1440, true, 3, 10));
  await render();
  expect(byLabel(tree, '24h')).toBeDefined();
  expect(allText(tree)).toContain('3 of 10 posted today');
  expect(allText(tree)).not.toContain('Plus only');
});

test('posts at the default 1h, then refreshes the list and subscription and closes', async () => {
  const {onClose, onPosted} = await render();
  await type('  sunset here  ');
  await press('Post');
  expect(create).toHaveBeenCalledWith({body: 'sunset here', lat: 13, lng: 80, expiresInMinutes: 60});
  expect(onPosted).toHaveBeenCalled();
  expect(refreshSubscription).toHaveBeenCalled();
  expect(onClose).toHaveBeenCalled();
});

test('caps the lifetime at the plan limit when the default is longer', async () => {
  plus.mockReturnValue(plusState(30, false));
  await render();
  await type('hi');
  await press('Post');
  expect(create).toHaveBeenCalledWith(expect.objectContaining({expiresInMinutes: 30}));
});

test('LIMIT_REACHED shows the message, keeps the draft and stops the spinner', async () => {
  create.mockRejectedValue({status: 429, code: 'LIMIT_REACHED', message: 'Daily Vibe Note limit reached', details: {limit: 'vibeNotes', used: 2, max: 2, plusAvailable: true}});
  const {onClose, onPosted} = await render();
  await type('keep me');
  await press('Post');
  expect(allText(tree)).toContain('You’ve reached today’s limit for vibe notes.');
  expect(byLabel(tree, 'Vibe note').props.value).toBe('keep me');
  expect(byLabel(tree, 'Post').props.accessibilityState.busy).toBe(false);
  expect(onPosted).not.toHaveBeenCalled();
  expect(onClose).not.toHaveBeenCalled();
  expect(refreshSubscription).toHaveBeenCalled();
});

test('missing location permission blocks the post with a message', async () => {
  (getDeviceLocation as jest.Mock).mockResolvedValue(null);
  await render();
  await type('hi');
  await press('Post');
  expect(create).not.toHaveBeenCalled();
  expect(allText(tree)).toContain('Allow location access to post a vibe note.');
});

test('Post is disabled for an empty note and the input is capped at 280', async () => {
  await render();
  expect(byLabel(tree, 'Post').props.accessibilityState.disabled).toBe(true);
  expect(byLabel(tree, 'Vibe note').props.maxLength).toBe(280);
  await type('x');
  expect(allText(tree)).toContain('1/280');
});
