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

test('shows Play prices and the intro offer', async () => {
  const renderer = await render({reason: 'dmStarts', details: {limit: 'dmStarts', used: 10, max: 10, plusMax: 40}});
  const text = allText(renderer);
  expect(Iap.fetchProducts).toHaveBeenCalledWith({skus: ['hiva_plus'], type: 'subs'});
  expect(text).toContain('Unlock your full potential');
  expect(text).toContain('₹99/mo');
  expect(text).toContain('₹799/yr');
  expect(text).toContain('Best Value');
  expect(text).toContain('Popular');
  expect(text).toContain('₹49 for the first month, then ₹99/month');
  expect(text).toContain('Renews automatically. Cancel anytime in Google Play.');
  expect(text).not.toContain('Coming soon');
  expect(text).not.toContain('visibility');
  // Monthly is preselected.
  expect(renderer.root.findAll(node => node.props.accessibilityRole === 'radio' && node.props.accessibilityState?.checked)[0].props.accessibilityLabel).toMatch(/^Monthly/);
});

test('the filter benefit is listed', async () => {
  const text = allText(await render({reason: 'filters'}));
  expect(text).toContain('Advanced Filters');
  expect(text).toContain('Filter by City, languages, age range, active now, similar interests, and more');
});

test('without a reason it shows the default copy and every benefit', async () => {
  const text = allText(await render());
  for (const line of [
    'Get Hiva Plus', 'Unlock your full potential',
    '40 new chats a day', 'Up from 5 on free',
    '10 vibe notes valid for 24h', 'Up from 2 valid for 4h',
    'Pin & folder organization', 'Pin up to 5 chats and sort into folders',
    'Optional plus badge', 'Stand out on your profile',
    'Select a Plan', 'Upgrade to Hiva Plus', 'Restore purchases',
  ]) expect(text).toContain(line);
});

test('the Play management link carries the sku and package', async () => {
  const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
  const renderer = await render();
  await press(renderer, 'Manage subscriptions in Google Play');
  expect(open).toHaveBeenCalledWith('https://play.google.com/store/account/subscriptions?sku=hiva_plus&package=com.hivachat.app');
});

test('buying posts the Play token and leaves acknowledgement to the server', async () => {
  verify.mockResolvedValue(subscription({plan: 'plus', status: 'ACTIVE'}));
  const renderer = await render();
  await pressRadio(renderer, 'Monthly');
  await press(renderer, 'Upgrade to Hiva Plus');
  expect(Iap.requestPurchase).toHaveBeenCalledWith(expect.objectContaining({request: {google: {skus: ['hiva_plus'], subscriptionOffers: [{sku: 'hiva_plus', offerToken: 'tok-monthly-intro'}]}}}));
  await ReactTestRenderer.act(async () => {iap.__emitPurchase(purchase());});
  expect(verify).toHaveBeenCalledWith('hiva_plus', 'play-token-1');
  expect(Iap.finishTransaction).not.toHaveBeenCalled();
  expect(allText(renderer)).toContain('Welcome to Hiva Plus!');
});

test('TOKEN_IN_USE tells the user another account owns the subscription', async () => {
  verify.mockRejectedValue({status: 409, code: 'TOKEN_IN_USE', message: 'in use'});
  const renderer = await render();
  await pressRadio(renderer, 'Yearly');
  await press(renderer, 'Upgrade to Hiva Plus');
  await ReactTestRenderer.act(async () => {iap.__emitPurchase(purchase());});
  expect(allText(renderer)).toContain('This Google Play subscription is already linked to another Hiva account.');
});

test('restore links an existing subscription', async () => {
  (Iap.getAvailablePurchases as jest.Mock).mockResolvedValue([purchase({isAcknowledgedAndroid: true})]);
  verify.mockResolvedValue(subscription({plan: 'plus', status: 'ACTIVE'}));
  const renderer = await render();
  await press(renderer, 'Restore purchases');
  expect(verify).toHaveBeenCalledWith('hiva_plus', 'play-token-1');
  expect(allText(renderer)).toContain('Hiva Plus restored.');
});

test('a device without Play Billing shows static plans and Upgrade buys nothing', async () => {
  (Iap.initConnection as jest.Mock).mockRejectedValueOnce({code: 'billing-unavailable', message: 'nope'});
  const renderer = await render();
  const text = allText(renderer);
  expect(text).toContain('$12.99/mo');
  expect(text).not.toContain('available');
  expect(['Weekly', 'Monthly', 'Yearly'].every(plan => renderer.root.findAll(node => node.props.accessibilityRole === 'radio' && String(node.props.accessibilityLabel).startsWith(plan)).length > 0)).toBe(true);
  await press(renderer, 'Upgrade to Hiva Plus');
  expect(Iap.requestPurchase).not.toHaveBeenCalled();
});
