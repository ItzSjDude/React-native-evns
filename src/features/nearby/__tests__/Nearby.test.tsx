import React from 'react';
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
