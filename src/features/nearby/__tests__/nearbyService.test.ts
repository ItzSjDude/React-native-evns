import {apiRequest} from '../../../core/api/apiClient';
import {getNearbyPeople} from '../nearbyService';

jest.mock('../../../core/api/apiClient', () => ({apiRequest: jest.fn().mockResolvedValue([])}));

test('never asks for a radius below the 500 m minimum', async () => {
  await getNearbyPeople(100);
  expect(apiRequest).toHaveBeenLastCalledWith('/nearby?radiusMeters=500&limit=50', {auth: 'required'});
  await getNearbyPeople(2000);
  expect(apiRequest).toHaveBeenLastCalledWith('/nearby?radiusMeters=2000&limit=50', {auth: 'required'});
});
