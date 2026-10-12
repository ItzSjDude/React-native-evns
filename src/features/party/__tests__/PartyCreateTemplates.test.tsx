import React from 'react';
import {act, create, type ReactTestRenderer} from 'react-test-renderer';
import {apiRequest} from '../../../core/api/apiClient';
import PartyCreateSheet from '../PartyCreateSheet';

jest.mock('../../../core/api/apiClient', () => ({apiRequest: jest.fn()}));
const request = apiRequest as jest.Mock;

let tree: ReactTestRenderer;
const find = (label: string) => tree.root.findByProps({accessibilityLabel: label});
const flush = async () => {await act(async () => {await Promise.resolve(); await Promise.resolve();});};
const mount = async () => {await act(async () => {tree = create(<PartyCreateSheet onClose={jest.fn()} onCreated={jest.fn()} />);}); await flush();};
const route = (templates: () => Promise<unknown>) => request.mockImplementation((path: string) =>
  path === '/host-studio/templates' ? templates() : path.startsWith('/parties/invitees') ? Promise.resolve([]) : Promise.resolve({}));

beforeEach(() => request.mockReset());
afterEach(() => act(() => tree?.unmount()));

test('applying a template fills the create form', async () => {
  route(() => Promise.resolve([{id: 't1', owner_user_id: 'u', name: 'Game night', created_at: '', updated_at: '',
    config: {title: 'Ranked grind', topic: 'Valorant', kind: 'AUDIO', seatCount: 4, visibility: 'PRIVATE', language: 'English', category: 'GAMING', interestTags: ['gaming']}}]));
  await mount();
  await act(async () => {find('Use a template').props.onPress();});
  await act(async () => {find('Apply template Game night').props.onPress();});
  expect(find('Party name').props.value).toBe('Ranked grind');
  expect(find('Party description').props.value).toBe('Valorant');
  expect(find('4 speaker seats').props.accessibilityState.selected).toBe(true);
});

test('Save as template posts the current form in backend shape', async () => {
  route(() => Promise.resolve([]));
  await mount();
  await act(async () => {find('Party name').props.onChangeText('My room');});
  await act(async () => {find('Save as template').props.onPress();});
  await act(async () => {find('Template name').props.onChangeText('Mine');});
  await act(async () => {find('Save template').props.onPress();});
  await flush();
  const post = request.mock.calls.find(([path, options]) => path === '/host-studio/templates' && options?.method === 'POST')!;
  expect(JSON.parse(post[1].body)).toEqual({name: 'Mine', config: {title: 'My room', kind: 'AUDIO', seatCount: 8, visibility: 'PUBLIC', language: 'Hindi', category: 'MUSIC', interestTags: ['music']}});
});

test('template entry points are absent when Host Studio is unavailable', async () => {
  route(() => Promise.reject({status: 404, message: 'Host Studio is unavailable'}));
  await mount();
  expect(tree.root.findAllByProps({accessibilityLabel: 'Use a template'})).toHaveLength(0);
  expect(tree.root.findAllByProps({accessibilityLabel: 'Save as template'})).toHaveLength(0);
  expect(find('Create party')).toBeTruthy();
});
