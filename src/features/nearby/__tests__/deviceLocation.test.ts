import Geolocation from '@react-native-community/geolocation';
import {AppState} from 'react-native';
import {requestLocationPermission} from '../deviceLocation';

jest.mock('@react-native-community/geolocation', () => ({
  __esModule: true,
  default: {setRNConfiguration: jest.fn(), requestAuthorization: jest.fn(), getCurrentPosition: jest.fn()},
}));

const geo = Geolocation as unknown as {requestAuthorization: jest.Mock; getCurrentPosition: jest.Mock};

// Jest's AppState mock has no currentState; the probe needs 'active' to treat a timeout as granted.
beforeEach(() => { (AppState as {currentState: string}).currentState = 'active'; });

// iOS only calls requestAuthorization's callbacks when the status changes, so an already-decided status must resolve via the probe.
test('an already denied status resolves false instead of hanging', async () => {
  geo.getCurrentPosition.mockImplementation((_ok, fail) => fail({code: 1}));
  await expect(requestLocationPermission()).resolves.toBe(false);
});

test('an already granted status resolves true, with a fix or without one', async () => {
  geo.getCurrentPosition.mockImplementation(ok => ok({coords: {latitude: 1, longitude: 2}}));
  await expect(requestLocationPermission()).resolves.toBe(true);
  geo.getCurrentPosition.mockImplementation((_ok, fail) => fail({code: 3}));
  await expect(requestLocationPermission()).resolves.toBe(true);
});

test('answering the prompt resolves through requestAuthorization', async () => {
  geo.getCurrentPosition.mockImplementation(() => {});
  geo.requestAuthorization.mockImplementation((_ok, fail) => fail({code: 1}));
  await expect(requestLocationPermission()).resolves.toBe(false);
});
