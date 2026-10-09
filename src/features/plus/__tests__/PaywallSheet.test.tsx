import React from 'react';
import {Linking, Platform, Text} from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import * as Iap from 'react-native-iap';
import PaywallSheet from '../PaywallSheet';
import {resetBillingForTests} from '../billing';
import {verifyGooglePlayPurchase} from '../plusService';
import {resetPlus, setSubscription} from '../plusStore';
import {playProduct, purchase, subscription} from '../__fixtures__/plusFixtures';

jest.mock('../plusService', () => ({
  ...jest.requireActual('../plusService'),
  verifyGooglePlayPurchase: jest.fn(),
  getSubscription: jest.fn(),
}));

const iap = Iap as unknown as typeof Iap & {__emitPurchase: (p: unknown) => void; __resetListeners: () => void};
const verify = verifyGooglePlayPurchase as jest.Mock;

const allText = (renderer: ReactTestRenderer.ReactTestRenderer) =>
  renderer.root.findAllByType(Text).map(node => React.Children.toArray(node.props.children).filter(child => typeof child === 'string' || typeof child === 'number').join('')).join('\n');
const press = (renderer: ReactTestRenderer.ReactTestRenderer, label: string) =>
  ReactTestRenderer.act(async () => {renderer.root.findAll(node => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function')[0].props.onPress();});
const pressRadio = (renderer: ReactTestRenderer.ReactTestRenderer, prefix: string) =>
  ReactTestRenderer.act(async () => {renderer.root.findAll(node => node.props.accessibilityRole === 'radio' && String(node.props.accessibilityLabel).startsWith(prefix) && typeof node.props.onPress === 'function')[0].props.onPress();});

let tree: ReactTestRenderer.ReactTestRenderer | undefined;
const render = async (props: Partial<React.ComponentProps<typeof PaywallSheet>> = {}) => {
  await ReactTestRenderer.act(async () => {tree = ReactTestRenderer.create(<PaywallSheet visible onClose={jest.fn()} {...props} />);});
  return tree!;
};

afterEach(() => ReactTestRenderer.act(() => tree?.unmount()));
beforeEach(() => {
  jest.clearAllMocks();
  jest.replaceProperty(Platform, 'OS', 'android');
  iap.__resetListeners();
  resetBillingForTests();
  resetPlus();
  setSubscription(subscription());
  (Iap.fetchProducts as jest.Mock).mockResolvedValue([playProduct]);
});

test('shows Play prices, the intro offer, yearly savings and the reason headline', async () => {
  const renderer = await render({reason: 'dmStarts', details: {limit: 'dmStarts', used: 10, max: 10, plusMax: 40}});
  const text = allText(renderer);
  expect(Iap.fetchProducts).toHaveBeenCalledWith({skus: ['hiva_plus'], type: 'subs'});
  expect(text).toContain('You’ve used today’s 10 new chats — Plus gives you 40');
  expect(text).toContain('₹39');
  expect(text).toContain('₹99');
  expect(text).toContain('₹799');
  expect(text).toContain('Save 32%');
  expect(text).toContain('₹49 for the first month, then ₹99/month');
  expect(text).toContain('Renews automatically. Cancel anytime in Google Play.');
  expect(text).toContain('Coming soon');
  // Yearly is preselected.
  expect(renderer.root.findAll(node => node.props.accessibilityRole === 'radio' && node.props.accessibilityState?.checked)[0].props.accessibilityLabel).toMatch(/^Yearly/);
});

test('the Play management link carries the sku and package', async () => {
  const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
  const renderer = await render();
  await press(renderer, 'Manage subscriptions in Google Play');
  expect(open).toHaveBeenCalledWith('https://play.google.com/store/account/subscriptions?sku=hiva_plus&package=com.hivachat.app');
});

test('buying posts the Play token and leaves acknowledgement to the server', async () => {
  verify.mockResolvedValue(subscription({plan: 'plus', status: 'active'}));
  const renderer = await render();
  await pressRadio(renderer, 'Monthly');
  await press(renderer, 'Start for ₹49');
  expect(Iap.requestPurchase).toHaveBeenCalledWith(expect.objectContaining({request: {google: {skus: ['hiva_plus'], subscriptionOffers: [{sku: 'hiva_plus', offerToken: 'tok-monthly-intro'}]}}}));
  await ReactTestRenderer.act(async () => {iap.__emitPurchase(purchase());});
  expect(verify).toHaveBeenCalledWith('hiva_plus', 'play-token-1');
  expect(Iap.finishTransaction).not.toHaveBeenCalled();
  expect(allText(renderer)).toContain('Welcome to Hiva Plus!');
});

test('TOKEN_IN_USE tells the user another account owns the subscription', async () => {
  verify.mockRejectedValue({status: 409, code: 'TOKEN_IN_USE', message: 'in use'});
  const renderer = await render();
  await press(renderer, 'Get Plus for ₹799');
  await ReactTestRenderer.act(async () => {iap.__emitPurchase(purchase());});
  expect(allText(renderer)).toContain('This Google Play subscription is already linked to another Hiva account.');
});

test('restore links an existing subscription', async () => {
  (Iap.getAvailablePurchases as jest.Mock).mockResolvedValue([purchase({isAcknowledgedAndroid: true})]);
  verify.mockResolvedValue(subscription({plan: 'plus', status: 'active'}));
  const renderer = await render();
  await press(renderer, 'Restore purchases');
  expect(verify).toHaveBeenCalledWith('hiva_plus', 'play-token-1');
  expect(allText(renderer)).toContain('Hiva Plus restored.');
});

test('a device without Play Billing says purchases are unavailable', async () => {
  (Iap.initConnection as jest.Mock).mockRejectedValueOnce({code: 'billing-unavailable', message: 'nope'});
  const renderer = await render();
  expect(allText(renderer)).toContain('Purchases aren’t available on this device');
  expect(renderer.root.findAll(node => node.props.accessibilityRole === 'radio')).toHaveLength(0);
});
