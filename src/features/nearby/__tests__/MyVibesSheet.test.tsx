import React from 'react';
import {Alert, Text} from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import MyVibesSheet from '../MyVibesSheet';
import {deleteVibeNote, getMyVibeNotes} from '../vibeNoteService';

jest.mock('../../../components/BottomSheet', () => ({visible, children}: {visible: boolean; children: React.ReactNode}) => visible ? children : null);
jest.mock('../vibeNoteService', () => ({MY_VIBES_PAGE_SIZE: 20, getMyVibeNotes: jest.fn(), deleteVibeNote: jest.fn()}));

const getMine = getMyVibeNotes as jest.Mock;
const remove = deleteVibeNote as jest.Mock;
const textContent = (renderer: ReactTestRenderer.ReactTestRenderer) =>
  renderer.root.findAllByType(Text).map(node => React.Children.toArray(node.props.children).join('')).join('\n');
const control = (renderer: ReactTestRenderer.ReactTestRenderer, label: string) =>
  renderer.root.findAll(node => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function')[0];
const item = (id: string) => ({id, body: `Vibe ${id}`, radiusMeters: 150,
  createdAt: new Date(Date.now() - 60_000).toISOString(), expiresAt: new Date(Date.now() + 60 * 60_000).toISOString()});

beforeEach(() => {jest.clearAllMocks(); remove.mockResolvedValue(undefined);});

test('shows only own API results and pages them without location', async () => {
  getMine.mockResolvedValueOnce({data: [item('one')], meta: {limit: 20, offset: 0, hasMore: true}})
    .mockResolvedValueOnce({data: [item('two')], meta: {limit: 20, offset: 1, hasMore: false}});
  let renderer: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {renderer = ReactTestRenderer.create(<MyVibesSheet visible onClose={jest.fn()} />);});
  expect(getMine).toHaveBeenCalledWith(0);
  expect(textContent(renderer!)).toContain('Vibe one');
  await ReactTestRenderer.act(async () => {control(renderer!, 'Load more of your vibes').props.onPress();});
  expect(getMine).toHaveBeenLastCalledWith(1);
  expect(textContent(renderer!)).toContain('Vibe two');
  await ReactTestRenderer.act(async () => {renderer!.unmount();});
});

test('confirms deletion and removes only the selected note', async () => {
  getMine.mockResolvedValue({data: [item('one'), item('two')], meta: {limit: 20, offset: 0, hasMore: false}});
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  let renderer: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {renderer = ReactTestRenderer.create(<MyVibesSheet visible onClose={jest.fn()} />);});
  await ReactTestRenderer.act(async () => {control(renderer!, 'Delete your vibe').props.onPress();});
  expect(remove).not.toHaveBeenCalled();
  const actions = alert.mock.calls[0][2];
  await ReactTestRenderer.act(async () => {actions?.find(action => action.text === 'Delete')?.onPress?.();});
  expect(remove).toHaveBeenCalledWith('one');
  expect(textContent(renderer!)).not.toContain('Vibe one');
  expect(textContent(renderer!)).toContain('Vibe two');
  alert.mockRestore();
  await ReactTestRenderer.act(async () => {renderer!.unmount();});
});

test('shows a friendly retry state when own-vibes service is unavailable', async () => {
  getMine.mockRejectedValueOnce({status: 404, message: 'Route GET /vibe-notes/mine not found'});
  let renderer: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {renderer = ReactTestRenderer.create(<MyVibesSheet visible onClose={jest.fn()} />);});
  expect(textContent(renderer!)).toContain('Your vibes are temporarily unavailable. Try again soon.');
  expect(textContent(renderer!)).not.toContain('Route GET');
  expect(control(renderer!, 'Retry your vibes')).toBeTruthy();
  await ReactTestRenderer.act(async () => {renderer!.unmount();});
});
