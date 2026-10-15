import React from 'react';
import {Text} from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import Nearby from '../Nearby';
import {getDeviceLocation} from '../deviceLocation';
import {getLocationVisibility, getNearbyPeople, setLocationVisibility, updateMyLocation} from '../nearbyService';

jest.mock('@react-navigation/native', () => ({useIsFocused: () => true, useNavigation: () => ({navigate: jest.fn()}), useRoute: () => ({params: undefined})}));
jest.mock('../../events', () => ({EventsList: () => require('react').createElement(require('react-native').Text, null, 'Events catalogue')}));
jest.mock('../deviceLocation', () => ({getDeviceLocation: jest.fn()}));
jest.mock('../nearbyService', () => ({
  getLocationVisibility: jest.fn(), getNearbyPeople: jest.fn(), setLocationVisibility: jest.fn(), updateMyLocation: jest.fn(),
  updateMyLocationFromFix: jest.fn((fix: {lat: number; lng: number}) => require('../nearbyService').updateMyLocation(fix.lat, fix.lng)),
}));
jest.mock('../../messages', () => ({DirectConversation: () => null, startDirectConversation: jest.fn()}));
jest.mock('../../users', () => ({UserProfileModal: () => null}));

const deviceLocation = getDeviceLocation as jest.Mock;
const locationVisibility = getLocationVisibility as jest.Mock;
const nearbyPeople = getNearbyPeople as jest.Mock;
const postLocation = updateMyLocation as jest.Mock;
const setVisibility = setLocationVisibility as jest.Mock;
const textContent = (renderer: ReactTestRenderer.ReactTestRenderer) =>
  renderer.root.findAllByType(Text).map(node => [node.props.children].flat().join('')).join('\n');
const control = (renderer: ReactTestRenderer.ReactTestRenderer, label: string) =>
  renderer.root.find(node => node.props.accessibilityLabel === label);

beforeEach(() => {
  jest.clearAllMocks();
  deviceLocation.mockResolvedValue({lat: 12.97, lng: 77.59});
  locationVisibility.mockResolvedValue({visible: true});
  nearbyPeople.mockResolvedValue([{
    id: 'person-1', name: 'Aarav', avatarUrl: null, bio: 'Into music', gender: 'male', distanceMeters: 420,
  }]);
  postLocation.mockResolvedValue({visible: true});
  setVisibility.mockResolvedValue({visible: false});
});

test('loads real nearby people only after the server confirms the viewer is visible', async () => {
  let renderer: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {renderer = ReactTestRenderer.create(<Nearby />);});

  expect(locationVisibility).toHaveBeenCalled();
  expect(deviceLocation).toHaveBeenCalledWith(false);
  expect(postLocation).toHaveBeenCalledWith(12.97, 77.59);
  expect(nearbyPeople).toHaveBeenCalledWith(2_000, undefined);
  expect(textContent(renderer!)).toContain('Aarav');
  expect(textContent(renderer!)).toContain('Into music');
  expect(textContent(renderer!)).toContain('Say hi');
  expect(control(renderer!, 'Your vibes')).toBeTruthy();
  expect(control(renderer!, 'Drop a vibe')).toBeTruthy();
  expect(textContent(renderer!)).toContain('Meet people nearby and discover events.');
  expect(control(renderer!, 'Turn off nearby visibility')).toBeTruthy();
  expect(textContent(renderer!)).not.toContain('Vibe notes');
  expect(textContent(renderer!)).not.toContain('Refresh');
  expect(control(renderer!, 'Within 2 km, change distance')).toBeTruthy();

  await ReactTestRenderer.act(async () => {renderer!.unmount();});
});

test('keeps distance choices in a compact sheet and widens the people search', async () => {
  let renderer: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {renderer = ReactTestRenderer.create(<Nearby />);});

  expect(renderer!.root.findAll(node => node.props.accessibilityLabel === 'Search within 5 km')).toHaveLength(0);
  await ReactTestRenderer.act(async () => {control(renderer!, 'Within 2 km, change distance').props.onPress();});
  expect(control(renderer!, 'Search within 5 km')).toBeTruthy();
  await ReactTestRenderer.act(async () => {control(renderer!, 'Search within 5 km').props.onPress();});
  expect(nearbyPeople).toHaveBeenLastCalledWith(5_000, undefined);
  expect(control(renderer!, 'Within 5 km, change distance')).toBeTruthy();
  await ReactTestRenderer.act(async () => {renderer!.unmount();});
});

