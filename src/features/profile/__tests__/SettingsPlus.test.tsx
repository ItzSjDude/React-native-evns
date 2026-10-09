import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import {Provider} from 'react-redux';
import {store} from '../../../core/store';
import {setSession} from '../../auth';
import {PlusProvider, PaywallSheet, PlusSettingsScreen} from '../../plus';
import {getSubscription} from '../../plus/plusService';
import {resetPlus, setSubscription} from '../../plus/plusStore';
import {subscription} from '../../plus/__fixtures__/plusFixtures';
import SettingsScreen from '../SettingsScreen';

jest.mock('../profileService', () => ({
  getNearbyVisibility: jest.fn().mockResolvedValue({visible: true}), setNearbyVisibility: jest.fn(),
  getMySettings: jest.fn().mockRejectedValue({status: 404, message: 'Not found'}), updateMySettings: jest.fn(),
  getBlockedUsers: jest.fn().mockRejectedValue({status: 404, message: 'Not found'}), unblockUser: jest.fn(), deleteMyAccount: jest.fn(),
}));
jest.mock('../../plus/plusService', () => ({...jest.requireActual('../../plus/plusService'), getSubscription: jest.fn()}));

const labels = (renderer: ReactTestRenderer.ReactTestRenderer) => renderer.root.findAll(node => typeof node.props.accessibilityLabel === 'string').map(node => node.props.accessibilityLabel as string);

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

afterEach(() => ReactTestRenderer.act(() => tree?.unmount()));
beforeEach(() => {
  jest.clearAllMocks();
  resetPlus();
  store.dispatch(setSession({accessToken: 'a', refreshToken: 'r'} as never));
});

test('no Plus row or paywall when the subscription route 404s (today’s production)', async () => {
  (getSubscription as jest.Mock).mockResolvedValue(null);
  const renderer = await render();
  expect(getSubscription).toHaveBeenCalled();
  expect(labels(renderer)).not.toContain('Hiva Plus');
  expect(renderer.root.findAllByType(PaywallSheet)).toHaveLength(0);
});

test('no Plus row when the server reports Plus disabled', async () => {
  (getSubscription as jest.Mock).mockResolvedValue(subscription({enabled: false}));
  const renderer = await render();
  expect(labels(renderer)).not.toContain('Hiva Plus');
  expect(renderer.root.findAllByType(PaywallSheet)).toHaveLength(0);
});

test('no Plus row while the flag is off and the server sends no plans', async () => {
  (getSubscription as jest.Mock).mockResolvedValue(subscription({plans: []}));
  const renderer = await render();
  expect(labels(renderer)).not.toContain('Hiva Plus');
  expect(renderer.root.findAllByType(PaywallSheet)).toHaveLength(0);
});

test('a free user’s Plus row opens the paywall; a Plus member’s opens Plus settings', async () => {
  (getSubscription as jest.Mock).mockResolvedValue(subscription());
  const renderer = await render();
  const row = () => renderer.root.findAll(node => node.props.accessibilityLabel === 'Hiva Plus' && typeof node.props.onPress === 'function')[0];
  expect(row()).toBeDefined();
  await ReactTestRenderer.act(async () => {row().props.onPress();});
  expect(renderer.root.findByType(PaywallSheet).props.visible).toBe(true);

  await ReactTestRenderer.act(async () => {setSubscription(subscription({plan: 'plus', status: 'active', basePlanId: 'yearly'}));});
  await ReactTestRenderer.act(async () => {row().props.onPress();});
  expect(renderer.root.findByType(PlusSettingsScreen).props.visible).toBe(true);
});
