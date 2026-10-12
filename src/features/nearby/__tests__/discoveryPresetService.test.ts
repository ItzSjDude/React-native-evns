import {apiRequest, apiRequestPage} from '../../../core/api/apiClient';
import {createDiscoveryPreset, deleteDiscoveryPreset, listDiscoveryPresets, updateDiscoveryPreset} from '../discoveryPresetService';
import {nearbyErrorMessage, PASSPORT_PLUS_REQUIRED_MESSAGE, PRESET_LIMIT_MESSAGE, PRESET_NAME_TAKEN_MESSAGE} from '../nearbyErrors';
import {getPassportPeople} from '../nearbyService';

jest.mock('../../../core/api/apiClient', () => ({
  apiRequest: jest.fn().mockResolvedValue([]),
  apiRequestPage: jest.fn().mockResolvedValue({data: [], meta: {limit: 20, offset: 0, hasMore: false}}),
}));

test('Passport asks for a city page with the trimmed, encoded filters and never sends the city filter twice', async () => {
  (apiRequestPage as jest.Mock).mockResolvedValueOnce({
    data: [{id: 'u1', name: 'Asha', avatarUrl: null, city: 'Mumbai', isFollowing: false, isPassportResult: true}],
    meta: {limit: 20, offset: 20, hasMore: true, mode: 'PASSPORT', city: 'Mumbai'},
  });
  const page = await getPassportPeople(' Navi Mumbai ', {city: 'Pune', interest: ' chai ', language: 'hi', activeNow: true}, 20);
  expect(apiRequestPage).toHaveBeenLastCalledWith('/nearby/passport?city=Navi%20Mumbai&limit=20&offset=20&interest=chai&language=hi&activeNow=true', {auth: 'required'});
  expect(page.hasMore).toBe(true);
  expect(page.people[0]).toMatchObject({id: 'u1', city: 'Mumbai'});
  expect(page.people[0]).not.toHaveProperty('distanceMeters');
});

test('preset requests use the /me/discovery-presets contract', async () => {
  await listDiscoveryPresets();
  expect(apiRequest).toHaveBeenLastCalledWith('/me/discovery-presets', {auth: 'required'});
  await createDiscoveryPreset({name: 'Weekend', mode: 'PASSPORT', city: 'Goa', radiusMeters: 2000, activeNow: false});
  expect(apiRequest).toHaveBeenLastCalledWith('/me/discovery-presets', {auth: 'required', method: 'POST', body: JSON.stringify({name: 'Weekend', mode: 'PASSPORT', city: 'Goa', radiusMeters: 2000, activeNow: false})});
  await updateDiscoveryPreset('p 1', {name: 'Renamed'});
  expect(apiRequest).toHaveBeenLastCalledWith('/me/discovery-presets/p%201', {auth: 'required', method: 'PATCH', body: JSON.stringify({name: 'Renamed'})});
  await deleteDiscoveryPreset('p1');
  expect(apiRequest).toHaveBeenLastCalledWith('/me/discovery-presets/p1', {auth: 'required', method: 'DELETE'});
});

test('maps Passport and preset errors to friendly copy', () => {
  expect(nearbyErrorMessage({status: 403, code: 'PLUS_REQUIRED', message: 'x'}, 'passport')).toBe(PASSPORT_PLUS_REQUIRED_MESSAGE);
  expect(nearbyErrorMessage({status: 409, code: 'CONFLICT', message: 'A preset with that name already exists'}, 'passport')).toBe(PRESET_NAME_TAKEN_MESSAGE);
  expect(nearbyErrorMessage({status: 409, code: 'CONFLICT', message: 'You can save up to 10 discovery presets'}, 'passport')).toBe(PRESET_LIMIT_MESSAGE);
  expect(nearbyErrorMessage({status: 429, message: 'Too many'}, 'passport')).toBe('Slow down a bit — try again in a minute.');
});
