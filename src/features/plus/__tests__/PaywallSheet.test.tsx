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
  expect(text).toContain('Filter by city, language, interest and who is active now');
  expect(text).not.toMatch(/age range|similar interests/i);
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

const radios = (renderer: ReactTestRenderer.ReactTestRenderer) => renderer.root.findAll(node => node.props.accessibilityRole === 'radio');
const button = (renderer: ReactTestRenderer.ReactTestRenderer, label: string) =>
  renderer.root.findAll(node => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function')[0];
const skeletons = (renderer: ReactTestRenderer.ReactTestRenderer) => renderer.root.findAll(node => typeof node.type === 'string' && node.props.testID === 'price-skeleton');

describe('price states', () => {
  test('while Play loads it shows skeletons, no prices, and a disabled Upgrade', async () => {
    (Iap.fetchProducts as jest.Mock).mockReturnValue(new Promise(() => {}));
    const renderer = await render();
    const text = allText(renderer);
    expect(skeletons(renderer)).toHaveLength(3);
    expect(radios(renderer)).toHaveLength(0);
    expect(text).not.toMatch(/[$₹]/);
    expect(button(renderer, 'Upgrade to Hiva Plus').props.disabled).toBe(true);
    expect(button(renderer, 'Retry')).toBeUndefined();
    await press(renderer, 'Upgrade to Hiva Plus');
    expect(Iap.fetchProducts).toHaveBeenCalledTimes(1);
    expect(Iap.requestPurchase).not.toHaveBeenCalled();
  });

  test('ready shows only Play prices and enables Upgrade', async () => {
    const renderer = await render();
    expect(skeletons(renderer)).toHaveLength(0);
    expect(button(renderer, 'Upgrade to Hiva Plus').props.disabled).toBe(false);
    expect(button(renderer, 'Retry')).toBeUndefined();
    expect(allText(renderer)).not.toContain('$');
    expect(allText(renderer)).not.toContain('Prices unavailable');
  });

  test('a device without Play Billing says prices are unavailable, has no invented prices, and Upgrade buys nothing', async () => {
    (Iap.initConnection as jest.Mock).mockRejectedValueOnce({code: 'billing-unavailable', message: 'nope'});
    const renderer = await render();
    const text = allText(renderer);
    expect(text).toContain('Prices unavailable');
    expect(text).toContain('Purchases aren’t available on this device');
    expect(text).not.toMatch(/\$\d/);
    expect(radios(renderer)).toHaveLength(0);
    expect(text).toContain('Renews automatically. Cancel anytime in Google Play.');
    expect(text).toContain('Manage subscriptions in Google Play');
    expect(button(renderer, 'Upgrade to Hiva Plus')).toBeUndefined();
    expect(button(renderer, 'Retry')).toBeDefined();
    expect(Iap.requestPurchase).not.toHaveBeenCalled();
  });

  test('offline surfaces the error and Retry reloads, then prices appear', async () => {
    (Iap.fetchProducts as jest.Mock).mockRejectedValueOnce({code: 'network-error', message: 'offline'});
    const renderer = await render();
    expect(allText(renderer)).toContain('Prices unavailable');
    expect(allText(renderer)).toContain('Couldn’t reach Google Play. Check your connection and try again.');
    expect(radios(renderer)).toHaveLength(0);
    expect(allText(renderer)).toContain('Restore purchases');
    await press(renderer, 'Retry');
    expect(Iap.fetchProducts).toHaveBeenCalledTimes(2);
    expect(allText(renderer)).toContain('₹99/mo');
    expect(allText(renderer)).not.toContain('Prices unavailable');
    expect(button(renderer, 'Retry')).toBeUndefined();
  });

  test('Play returning no matching plans is a failure, not an empty list', async () => {
    (Iap.fetchProducts as jest.Mock).mockResolvedValue([]);
    const renderer = await render();
    expect(allText(renderer)).toContain('Prices unavailable');
    expect(allText(renderer)).toContain('Plans aren’t available right now. Please try again later.');
    expect(button(renderer, 'Retry')).toBeDefined();
  });

  test('a load that hangs fails after 10 seconds with Retry', async () => {
    jest.useFakeTimers();
    try {
      (Iap.fetchProducts as jest.Mock).mockReturnValue(new Promise(() => {}));
      const renderer = await render();
      expect(skeletons(renderer)).toHaveLength(3);
      await ReactTestRenderer.act(async () => {jest.advanceTimersByTime(10_000);});
      expect(skeletons(renderer)).toHaveLength(0);
      expect(allText(renderer)).toContain('Prices unavailable');
      expect(button(renderer, 'Retry')).toBeDefined();
    } finally {jest.useRealTimers();}
  });

  test('on iOS it explains purchases are unavailable and offers no purchase controls', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    const renderer = await render();
    const text = allText(renderer);
    expect(text).toContain('Hiva Plus purchases aren’t available on this device yet.');
    expect(Iap.fetchProducts).not.toHaveBeenCalled();
    expect(text).not.toMatch(/[$₹]/);
    expect(text).not.toContain('Google Play');
    for (const label of ['Upgrade to Hiva Plus', 'Retry', 'Restore purchases', 'Manage subscriptions in Google Play']) expect(button(renderer, label)).toBeUndefined();
    expect(text).toContain('40 new chats a day');
  });
});