test('People and Events tabs do not show a nearby notes section', async () => {
  let renderer: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {renderer = ReactTestRenderer.create(<Nearby />);});

  expect(textContent(renderer!)).toContain('Aarav');
  expect(textContent(renderer!)).not.toContain('Vibe notes');
  expect(renderer!.root.findAll(node => node.props.accessibilityLabel === 'Notes')).toHaveLength(0);
  expect(renderer!.root.findAll(node => node.props.accessibilityLabel?.startsWith?.('Other cities'))).toHaveLength(0);
  await ReactTestRenderer.act(async () => {control(renderer!, 'Events').props.onPress();});
  expect(textContent(renderer!)).toContain('Events catalogue');
  expect(textContent(renderer!)).not.toContain('Aarav');
  expect(control(renderer!, 'Events').props.accessibilityState.selected).toBe(true);
  const peopleCalls = nearbyPeople.mock.calls.length;
  expect(nearbyPeople).toHaveBeenCalledTimes(peopleCalls);

  await ReactTestRenderer.act(async () => {control(renderer!, 'People').props.onPress();});
  expect(nearbyPeople).toHaveBeenLastCalledWith(2_000, undefined);
  expect(textContent(renderer!)).toContain('Aarav');
  await ReactTestRenderer.act(async () => {renderer!.unmount();});
});

test('Events can be browsed without opting into nearby location', async () => {
  locationVisibility.mockResolvedValue({visible: false});
  let renderer: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {renderer = ReactTestRenderer.create(<Nearby />);});
  deviceLocation.mockClear();
  await ReactTestRenderer.act(async () => {control(renderer!, 'Events').props.onPress();});
  expect(textContent(renderer!)).toContain('Events catalogue');
  expect(deviceLocation).not.toHaveBeenCalled();
  await ReactTestRenderer.act(async () => {renderer!.unmount();});
});

test('header location control keeps discovery opt-in and can turn it off', async () => {
  locationVisibility.mockResolvedValue({visible: false});
  let renderer: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {renderer = ReactTestRenderer.create(<Nearby />);});

  expect(deviceLocation).not.toHaveBeenCalled();
  expect(nearbyPeople).not.toHaveBeenCalled();
  expect(textContent(renderer!)).toContain('Meet people near you');
  expect(textContent(renderer!)).toContain('Nearby visibility off');
  expect(control(renderer!, 'Turn on nearby visibility')).toBeTruthy();
  expect(textContent(renderer!)).not.toContain('Aarav');

  await ReactTestRenderer.act(async () => {await control(renderer!, 'Turn on nearby visibility').props.onPress();});
  expect(deviceLocation).toHaveBeenCalledWith(true);
  expect(nearbyPeople).toHaveBeenCalledWith(2_000, undefined);
  expect(textContent(renderer!)).toContain('Aarav');
  expect(textContent(renderer!)).toContain('Nearby visibility on');

  await ReactTestRenderer.act(async () => {await control(renderer!, 'Turn off nearby visibility').props.onPress();});
  expect(setVisibility).toHaveBeenCalledWith(false);
  expect(textContent(renderer!)).toContain('Nearby visibility off');

  await ReactTestRenderer.act(async () => {renderer!.unmount();});
});

test('shows a useful empty state instead of placeholder profiles', async () => {
  nearbyPeople.mockResolvedValueOnce([]);
  let renderer: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {renderer = ReactTestRenderer.create(<Nearby />);});

  expect(textContent(renderer!)).toContain('No one within 2 km yet');
  expect(textContent(renderer!)).not.toContain('aarav');
  await ReactTestRenderer.act(async () => {renderer!.unmount();});
});

test('shows a retry action when the nearby service fails', async () => {
  nearbyPeople.mockRejectedValueOnce({status: 503, message: 'Try again later.'});
  let renderer: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {renderer = ReactTestRenderer.create(<Nearby />);});

  expect(textContent(renderer!)).toContain('Try again later.');
  expect(control(renderer!, 'Retry nearby people')).toBeTruthy();
  await ReactTestRenderer.act(async () => {renderer!.unmount();});
});

test('shows a location error instead of an empty result when device permission is off', async () => {
  deviceLocation.mockRejectedValueOnce(new Error('Location permission is off.'));
  let renderer: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {renderer = ReactTestRenderer.create(<Nearby />);});

  expect(textContent(renderer!)).toContain('Location permission is off.');
  expect(textContent(renderer!)).not.toContain('No one within 2 km yet');
  expect(control(renderer!, 'Open location settings')).toBeTruthy();
  await ReactTestRenderer.act(async () => {renderer!.unmount();});
});
