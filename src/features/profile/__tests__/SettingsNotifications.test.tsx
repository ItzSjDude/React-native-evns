import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import {Provider} from 'react-redux';
import {store} from '../../../core/store';
import {setSession} from '../../auth';
import {PlusProvider, PaywallSheet} from '../../plus';
import {getSubscription} from '../../plus/plusService';
import {resetPlus} from '../../plus/plusStore';
import {subscription} from '../../plus/__fixtures__/plusFixtures';
import {getMySettings, updateMySettings} from '../profileService';
import SettingsScreen from '../SettingsScreen';
import type {UserSettings} from '../types';

jest.mock('../profileService', () => ({
  getNearbyVisibility: jest.fn().mockResolvedValue({visible: true}), setNearbyVisibility: jest.fn(),
  getMySettings: jest.fn(), updateMySettings: jest.fn(),
  getBlockedUsers: jest.fn().mockRejectedValue({status: 404, message: 'Not found'}), unblockUser: jest.fn(), deleteMyAccount: jest.fn(),
}));
jest.mock('../../plus/plusService', () => ({...jest.requireActual('../../plus/plusService'), getSubscription: jest.fn()}));

const SETTINGS: UserSettings = {
  notifyFollowedLive: true, notifyGiftsMentions: true, joinMuted: false, hideOnlineStatus: false, privateProfile: false,
  seatInvitesFrom: 'everyone', language: 'en', showPlusBadge: false, profileTheme: 'default',
  quietHoursEnabled: false, quietStartLocal: '22:00:00', quietEndLocal: '08:00:00', quietTimezone: 'Asia/Kolkata',
  quietDays: [0, 1, 2, 3, 4, 5, 6], quietAllowDirectMentions: true, digestEnabled: false,
};

let tree: ReactTestRenderer.ReactTestRenderer | undefined;
const render = async () => {
  await ReactTestRenderer.act(async () => {
    tree = ReactTestRenderer.create(<Provider store={store}>
      <SettingsScreen profile={null} visible onClose={jest.fn()} onEditProfile={jest.fn()} onLogout={jest.fn()} />
      <PlusProvider />
    </Provider>);
  });
  return tree!;
};
const row = (label: string) => tree!.root.findAll(node => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function')[0];
const press = (label: string) => ReactTestRenderer.act(async () => {row(label).props.onPress();});
const checked = (label: string) => row(label).props.accessibilityState.checked;

afterEach(() => ReactTestRenderer.act(() => tree?.unmount()));
beforeEach(() => {
  jest.clearAllMocks();
  resetPlus();
  store.dispatch(setSession({accessToken: 'a', refreshToken: 'r'} as never));
  let server = SETTINGS;
  (getMySettings as jest.Mock).mockImplementation(async () => server);
  (updateMySettings as jest.Mock).mockImplementation(async patch => (server = {...server, ...patch}));
});

test('free users: manual controls PATCH, Plus rows are locked and open the paywall without a PATCH', async () => {
  (getSubscription as jest.Mock).mockResolvedValue(subscription());
  const renderer = await render();

  await press('Friends going live');
  expect(updateMySettings).toHaveBeenLastCalledWith({notifyFollowedLive: false});
  await press('Gifts and mentions');
  expect(updateMySettings).toHaveBeenLastCalledWith({notifyGiftsMentions: false});

  (updateMySettings as jest.Mock).mockClear();
  expect(row('Quiet hours').props.accessibilityRole).toBe('button');
  await press('Quiet hours');
  expect(renderer.root.findByType(PaywallSheet).props.visible).toBe(true);
  await press('Daily digest');
  expect(updateMySettings).not.toHaveBeenCalled();
  expect(renderer.root.findAll(node => node.props.accessibilityLabel === 'Quiet hours schedule')).toHaveLength(0);
});

test('Plus users: quiet hours and digest toggles PATCH the enabled flag and the device time zone', async () => {
  (getSubscription as jest.Mock).mockResolvedValue(subscription({plan: 'plus', status: 'ACTIVE', basePlanId: 'yearly'}));
  await render();
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  await press('Quiet hours');
  expect(updateMySettings).toHaveBeenLastCalledWith({quietHoursEnabled: true, quietTimezone: zone});
  expect(checked('Quiet hours')).toBe(true);
  expect(row('Quiet hours schedule')).toBeDefined();

  await press('Daily digest');
  expect(updateMySettings).toHaveBeenLastCalledWith({digestEnabled: true, quietTimezone: zone});

  await press('Quiet hours');
  expect(updateMySettings).toHaveBeenLastCalledWith({quietHoursEnabled: false});
});

test('Plus users: the schedule sheet PATCHes days and the direct-message bypass', async () => {
  (getSubscription as jest.Mock).mockResolvedValue(subscription({plan: 'plus', status: 'ACTIVE', basePlanId: 'yearly'}));
  (getMySettings as jest.Mock).mockResolvedValue({...SETTINGS, quietHoursEnabled: true});
  await render();

  await press('Quiet hours schedule');
  await press('Sunday');
  expect(updateMySettings).toHaveBeenLastCalledWith({quietDays: [1, 2, 3, 4, 5, 6]});
  await press('Still notify me about direct messages, on');
  expect(updateMySettings).toHaveBeenLastCalledWith({quietAllowDirectMentions: false});
});

test('a failed PATCH rolls the toggle back and shows the error', async () => {
  (getSubscription as jest.Mock).mockResolvedValue(subscription({plan: 'plus', status: 'ACTIVE', basePlanId: 'yearly'}));
  (updateMySettings as jest.Mock).mockRejectedValue({status: 403, message: 'Hiva Plus is required for this setting'});
  const renderer = await render();

  await press('Quiet hours');
  expect(checked('Quiet hours')).toBe(false);
  expect(renderer.root.findAll(node => node.props.accessibilityRole === 'alert')[0].props.children).toBe('Hiva Plus is required for this setting');
});
