import {apiRequest, apiRequestPage} from '../../../core/api/apiClient';
import {formatRelativeTime, toPostCardData} from '../homePresentation';
import {
  addPostComment, createPost, deletePost, deletePostComment, getFeedPage, getPostComments, likePost, mapPost, unlikePost,
} from '../homeService';
import type {ApiPost} from '../types';

jest.mock('../../../core/api/apiClient', () => ({apiRequest: jest.fn(), apiRequestPage: jest.fn()}));
const request = apiRequest as jest.Mock;
const requestPage = apiRequestPage as jest.Mock;

const apiPost = (overrides: Partial<ApiPost> = {}): ApiPost => ({
  id: 'post-1',
  body: 'Hello there',
  media: [{url: 'https://cdn.example/a.jpg', type: 'IMAGE'}],
  visibility: 'PUBLIC',
  createdAt: '2026-10-07T10:00:00.000Z',
  updatedAt: '2026-10-07T10:00:00.000Z',
  author: {id: 'user-1', name: 'Asha', avatarUrl: 'https://cdn.example/asha.jpg'},
  reactions: {likeCount: 4, viewerHasLiked: true},
  commentCount: 2,
  shareCount: 0,
  ...overrides,
});

beforeEach(() => { jest.resetAllMocks(); });

test('maps the backend post serializer shape to the feed model', () => {
  expect(mapPost(apiPost())).toEqual({
    id: 'post-1', authorId: 'user-1', author: 'Asha', authorAvatarUrl: 'https://cdn.example/asha.jpg', authorIsPlus: false,
    createdAt: '2026-10-07T10:00:00.000Z', content: 'Hello there', images: ['https://cdn.example/a.jpg'],
    likes: 4, likedByViewer: true, comments: 2, shares: 0,
  });
});

test('treats a missing commentCount and null body as empty values', () => {
  const mapped = mapPost(apiPost({body: null, commentCount: undefined, media: []}));
  expect(mapped.comments).toBe(0);
  expect(mapped.content).toBe('');
  expect(mapped.images).toEqual([]);
});

test('drops device-local image paths that other viewers can never load', () => {
  const mapped = mapPost(apiPost({media: [
    {url: 'file:///data/user/0/com.hivachat.app/cache/photo.jpg', type: 'IMAGE'},
    {url: 'https://cdn.example/b.jpg', type: 'IMAGE'},
  ]}));
  expect(mapped.images).toEqual(['https://cdn.example/b.jpg']);
});

test('loads the feed with cursor pagination', async () => {
  request.mockResolvedValue({posts: [apiPost()], page: {limit: 20, hasMore: true, nextCursor: 'abc=='}});
  const first = await getFeedPage();
  expect(request).toHaveBeenLastCalledWith('/posts/feed?limit=20', {auth: 'required'});
  expect(first).toEqual({posts: [mapPost(apiPost())], hasMore: true, nextCursor: 'abc=='});

  request.mockResolvedValue({posts: [], page: {limit: 20, hasMore: false, nextCursor: null}});
  await getFeedPage(first.nextCursor);
  expect(request).toHaveBeenLastCalledWith('/posts/feed?limit=20&cursor=abc%3D%3D', {auth: 'required'});
});

test('uses the like reaction routes', async () => {
  request.mockResolvedValue({likeCount: 1, viewerHasLiked: true});
  await likePost('post-1');
  expect(request).toHaveBeenLastCalledWith('/posts/post-1/reactions/like', {auth: 'required', method: 'POST'});
  await unlikePost('post-1');
  expect(request).toHaveBeenLastCalledWith('/posts/post-1/reactions/like', {auth: 'required', method: 'DELETE'});
});

test('creates and deletes posts', async () => {
  request.mockResolvedValue(apiPost({id: 'new'}));
  const created = await createPost('Hi all');
  expect(request).toHaveBeenLastCalledWith('/posts', {auth: 'required', method: 'POST', body: JSON.stringify({body: 'Hi all'})});
  expect(created.id).toBe('new');

  request.mockResolvedValue(undefined);
  await deletePost('new');
  expect(request).toHaveBeenLastCalledWith('/posts/new', {auth: 'required', method: 'DELETE'});
});

test('uses the comments contract', async () => {
  const comment = {id: 'c1', body: 'Nice', createdAt: '2026-10-07T10:00:00.000Z', author: {id: 'user-2', name: 'Ravi', avatarUrl: null}};
  requestPage.mockResolvedValue({data: [comment], meta: {limit: 20, offset: 20, hasMore: true}});
  await expect(getPostComments('post-1', 20)).resolves.toEqual({items: [comment], hasMore: true, offset: 20});
  expect(requestPage).toHaveBeenLastCalledWith('/posts/post-1/comments?limit=20&offset=20', {auth: 'required'});

  request.mockResolvedValue(comment);
  await addPostComment('post-1', 'Nice');
  expect(request).toHaveBeenLastCalledWith('/posts/post-1/comments', {auth: 'required', method: 'POST', body: JSON.stringify({body: 'Nice'})});

  request.mockResolvedValue(undefined);
  await deletePostComment('post-1', 'c1');
  expect(request).toHaveBeenLastCalledWith('/posts/post-1/comments/c1', {auth: 'required', method: 'DELETE'});
});

test('formats relative times and only lets authors delete', () => {
  const now = Date.parse('2026-10-07T12:00:00.000Z');
  expect(formatRelativeTime('2026-10-07T11:59:30.000Z', now)).toBe('now');
  expect(formatRelativeTime('2026-10-07T11:15:00.000Z', now)).toBe('45m');
  expect(formatRelativeTime('2026-10-07T09:00:00.000Z', now)).toBe('3h');
  expect(formatRelativeTime('2026-10-04T12:00:00.000Z', now)).toBe('3d');
  expect(formatRelativeTime('2026-09-23T12:00:00.000Z', now)).toBe('2w');

  const post = mapPost(apiPost());
  expect(toPostCardData(post, 'user-1', now)).toMatchObject({time: '2h', canDelete: true, likes: 4, comments: 2});
  expect(toPostCardData(post, 'someone-else', now).canDelete).toBe(false);
  expect(toPostCardData(post, null, now).canDelete).toBe(false);
});
