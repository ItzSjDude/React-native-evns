import React from 'react';
import {Text} from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import Nearby from '../Nearby';
import {closePaywall, getPlusState, resetPlus, setSubscription} from '../../plus/plusStore';
import {subscription} from '../../plus/__fixtures__/plusFixtures';
import {getDeviceLocation} from '../deviceLocation';
import {createDiscoveryPreset, deleteDiscoveryPreset, listDiscoveryPresets} from '../discoveryPresetService';
import {getLocationVisibility, getNearbyPeople, getPassportPeople, updateMyLocation} from '../nearbyService';
import type {DiscoveryPreset} from '../types';

jest.mock('@react-navigation/native', () => ({useIsFocused: () => true}));
jest.mock('../../messages', () => ({DirectConversation: () => null, startDirectConversation: jest.fn()}));
jest.mock('../VibeNotesList', () => () => null);
jest.mock('../deviceLocation', () => ({getDeviceLocation: jest.fn()}));
jest.mock('../nearbyService', () => ({
  getLocationVisibility: jest.fn(), getNearbyPeople: jest.fn(), getPassportPeople: jest.fn(),
  setLocationVisibility: jest.fn(), updateMyLocation: jest.fn(),
}));
jest.mock('../discoveryPresetService', () => ({
  NAME_MAX_LENGTH: 40, listDiscoveryPresets: jest.fn(), createDiscoveryPreset: jest.fn(), deleteDiscoveryPreset: jest.fn(),
}));

const visibility = getLocationVisibility as jest.Mock;
const location = getDeviceLocation as jest.Mock;
const postLocation = updateMyLocation as jest.Mock;
const nearby = getNearbyPeople as jest.Mock;
const passport = getPassportPeople as jest.Mock;
const list = listDiscoveryPresets as jest.Mock;
const create = createDiscoveryPreset as jest.Mock;
const remove = deleteDiscoveryPreset as jest.Mock;

const preset = (overrides: Partial<DiscoveryPreset> & {id: string; name: string}): DiscoveryPreset => ({
  mode: 'NEARBY', city: null, radiusMeters: 2000, interest: null, language: null, activeNow: false,
  createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z', ...overrides,
});
const person = (id: string, name: string) => ({id, name, avatarUrl: null, city: 'Mumbai', isFollowing: false, isPassportResult: true as const});

beforeEach(() => {
  jest.clearAllMocks();
  resetPlus();
  visibility.mockResolvedValue({visible: true});
  location.mockResolvedValue({lat: 13.0827, lng: 80.2707});
  postLocation.mockResolvedValue({visible: true});
  nearby.mockResolvedValue([]);
  passport.mockResolvedValue({people: [], hasMore: false});
  list.mockResolvedValue([]);
});

const texts = (renderer: ReactTestRenderer.ReactTestRenderer) =>
  renderer.root.findAllByType(Text).map(node => [node.props.children].flat().join('')).join('\n');
const control = (renderer: ReactTestRenderer.ReactTestRenderer, label: string) =>
  renderer.root.findAll(node => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function')[0];
const press = (renderer: ReactTestRenderer.ReactTestRenderer, label: string) =>
  ReactTestRenderer.act(async () => { await control(renderer, label).props.onPress(); });
const type = (renderer: ReactTestRenderer.ReactTestRenderer, label: string, value: string) =>
  ReactTestRenderer.act(async () => { renderer.root.findAll(node => node.props.accessibilityLabel === label && typeof node.props.onChangeText === 'function')[0].props.onChangeText(value); });

async function render(plan: 'free' | 'plus') {
  setSubscription(subscription(plan === 'plus' ? {plan: 'plus', status: 'ACTIVE'} : {plan: 'free'}));
  let renderer: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => { renderer = ReactTestRenderer.create(<Nearby />); });
  return renderer!;
}
const unmount = (renderer: ReactTestRenderer.ReactTestRenderer) => ReactTestRenderer.act(async () => { renderer.unmount(); });

test('free users see Passport and saved searches locked, and tapping opens the passport paywall', async () => {
  const renderer = await render('free');
  expect(control(renderer, 'Passport, requires Hiva Plus')).toBeTruthy();
  await press(renderer, 'Passport, requires Hiva Plus');
  expect(getPlusState().paywall).toMatchObject({visible: true, reason: 'passport'});
  expect(passport).not.toHaveBeenCalled();
  expect(list).not.toHaveBeenCalled();

  await ReactTestRenderer.act(async () => { closePaywall(); });
  await press(renderer, 'Saved searches, requires Hiva Plus');
  expect(getPlusState().paywall).toMatchObject({visible: true, reason: 'passport'});
  await unmount(renderer);
});

