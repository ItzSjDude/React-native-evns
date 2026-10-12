import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import Nearby from '../Nearby';
import {requestLocationPermission} from '../deviceLocation';

jest.mock('@react-navigation/native', () => ({useIsFocused: () => true}));
jest.mock('../deviceLocation', () => ({requestLocationPermission: jest.fn()}));

const location = requestLocationPermission as jest.Mock;

beforeEach(() => jest.clearAllMocks());

test('shows the static people once location permission is granted', async () => {
  location.mockResolvedValue(true);
  let renderer: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => { renderer = ReactTestRenderer.create(<Nearby />); });

  expect(location).toHaveBeenCalled();
  const tree = JSON.stringify(renderer!.toJSON());
  expect(tree).toContain('aarav');
  expect(tree).not.toContain('Allow location to explore people');

  await ReactTestRenderer.act(async () => { renderer!.unmount(); });
});

test('shows the allow-location prompt when permission is denied', async () => {
  location.mockResolvedValue(false);
  let renderer: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => { renderer = ReactTestRenderer.create(<Nearby />); });

  const tree = JSON.stringify(renderer!.toJSON());
  expect(tree).toContain('Allow location to explore people');
  expect(tree).not.toContain('aarav');

  await ReactTestRenderer.act(async () => { renderer!.unmount(); });
});
