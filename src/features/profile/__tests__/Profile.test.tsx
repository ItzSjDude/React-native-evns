import React from 'react';
import {Text} from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import {Provider} from 'react-redux';
import {store} from '../../../core/store';
import Profile from '../Profile';
import {deleteMyAccount, getBlockedUsers, getGiftSummary, getMyProfile, getMySettings, getNearbyVisibility, getProfilePage, setNearbyVisibility, updateMyProfile, updateMySettings} from '../profileService';
import type {UserProfile} from '../types';

jest.mock('@react-navigation/native', () => {
  const ReactActual = jest.requireActual('react');
  return {useFocusEffect: (effect: () => void | (() => void)) => ReactActual.useEffect(effect, [effect]), useNavigation: () => ({navigate: mockNavigate})};
});
const mockNavigate = jest.fn();
let mockLiveParty: {party: {title: string}} | null = null;
const mockExpand = jest.fn();
jest.mock('../../party', () => ({usePartySession: () => ({session: mockLiveParty, expand: mockExpand})}));
jest.mock('../profileService', () => ({
  getMyProfile: jest.fn(), getProfilePage: jest.fn(), updateMyProfile: jest.fn(),
  getNearbyVisibility: jest.fn(), setNearbyVisibility: jest.fn(),
  getMySettings: jest.fn(), updateMySettings: jest.fn(), getBlockedUsers: jest.fn(), unblockUser: jest.fn(),
  getGiftSummary: jest.fn(), deleteMyAccount: jest.fn(),
}));
jest.mock('../../auth', () => {
  const slice = jest.requireActual('../../auth/authSlice');
  return {authReducer: slice.default, clearSession: slice.clearSession, logoutFromApi: jest.fn().mockResolvedValue(undefined)};
});
const settingsDefaults = {notifyFollowedLive: true, notifyGiftsMentions: true, joinMuted: true, hideOnlineStatus: false, privateProfile: false, seatInvitesFrom: 'everyone', language: 'hinglish'};

const profile = (overrides: Partial<UserProfile> = {}): UserProfile => ({
  id: 'u1', name: 'Sachin Jangir', email: 'me@example.com', avatar_url: null, cover_image_url: null,
  handle: 'sachinj', bio: 'Just for fun', interests: ['football'], city: 'Jaipur',
  stats: {following: 0, hosted: 96, posts: 12}, ...overrides,
});

const texts = (renderer: ReactTestRenderer.ReactTestRenderer) =>
  renderer.root.findAllByType(Text).map(node => [node.props.children].flat().join(''));
