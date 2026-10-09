import React from 'react';
import {Text} from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import Nearby from '../Nearby';
import {getDeviceLocation} from '../deviceLocation';
import {getLocationVisibility, getNearbyPeople, setLocationVisibility, updateMyLocation} from '../nearbyService';

jest.mock('@react-navigation/native', () => ({useIsFocused: () => true}));
jest.mock('../../messages', () => ({DirectConversation: () => null, startDirectConversation: jest.fn()}));
jest.mock('../deviceLocation', () => ({getDeviceLocation: jest.fn()}));
jest.mock('../nearbyService', () => ({
  getLocationVisibility: jest.fn(), getNearbyPeople: jest.fn(),
  setLocationVisibility: jest.fn(), updateMyLocation: jest.fn(),
}));

const visibility = getLocationVisibility as jest.Mock;
const location = getDeviceLocation as jest.Mock;
const postLocation = updateMyLocation as jest.Mock;
const nearby = getNearbyPeople as jest.Mock;
const setVisibility = setLocationVisibility as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  visibility.mockResolvedValue({visible: false});
  location.mockResolvedValue({lat: 13.0827, lng: 80.2707});
  postLocation.mockResolvedValue({visible: true});
  nearby.mockResolvedValue([]);
  setVisibility.mockResolvedValue({visible: false});
});

test('does not publish location until the person explicitly goes visible, and can opt out', async () => {
  let renderer: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => { renderer = ReactTestRenderer.create(<Nearby />); });

  expect(location).not.toHaveBeenCalled();
  expect(postLocation).not.toHaveBeenCalled();
  expect(nearby).not.toHaveBeenCalled();

  const goVisible = renderer!.root.findByProps({accessibilityLabel: 'Go visible'});
  await ReactTestRenderer.act(async () => { await goVisible.props.onPress(); });
  expect(location).toHaveBeenCalledWith(true);
  expect(postLocation).toHaveBeenCalledWith(13.0827, 80.2707);
  expect(nearby).toHaveBeenCalledWith(2000);

  const goInvisible = renderer!.root.findByProps({accessibilityLabel: 'Go invisible'});
  await ReactTestRenderer.act(async () => { await goInvisible.props.onPress(); });
  expect(setVisibility).toHaveBeenCalledWith(false);

  await ReactTestRenderer.act(async () => { renderer!.unmount(); });
});

test('does not show nearby results from a stale position when location permission is missing', async () => {
  visibility.mockResolvedValue({visible: true});
  location.mockResolvedValue(null);
  let renderer: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => { renderer = ReactTestRenderer.create(<Nearby />); });

  expect(location).toHaveBeenCalledWith(false);
  expect(postLocation).not.toHaveBeenCalled();
  expect(nearby).not.toHaveBeenCalled();
  expect(renderer!.root.findByProps({accessibilityLabel: 'Allow location access'})).toBeTruthy();

  await ReactTestRenderer.act(async () => { renderer!.unmount(); });
});

const texts = (renderer: ReactTestRenderer.ReactTestRenderer) =>
  renderer.root.findAllByType(Text).map(node => [node.props.children].flat().join('')).join('\n');

async function renderVisible() {
  visibility.mockResolvedValue({visible: true});
  let renderer: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => { renderer = ReactTestRenderer.create(<Nearby />); });
  return renderer!;
}

test('shows distance bands, deriving one from distanceMeters when the server sends none', async () => {
  nearby.mockResolvedValue([
    {id: 'a', name: 'Asha', avatarUrl: null, distanceMeters: 500, distanceBand: '<500m'},
    {id: 'b', name: 'Bilal', avatarUrl: null, distanceMeters: 1432},
    {id: 'c', name: 'Chen', avatarUrl: null, distanceMeters: 12000, distanceBand: '10km+'},
  ]);
  const renderer = await renderVisible();
  const shown = texts(renderer);
  expect(shown).toContain('Within 500 m');
  expect(shown).toContain('Under 2 km');
  expect(shown).toContain('Over 10 km');
  expect(shown).not.toMatch(/\d m away|1\.4 km/);
  expect(renderer.root.findByProps({accessibilityLabel: 'View Bilal, Under 2 km'})).toBeTruthy();
  await ReactTestRenderer.act(async () => { renderer.unmount(); });
});

test('offers no radius below 500 m', async () => {
  const renderer = await renderVisible();
  const labels = renderer.root.findAll(node => node.props.accessibilityState?.selected !== undefined && typeof node.props.onPress === 'function')
    .map(node => [node.findByType(Text).props.children].flat().join(''));
  expect(labels).toEqual(['2 km', '5 km', '10 km']);
  await ReactTestRenderer.act(async () => { renderer.unmount(); });
});

test('a 429 from /nearby shows a friendly slow-down message', async () => {
  nearby.mockRejectedValue({status: 429, message: 'Too many requests'});
  const renderer = await renderVisible();
  expect(texts(renderer)).toContain('Slow down a bit — try again in a minute. Tap to retry.');
  await ReactTestRenderer.act(async () => { renderer.unmount(); });
});

test('a 429 from the location update is a retryable error, not a location problem', async () => {
  postLocation.mockRejectedValueOnce({status: 429, message: 'Too many requests'});
  const renderer = await renderVisible();
  expect(texts(renderer)).toContain('Slow down a bit — try again in a minute. Tap to retry.');
  expect(renderer.root.findAllByProps({accessibilityLabel: 'Allow location access'})).toHaveLength(0);
  expect(nearby).not.toHaveBeenCalled();

  await ReactTestRenderer.act(async () => { await renderer.root.findByProps({accessibilityLabel: 'Retry nearby'}).props.onPress(); });
  expect(postLocation).toHaveBeenCalledTimes(2);
  expect(nearby).toHaveBeenCalledWith(2000);
  await ReactTestRenderer.act(async () => { renderer.unmount(); });
});

test('LOCATION_IMPLAUSIBLE shows a message instead of results or a crash', async () => {
  postLocation.mockRejectedValue({status: 422, code: 'LOCATION_IMPLAUSIBLE', message: 'Implausible location'});
  const renderer = await renderVisible();
  expect(texts(renderer)).toContain("Your location couldn't be verified");
  expect(nearby).not.toHaveBeenCalled();
  await ReactTestRenderer.act(async () => { renderer.unmount(); });
});
