import {apiRequest} from '../../../core/api/apiClient';
import {nearbyErrorMessage} from '../nearbyErrors';
import {getNearbyPeople} from '../nearbyService';

jest.mock('../../../core/api/apiClient', () => ({apiRequest: jest.fn().mockResolvedValue([])}));

test('sends only the defined, trimmed and encoded discovery filters', async () => {
  await getNearbyPeople(2000, {city: ' New Delhi ', interest: '', language: 'hinglish', activeNow: true});
  expect(apiRequest).toHaveBeenLastCalledWith('/nearby?radiusMeters=2000&limit=50&city=New%20Delhi&language=hinglish&activeNow=true', {auth: 'required'});
  await getNearbyPeople(2000, {activeNow: false});
  expect(apiRequest).toHaveBeenLastCalledWith('/nearby?radiusMeters=2000&limit=50', {auth: 'required'});
});

test('maps a 403 PLUS_REQUIRED to friendly copy', () => {
  expect(nearbyErrorMessage({status: 403, code: 'PLUS_REQUIRED', message: 'Hiva Plus is required for advanced discovery filters'})).toBe('Filters are a Hiva Plus feature.');
});

test('never asks for a radius below the 500 m minimum', async () => {
  await getNearbyPeople(100);
  expect(apiRequest).toHaveBeenLastCalledWith('/nearby?radiusMeters=500&limit=50', {auth: 'required'});
  await getNearbyPeople(2000);
  expect(apiRequest).toHaveBeenLastCalledWith('/nearby?radiusMeters=2000&limit=50', {auth: 'required'});
});
