import React from 'react';
import {Text} from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import UserProfileModal from '../UserProfileModal';
import FollowListSheet from '../FollowListSheet';
import {followStore} from '../followState';
import {blockUser, followUser, getFollowList, getUserContentPage, getUserGiftSummary, getViewerFollowingIds} from '../usersService';

jest.mock('../../auth', () => ({loadSession: jest.fn().mockResolvedValue({user: {id: 'me'}})}));
jest.mock('../../messages', () => ({DirectConversation: () => null, startDirectConversation: jest.fn()}));
jest.mock('../usersService', () => {
  const actual = jest.requireActual('../usersService');
  return {
    ...actual,
    getUserProfile: jest.fn(), followUser: jest.fn(), unfollowUser: jest.fn(), getFollowList: jest.fn(),
    getUserContentPage: jest.fn(), getUserGiftSummary: jest.fn(), blockUser: jest.fn(), unblockUser: jest.fn(),
    reportUser: jest.fn(), getViewerFollowingIds: jest.fn(),
  };
});

type Renderer = ReactTestRenderer.ReactTestRenderer;
const texts = (renderer: Renderer) => renderer.root.findAllByType(Text).map(node => [node.props.children].flat().join(''));
const pressable = (renderer: Renderer, label: string) =>
  renderer.root.findAll(node => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function');
const press = (renderer: Renderer, label: string) => ReactTestRenderer.act(async () => {
  const [node] = pressable(renderer, label);
  if (!node) throw new Error(`No pressable labelled "${label}"`);
  node.props.onPress();
});
const deferred = <T,>() => {
  let resolve!: (value: T) => void; let reject!: (error: unknown) => void;
  const promise = new Promise<T>((ok, fail) => {resolve = ok; reject = fail;});
  return {promise, resolve, reject};
};

const post = {id: 'p1', body: 'Hello', createdAt: '2026-10-01T00:00:00Z', media: [], author: {id: 'u2', name: 'Asha', avatarUrl: null}, reactions: {likeCount: 3, viewerHasLiked: false}, commentCount: 0};
const onBlocked = jest.fn();

const renderModal = async (userId = 'u2') => {
  let renderer: Renderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<UserProfileModal userId={userId} initial={{name: 'Asha', avatarUrl: null, handle: 'asha_k'}} visible onClose={jest.fn()} onBlocked={onBlocked} />);
  });
  return renderer!;
};

let tree: Renderer | undefined;
afterEach(() => ReactTestRenderer.act(() => tree?.unmount()));
beforeEach(() => {
  jest.clearAllMocks();
  followStore.reset();
  (getViewerFollowingIds as jest.Mock).mockResolvedValue(new Set());
  (getUserContentPage as jest.Mock).mockResolvedValue({items: [post], hasMore: false, offset: 0});
  (getUserGiftSummary as jest.Mock).mockRejectedValue({status: 500, message: 'nope'});
});

test('follow flips optimistically, settles on the server count, and rolls back on failure', async () => {
  tree = await renderModal();
  expect(pressable(tree, 'Follow Asha')).toHaveLength(1);

  const request = deferred<unknown>();
  (followUser as jest.Mock).mockReturnValueOnce(request.promise);
  await press(tree, 'Follow Asha');
  expect(followUser).toHaveBeenCalledWith('u2');
  expect(pressable(tree, 'Unfollow Asha')).toHaveLength(1);
  await ReactTestRenderer.act(async () => {request.resolve({userId: 'u2', isFollowing: true, followers: 12});});
  expect(texts(tree)).toContain('12');
  expect(pressable(tree, 'Unfollow Asha')).toHaveLength(1);

  // Unfollow fails: back to "Following" with the error, count restored.
  const failing = deferred<unknown>();
  const {unfollowUser} = jest.requireMock('../usersService');
  (unfollowUser as jest.Mock).mockReturnValueOnce(failing.promise);
  await press(tree, 'Unfollow Asha');
  expect(pressable(tree, 'Follow Asha')).toHaveLength(1);
  expect(texts(tree)).toContain('11');
  await ReactTestRenderer.act(async () => {failing.reject({status: 500, message: 'Server is down'});});
  expect(pressable(tree, 'Unfollow Asha')).toHaveLength(1);
  expect(texts(tree)).toEqual(expect.arrayContaining(['12', 'Server is down']));
});

