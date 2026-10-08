import React from 'react';
import {Alert, Text} from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import Home from '../Home';
import {createPost, deletePost, getFeedPage, likePost} from '../homeService';
import type {HomePost} from '../types';

jest.mock('../../auth', () => ({
  loadSession: jest.fn().mockResolvedValue({user: {id: 'me', name: 'Me', avatar_url: null}}),
}));
jest.mock('../../party', () => ({
  usePartySession: () => ({session: null, open: jest.fn(), expand: jest.fn(), promptActiveParty: jest.fn()}),
  PartyRoomPreview: () => null,
}));
jest.mock('../../search', () => ({SearchScreen: () => null}));
jest.mock('../../events', () => ({EventsScreen: () => null, EventDetailSheet: () => null}));
jest.mock('../../notifications', () => ({NotificationsBell: () => null, useNotificationNavigator: jest.fn()}));
jest.mock('@react-navigation/native', () => ({useNavigation: () => ({navigate: jest.fn()})}));
jest.mock('../homeService', () => ({
  getFeedPage: jest.fn(),
  likePost: jest.fn(),
  unlikePost: jest.fn(),
  createPost: jest.fn(),
  deletePost: jest.fn(),
  reportPost: jest.fn(),
  getPostComments: jest.fn().mockResolvedValue({items: [], hasMore: false, offset: 0}),
  addPostComment: jest.fn(),
  deletePostComment: jest.fn(),
}));

const feed = getFeedPage as jest.Mock;
const like = likePost as jest.Mock;
const create = createPost as jest.Mock;
const remove = deletePost as jest.Mock;
const {reportPost: report} = jest.requireMock('../homeService') as {reportPost: jest.Mock};

const post = (overrides: Partial<HomePost> = {}): HomePost => ({
  id: 'p1', authorId: 'other', author: 'Asha', authorAvatarUrl: null, createdAt: new Date().toISOString(),
  content: 'From the API', images: [], likes: 5, likedByViewer: false, comments: 1, shares: 0, ...overrides,
});

const texts = (renderer: ReactTestRenderer.ReactTestRenderer) =>
  renderer.root.findAllByType(Text).map(node => [node.props.children].flat().join(''));

const render = async () => {
  let renderer: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => { renderer = ReactTestRenderer.create(<Home />); });
  return renderer!;
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

test('renders the feed from the API with a working search button', async () => {
  feed.mockResolvedValue({posts: [post(), post({id: 'p2', content: 'Second post', author: 'Ravi'})], hasMore: false, nextCursor: null});
  const renderer = await render();
  expect(feed).toHaveBeenCalledWith(null);
  const shown = texts(renderer);
  expect(shown).toContain('From the API');
  expect(shown).toContain('Second post');
  expect(shown).not.toContain('A perfect day by the sea 🌴');
  expect(renderer.root.findAll(node => node.props.accessibilityLabel === 'Search' && typeof node.props.onPress === 'function')).toHaveLength(1);
  expect(renderer.root.findAllByProps({accessibilityLabel: 'Notifications'})).toHaveLength(0);
  await ReactTestRenderer.act(async () => { renderer.unmount(); });
});

test('shows an error with retry when the feed fails, then recovers', async () => {
  feed.mockRejectedValueOnce({status: 500, message: 'Server down'});
  const renderer = await render();
  expect(texts(renderer)).toContain('Server down');
  feed.mockResolvedValue({posts: [post()], hasMore: false, nextCursor: null});
  await ReactTestRenderer.act(async () => { renderer.root.findByProps({accessibilityLabel: 'Retry loading feed'}).props.onPress(); });
  expect(texts(renderer)).toContain('From the API');
  await ReactTestRenderer.act(async () => { renderer.unmount(); });
});

test('rolls a like back when the request fails', async () => {
  feed.mockResolvedValue({posts: [post()], hasMore: false, nextCursor: null});
  let reject: (error: unknown) => void = () => {};
  like.mockReturnValue(new Promise((_, fail) => { reject = fail; }));
  const renderer = await render();

  await ReactTestRenderer.act(async () => { renderer.root.findByProps({accessibilityLabel: 'Like post'}).props.onPress(); });
  expect(like).toHaveBeenCalledWith('p1');
  expect(renderer.root.findAllByProps({accessibilityLabel: 'Unlike post'}).length).toBeGreaterThan(0);
  expect(texts(renderer)).toContain('6');

  await ReactTestRenderer.act(async () => { reject({status: 500, message: 'Nope'}); });
  expect(renderer.root.findAllByProps({accessibilityLabel: 'Like post'}).length).toBeGreaterThan(0);
  expect(texts(renderer)).toContain('5');
  expect(Alert.alert).toHaveBeenCalledWith('Could not update like', 'Nope');
  await ReactTestRenderer.act(async () => { renderer.unmount(); });
});