test('Passport mode lists a city without a distance, never touches location, and pages by offset', async () => {
  passport.mockResolvedValueOnce({people: [person('a', 'Asha')], hasMore: true});
  const renderer = await render('plus');
  expect(postLocation).toHaveBeenCalledTimes(1);
  location.mockClear();
  postLocation.mockClear();
  nearby.mockClear();

  await press(renderer, 'Passport');
  await type(renderer, 'Passport city', 'Mumbai');
  await press(renderer, 'Search city');

  expect(passport).toHaveBeenLastCalledWith('Mumbai', {}, 0);
  const shown = texts(renderer);
  expect(shown).toContain('Asha');
  expect(shown).toContain('Passport · Mumbai');
  expect(shown).not.toMatch(/\bkm\b|\d+ m\b|Within|Under|Over/);
  expect(control(renderer, 'View Asha, Passport Mumbai')).toBeTruthy();
  expect(location).not.toHaveBeenCalled();
  expect(postLocation).not.toHaveBeenCalled();
  expect(nearby).not.toHaveBeenCalled();

  passport.mockResolvedValueOnce({people: [person('b', 'Bilal')], hasMore: false});
  const listNode = renderer.root.findAll(node => typeof node.props.onEndReached === 'function')[0];
  await ReactTestRenderer.act(async () => { listNode.props.onEndReached(); });
  expect(passport).toHaveBeenLastCalledWith('Mumbai', {}, 1);
  expect(texts(renderer)).toContain('Bilal');
  await unmount(renderer);
});

test('Passport shows an empty state and friendly errors', async () => {
  const renderer = await render('plus');
  await press(renderer, 'Passport');
  await type(renderer, 'Passport city', 'Atlantis');
  await press(renderer, 'Search city');
  expect(texts(renderer)).toContain('No one found in Atlantis');

  passport.mockRejectedValueOnce({status: 403, code: 'PLUS_REQUIRED', message: 'Hiva Plus is required'});
  await type(renderer, 'Passport city', 'Pune');
  await press(renderer, 'Search city');
  expect(texts(renderer)).toContain('Social Passport and saved searches are Hiva Plus features. Tap to retry.');
  await unmount(renderer);
});

test('presets: save a Nearby search without a city, refetch, apply and delete', async () => {
  list.mockResolvedValueOnce([]);
  const renderer = await render('plus');
  expect(list).toHaveBeenCalledTimes(1);

  const saved = preset({id: 'p1', name: 'Chill', radiusMeters: 5000, language: 'hi', activeNow: true});
  create.mockResolvedValueOnce(saved);
  list.mockResolvedValueOnce([saved]);
  await press(renderer, 'Save current search');
  await press(renderer, 'Save');
  expect(texts(renderer)).toContain('Give this search a name.');
  expect(create).not.toHaveBeenCalled();

  await type(renderer, 'Search name', '  Chill  ');
  await press(renderer, 'Save');
  expect(create).toHaveBeenCalledWith({name: 'Chill', mode: 'NEARBY', radiusMeters: 2000, activeNow: false});
  expect(list).toHaveBeenCalledTimes(2);

  nearby.mockClear();
  await press(renderer, 'Apply Chill');
  expect(nearby).toHaveBeenLastCalledWith(5000, {interest: undefined, language: 'hi', activeNow: true});

  remove.mockResolvedValueOnce({deleted: true});
  list.mockResolvedValueOnce([]);
  await press(renderer, 'Delete Chill');
  expect(remove).toHaveBeenCalledWith('p1');
  expect(list).toHaveBeenCalledTimes(3);
  expect(control(renderer, 'Apply Chill')).toBeUndefined();
  await unmount(renderer);
});

test('applying a Passport preset switches mode and city without location calls; saving needs a city', async () => {
  list.mockResolvedValue([preset({id: 'p2', name: 'Goa trip', mode: 'PASSPORT', city: 'Goa', interest: 'music', radiusMeters: 3000})]);
  const renderer = await render('plus');
  postLocation.mockClear();
  location.mockClear();

  await press(renderer, 'Apply Goa trip');
  expect(passport).toHaveBeenLastCalledWith('Goa', {interest: 'music', language: undefined, activeNow: undefined}, 0);
  expect(postLocation).not.toHaveBeenCalled();
  expect(location).not.toHaveBeenCalled();

  await type(renderer, 'Passport city', '');
  await press(renderer, 'Search city');
  await press(renderer, 'Save current search');
  await type(renderer, 'Search name', 'Nowhere');
  await press(renderer, 'Save');
  expect(texts(renderer)).toContain('Enter a city before saving a Passport search.');
  expect(create).not.toHaveBeenCalled();
  await unmount(renderer);
});

test('save errors: duplicate name and the 10-preset limit', async () => {
  const renderer = await render('plus');
  await press(renderer, 'Save current search');
  await type(renderer, 'Search name', 'Dup');
  create.mockRejectedValueOnce({status: 409, code: 'CONFLICT', message: 'A preset with that name already exists'});
  await press(renderer, 'Save');
  expect(texts(renderer)).toContain('You already have a saved search with that name.');

  create.mockRejectedValueOnce({status: 409, code: 'CONFLICT', message: 'You can save up to 10 discovery presets'});
  await press(renderer, 'Save');
  expect(texts(renderer)).toContain('You can save up to 10 searches. Delete one to save another.');
  await unmount(renderer);
});