test('a 403 shows the private state, and following unlocks the content', async () => {
  (getUserContentPage as jest.Mock).mockRejectedValueOnce({status: 403, message: 'This profile is private'});
  tree = await renderModal();
  expect(texts(tree)).toContain('This account is private');
  expect(texts(tree)).not.toContain('Posts');

  (followUser as jest.Mock).mockResolvedValueOnce({userId: 'u2', isFollowing: true, followers: 1});
  await press(tree, 'Follow Asha');
  expect(texts(tree)).not.toContain('This account is private');
  expect(texts(tree)).toContain('Posts');
  expect(getUserContentPage).toHaveBeenLastCalledWith('u2', 'posts', 0);
});

test('a 404 shows the unavailable state without follow, message or menu', async () => {
  (getUserContentPage as jest.Mock).mockRejectedValueOnce({status: 404, message: 'Not found'});
  tree = await renderModal();
  expect(texts(tree)).toContain("This profile isn't available");
  expect(pressable(tree, 'Follow Asha')).toHaveLength(0);
  expect(pressable(tree, 'Message Asha')).toHaveLength(0);
  expect(pressable(tree, 'More options')).toHaveLength(0);
});

test('a load error offers a retry that reloads the tab', async () => {
  (getUserContentPage as jest.Mock).mockRejectedValueOnce({status: 500, message: 'Server hiccup.'});
  tree = await renderModal();
  expect(texts(tree)).toContain('Server hiccup. Tap to retry.');
  await press(tree, 'Retry Posts');
  expect(getUserContentPage).toHaveBeenCalledTimes(2);
  expect(texts(tree)).not.toContain('Server hiccup. Tap to retry.');
});

test('block asks for confirmation before calling the API', async () => {
  (blockUser as jest.Mock).mockResolvedValue(undefined);
  tree = await renderModal();
  await press(tree, 'More options');
  await press(tree, 'Block Asha');
  expect(blockUser).not.toHaveBeenCalled();
  expect(texts(tree)).toContain('Block Asha?');
  await press(tree, 'Block');
  expect(blockUser).toHaveBeenCalledWith('u2');
  expect(onBlocked).toHaveBeenCalledWith('u2');
  expect(texts(tree)).toContain('You blocked Asha');
});

test('viewing yourself hides follow, message, report and block', async () => {
  tree = await renderModal('me');
  expect(pressable(tree, 'Follow Asha')).toHaveLength(0);
  expect(pressable(tree, 'Message Asha')).toHaveLength(0);
  await press(tree, 'More options');
  expect(pressable(tree, 'Share profile')).toHaveLength(1);
  expect(pressable(tree, 'Report')).toHaveLength(0);
  expect(pressable(tree, 'Block Asha')).toHaveLength(0);
});

test('follow list pages with Load more and shows a follow button per row', async () => {
  const person = (i: number) => ({id: `f${i}`, name: `Fan ${i}`, handle: null, avatarUrl: null, followedAt: '2026-10-07T10:00:00Z'});
  (getViewerFollowingIds as jest.Mock).mockResolvedValue(new Set(['f1']));
  (getFollowList as jest.Mock)
    .mockResolvedValueOnce({items: Array.from({length: 20}, (_, i) => person(i)), hasMore: true, offset: 0})
    .mockResolvedValueOnce({items: [person(20), person(21)], hasMore: false, offset: 20});
  const onOpenUser = jest.fn();
  await ReactTestRenderer.act(async () => {
    tree = ReactTestRenderer.create(<FollowListSheet userId="u2" kind="followers" visible onClose={jest.fn()} onOpenUser={onOpenUser} />);
  });
  expect(getFollowList).toHaveBeenCalledWith('u2', 'followers', 0);
  expect(pressable(tree!, 'Unfollow Fan 1')).toHaveLength(1);
  expect(pressable(tree!, 'Follow Fan 2')).toHaveLength(1);

  await press(tree!, 'Load more');
  expect(getFollowList).toHaveBeenLastCalledWith('u2', 'followers', 20);
  expect(texts(tree!)).toEqual(expect.arrayContaining(['Fan 0', 'Fan 19', 'Fan 21']));
  expect(pressable(tree!, 'Load more')).toHaveLength(0);

  await press(tree!, "Open Fan 21's profile");
  expect(onOpenUser).toHaveBeenCalledWith(person(21));
});