test('requests the next page with the cursor on end reached', async () => {
  feed.mockResolvedValueOnce({posts: [post()], hasMore: true, nextCursor: 'next'});
  feed.mockResolvedValueOnce({posts: [post({id: 'p2', content: 'Older post'})], hasMore: false, nextCursor: null});
  const renderer = await render();
  const list = renderer.root.findByProps({onEndReachedThreshold: 0.5});
  await ReactTestRenderer.act(async () => { list.props.onEndReached(); });
  expect(feed).toHaveBeenLastCalledWith('next');
  expect(texts(renderer)).toContain('Older post');
  await ReactTestRenderer.act(async () => { renderer.unmount(); });
});

test('optimistically inserts a new post and restores the draft on failure', async () => {
  feed.mockResolvedValue({posts: [post()], hasMore: false, nextCursor: null});
  let reject: (error: unknown) => void = () => {};
  create.mockReturnValue(new Promise((_, fail) => { reject = fail; }));
  const renderer = await render();

  await ReactTestRenderer.act(async () => { renderer.root.findByProps({accessibilityLabel: 'Create a post'}).props.onPress(); });
  await ReactTestRenderer.act(async () => { renderer.root.findByProps({accessibilityLabel: 'Post text'}).props.onChangeText('My new post'); });
  await ReactTestRenderer.act(async () => { renderer.root.findByProps({accessibilityLabel: 'Post'}).props.onPress(); });
  expect(create).toHaveBeenCalledWith('My new post', []);
  expect(texts(renderer)).toContain('Posting...');

  await ReactTestRenderer.act(async () => { reject({status: 500, message: 'Try later'}); });
  expect(texts(renderer)).not.toContain('Posting...');
  expect(renderer.root.findByProps({accessibilityLabel: 'Post text'}).props.value).toBe('My new post');
  expect(texts(renderer)).toContain("Your post wasn't shared. Try later");
  await ReactTestRenderer.act(async () => { renderer.unmount(); });
});

test('offers delete only on your own post and removes it after confirmation', async () => {
  feed.mockResolvedValue({posts: [post({id: 'mine', authorId: 'me', content: 'My post'})], hasMore: false, nextCursor: null});
  remove.mockResolvedValue(undefined);
  const renderer = await render();

  await ReactTestRenderer.act(async () => { renderer.root.findByProps({accessibilityLabel: 'More post options'}).props.onPress(); });
  await ReactTestRenderer.act(async () => { renderer.root.findByProps({label: 'Delete post', destructive: true}).props.onPress(); });
  expect(remove).not.toHaveBeenCalled();
  expect(texts(renderer)).toContain('Delete this post?');
  await ReactTestRenderer.act(async () => { renderer.root.findByProps({label: 'Delete post', variant: 'destructive'}).props.onPress(); });
  expect(remove).toHaveBeenCalledWith('mine');
  expect(texts(renderer)).not.toContain('My post');
  await ReactTestRenderer.act(async () => { renderer.unmount(); });
});

test('reports someone else\'s post with the chosen reason', async () => {
  feed.mockResolvedValue({posts: [post({id: 'theirs', authorId: 'other'})], hasMore: false, nextCursor: null});
  report.mockResolvedValue({id: 'r1'});
  const renderer = await render();

  await ReactTestRenderer.act(async () => { renderer.root.findByProps({accessibilityLabel: 'More post options'}).props.onPress(); });
  expect(renderer.root.findAll(node => node.props.label === 'Delete post')).toHaveLength(0);
  await ReactTestRenderer.act(async () => { renderer.root.findAll(node => node.props.accessibilityLabel === 'Report post' && typeof node.props.onPress === 'function')[0].props.onPress(); });
  await ReactTestRenderer.act(async () => { renderer.root.findByProps({label: 'Spam'}).props.onPress(); });
  expect(report).toHaveBeenCalledWith('theirs', 'Spam');
  expect(Alert.alert).toHaveBeenCalledWith('Report received', expect.any(String));
  await ReactTestRenderer.act(async () => { renderer.unmount(); });
});