const press = (renderer: ReactTestRenderer.ReactTestRenderer, label: string) =>
  ReactTestRenderer.act(async () => {renderer.root.findAll(node => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function')[0].props.onPress();});

const render = async () => {
  let renderer: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {renderer = ReactTestRenderer.create(<Provider store={store}><Profile /></Provider>);});
  return renderer!;
};

let tree: ReactTestRenderer.ReactTestRenderer | undefined;
afterEach(() => ReactTestRenderer.act(() => tree?.unmount()));
beforeEach(() => {
  jest.clearAllMocks();
  mockLiveParty = null;
  (getMyProfile as jest.Mock).mockResolvedValue(profile());
  (getProfilePage as jest.Mock).mockResolvedValue({items: [], hasMore: false, offset: 0});
  (getNearbyVisibility as jest.Mock).mockResolvedValue({visible: true});
  // Default: an older server without the profile-settings API.
  (getMySettings as jest.Mock).mockRejectedValue({status: 404, message: 'Not found'});
  (getBlockedUsers as jest.Mock).mockRejectedValue({status: 404, message: 'Not found'});
});

test('shows profile details with all three stats and no dead settings rows', async () => {
  tree = await render();
  const shown = texts(tree);
  expect(shown).toEqual(expect.arrayContaining(['Sachin Jangir', '@sachinj', 'Just for fun', 'Jaipur', '12', 'Posts', '96', 'Hosted', 'Following', 'Rooms']));
  expect(shown.join(' ')).not.toMatch(/coming soon|Security|Blocked people/);
});

test('saving the edit sheet patches the profile and shows the server result', async () => {
  (updateMyProfile as jest.Mock).mockResolvedValue(profile({bio: 'New bio'}));
  tree = await render();
  await press(tree, 'Edit profile');
  await press(tree, 'Save changes');
  expect(updateMyProfile).toHaveBeenCalledWith(expect.objectContaining({name: 'Sachin Jangir', handle: 'sachinj', interests: ['football']}));
  expect(texts(tree)).toContain('New bio');
});

test('a taken handle keeps the sheet open with a clear error', async () => {
  (updateMyProfile as jest.Mock).mockRejectedValue({status: 409, message: 'Conflict'});
  tree = await render();
  await press(tree, 'Edit profile');
  await press(tree, 'Save changes');
  expect(texts(tree)).toContain('That handle is already taken. Try another.');
});

test('settings toggles nearby visibility and rolls back on failure', async () => {
  (setNearbyVisibility as jest.Mock).mockRejectedValue({message: 'Post your location before changing visibility'});
  tree = await render();
  await press(tree, 'Settings');
  expect(texts(tree)).toContain('People around you can find you');
  await press(tree, 'Show me in Nearby');
  expect(setNearbyVisibility).toHaveBeenCalledWith(false);
  expect(texts(tree)).toEqual(expect.arrayContaining(['Post your location before changing visibility', 'People around you can find you']));
});

test('interests saved outside the preset list still show and can be removed', async () => {
  (updateMyProfile as jest.Mock).mockResolvedValue(profile({interests: []}));
  tree = await render();
  await press(tree, 'Edit profile');
  const chip = tree.root.findAll(node => node.props.accessibilityRole === 'checkbox' && node.props.accessibilityState?.checked && typeof node.props.onPress === 'function');
  expect(chip).toHaveLength(1);
  await ReactTestRenderer.act(async () => chip[0].props.onPress());
  await press(tree, 'Save changes');
  expect(updateMyProfile).toHaveBeenCalledWith(expect.objectContaining({interests: []}));
});

test('shows a back-to-room banner while the user is in a party', async () => {
  mockLiveParty = {party: {title: 'sjjjj'}};
  tree = await render();
  expect(texts(tree)).toEqual(expect.arrayContaining(["YOU'RE IN A ROOM", 'sjjjj']));
  await press(tree, 'Back to your live room');
  expect(mockExpand).toHaveBeenCalled();
});

test('the rooms tab offers hosting a room via the Party tab', async () => {
  tree = await render();
  await ReactTestRenderer.act(async () => {
    tree!.root.findAll(node => node.props.accessibilityRole === 'tab' && typeof node.props.onPress === 'function')[1].props.onPress();
  });
  await press(tree, 'Host a room');
  expect(mockNavigate).toHaveBeenCalledWith('Party');
});

test('on the new backend, stats show fans, following and gifts and a gifts tab loads the summary', async () => {
  (getMyProfile as jest.Mock).mockResolvedValue(profile({stats: {following: 3, hosted: 96, posts: 12, followers: 1200, giftsReceived: 27}}));
  (getGiftSummary as jest.Mock).mockResolvedValue({totalReceived: 27, byGift: [{type: 'rose', name: 'rose', count: 20}], topSupporters: [{id: 's1', name: 'Rina', avatarUrl: null, total: 8}]});
  tree = await render();
  expect(texts(tree)).toEqual(expect.arrayContaining(['Fans', '1.2k', 'Gifts mile', '27', 'Gifts']));
  await ReactTestRenderer.act(async () => {
    tree!.root.findAll(node => node.props.accessibilityRole === 'tab' && typeof node.props.onPress === 'function')[3].props.onPress();
  });
  expect(getGiftSummary).toHaveBeenCalledWith('u1');
  expect(texts(tree)).toEqual(expect.arrayContaining(['20', 'Rose', 'Sabse bade supporters']));
});

test('older servers hide settings that need the new API', async () => {
  tree = await render();
  await press(tree, 'Settings');
  const labels = tree.root.findAll(node => typeof node.props.accessibilityLabel === 'string').map(node => node.props.accessibilityLabel);
  expect(labels).not.toContain('Private profile');
  expect(labels).not.toContain('Delete account');
});

test('private profile toggle patches settings and rolls back on failure', async () => {
  (getMySettings as jest.Mock).mockResolvedValue(settingsDefaults);
  (getBlockedUsers as jest.Mock).mockResolvedValue([]);
  (updateMySettings as jest.Mock).mockRejectedValue({message: 'Server down'});
  tree = await render();
  await press(tree, 'Settings');
  await press(tree, 'Private profile');
  expect(updateMySettings).toHaveBeenCalledWith({privateProfile: true});
  const toggle = tree.root.findAll(node => node.props.accessibilityLabel === 'Private profile' && node.props.accessibilityState)[0];
  expect(toggle.props.accessibilityState.checked).toBe(false);
  expect(texts(tree)).toContain('Server down');
});

test('deleting the account requires typing DELETE, then signs out', async () => {
  (getMySettings as jest.Mock).mockResolvedValue(settingsDefaults);
  (getBlockedUsers as jest.Mock).mockResolvedValue([]);
  (deleteMyAccount as jest.Mock).mockResolvedValue({deleted: true});
  const {logoutFromApi} = jest.requireMock('../../auth');
  tree = await render();
  await press(tree, 'Settings');
  await press(tree, 'Delete account');
  await press(tree, 'Delete account');
  expect(deleteMyAccount).not.toHaveBeenCalled();
  await ReactTestRenderer.act(async () => {
    tree!.root.findAll(node => node.props.accessibilityLabel === 'Type DELETE to confirm' && typeof node.props.onChangeText === 'function')[0].props.onChangeText('DELETE');
  });
  const buttons = tree.root.findAll(node => node.props.accessibilityLabel === 'Delete account' && typeof node.props.onPress === 'function');
  await ReactTestRenderer.act(async () => buttons[buttons.length - 1].props.onPress());
  expect(deleteMyAccount).toHaveBeenCalled();
  expect(logoutFromApi).toHaveBeenCalled();
});
