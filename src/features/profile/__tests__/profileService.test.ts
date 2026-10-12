import {apiRequest, apiRequestPage} from '../../../core/api/apiClient';
import {getMyProfile, getProfilePage, updateMyProfile} from '../profileService';

jest.mock('../../../core/api/apiClient', () => ({apiRequest: jest.fn(), apiRequestPage: jest.fn()}));
const request = apiRequest as jest.Mock;
const pageRequest = apiRequestPage as jest.Mock;

const profile = {
  id: 'a', name: 'A', email: 'a@example.com', avatar_url: null,
  cover_image_url: null, handle: 'alice', bio: null, interests: [], city: null,
  stats: {following: 2, hosted: 1, posts: 3},
};

beforeEach(() => {request.mockReset(); pageRequest.mockReset();});

test('reads the nested profile contract returned by GET /auth/me', async () => {
  request.mockResolvedValue({user: profile, ...profile});
  await expect(getMyProfile()).resolves.toEqual(profile);
  expect(request).toHaveBeenCalledWith('/auth/me', {auth: 'required'});
});

test('sends backend field names for profile update and returns authoritative server state', async () => {
  const updated = {...profile, name: 'Alice'};
  request.mockResolvedValue({user: updated, ...updated});
  await expect(updateMyProfile({name: 'Alice', bio: null})).resolves.toEqual(updated);
  expect(request).toHaveBeenCalledWith('/auth/me', {
    auth: 'required', method: 'PATCH', body: JSON.stringify({name: 'Alice', bio: null}),
  });
});

test('uses authenticated paged profile route with encoded user ID', async () => {
  const posts = [{id: 'post-1', body: 'Hello'}];
  pageRequest.mockResolvedValue({data: posts, meta: {limit: 20, offset: 20, hasMore: true}});
  await expect(getProfilePage('a/b', 'posts', 20)).resolves.toEqual({items: posts, hasMore: true, offset: 20});
  expect(pageRequest).toHaveBeenCalledWith('/users/a%2Fb/posts?limit=20&offset=20', {auth: 'required'});
});
