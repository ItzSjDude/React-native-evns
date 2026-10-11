import React from 'react';
import {Text} from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import {loadThemePrices, purchaseTheme, restoreThemePurchases} from '../billing';
import PlusSettingsScreen from '../PlusSettingsScreen';
import {getPlusState, resetPlus, setSubscription} from '../plusStore';
import {getProfileThemes} from '../profileThemeService';
import {resetProfileThemes} from '../profileThemeStore';
import {subscription} from '../__fixtures__/plusFixtures';
import {catalog, neonPack} from '../__fixtures__/themeFixtures';

jest.mock('../profileThemeService', () => ({getProfileThemes: jest.fn(), verifyThemePurchase: jest.fn()}));
jest.mock('../billing', () => ({
  ...jest.requireActual('../billing'),
  loadThemePrices: jest.fn(), purchaseTheme: jest.fn(), restoreThemePurchases: jest.fn(),
}));

const themes = getProfileThemes as jest.Mock;
const prefs = {showPlusBadge: false, profileTheme: 'default'};
let tree: ReactTestRenderer.ReactTestRenderer | undefined;
const render = async (onChange: jest.Mock = jest.fn().mockResolvedValue(undefined), profileTheme = 'default') => {
  await ReactTestRenderer.act(async () => {tree = ReactTestRenderer.create(<PlusSettingsScreen visible onClose={jest.fn()} preferences={{...prefs, profileTheme}} onChange={onChange} />);});
  return tree!;
};
const find = (label: string) => tree!.root.findAll(node => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function');
const press = (label: string) => ReactTestRenderer.act(async () => {find(label)[0].props.onPress();});
// findAll sees both the composite and the host node of a Pressable: dedupe by label.
const unique = (labels: string[]) => [...new Set(labels)];
const radios = () => unique(tree!.root.findAll(node => node.props.accessibilityRole === 'radio' && typeof node.props.onPress === 'function').map(node => node.props.accessibilityLabel));
const checked = () => unique(tree!.root.findAll(node => node.props.accessibilityRole === 'radio' && node.props.accessibilityState?.checked).map(node => node.props.accessibilityLabel));
const texts = () => tree!.root.findAllByType(Text).map(node => [node.props.children].flat().join(''));

afterEach(() => ReactTestRenderer.act(() => tree?.unmount()));
beforeEach(() => {
  jest.clearAllMocks();
  resetPlus();
  resetProfileThemes();
  (loadThemePrices as jest.Mock).mockResolvedValue({theme_neon: '₹49'});
});

test('a Plus member changes the badge and theme through onChange', async () => {
  setSubscription(subscription({plan: 'plus', status: 'ACTIVE', expiresAt: '2030-01-01T00:00:00Z'}));
  themes.mockResolvedValue(catalog(true));
  const onChange = jest.fn().mockResolvedValue(undefined);
  await render(onChange);
  await press('Show Plus badge');
  expect(onChange).toHaveBeenCalledWith({showPlusBadge: true});
  await press('Aurora theme');
  expect(onChange).toHaveBeenCalledWith({profileTheme: 'aurora'});
});

test('a free user taps a locked Plus theme and gets the paywall instead of a settings change', async () => {
  setSubscription(subscription());
  themes.mockResolvedValue(catalog(false));
  const onChange = jest.fn();
  await render(onChange);
  await press('Midnight theme');
  expect(onChange).not.toHaveBeenCalled();
  expect(getPlusState().paywall.visible).toBe(true);
  expect(checked()).toEqual(['Classic theme']);
});

test('a retained Plus selection shows default as active once Plus lapsed, and free themes stay selectable', async () => {
  setSubscription(subscription());
  themes.mockResolvedValue(catalog(false));
  const onChange = jest.fn().mockResolvedValue(undefined);
  await render(onChange, 'aurora');
  expect(checked()).toEqual(['Classic theme']);
  await press('Classic theme');
  expect(onChange).toHaveBeenCalledWith({profileTheme: 'default'});
});

test('permanent packs: on sale shows the Play price, packs without a productId (sales off) are hidden', async () => {
  setSubscription(subscription());
  themes.mockResolvedValue([...catalog(false), neonPack(), neonPack({id: 'retro', name: 'Retro', productId: undefined})]);
  await render();
  expect(radios()).toEqual(['Classic theme', 'Aurora theme', 'Midnight theme', 'Buy Neon theme, ₹49']);
  expect(loadThemePrices).toHaveBeenCalledWith(['theme_neon']);
});

test('buying a pack posts through billing, then selects the new theme', async () => {
  setSubscription(subscription());
  themes.mockResolvedValue([...catalog(false), neonPack()]);
  (purchaseTheme as jest.Mock).mockResolvedValue({status: 'owned', themeId: 'neon'});
  const onChange = jest.fn().mockResolvedValue(undefined);
  await render(onChange);
  await press('Buy Neon theme, ₹49');
  expect(purchaseTheme).toHaveBeenCalledWith('theme_neon');
  expect(onChange).toHaveBeenCalledWith({profileTheme: 'neon'});
  expect(texts()).toContain('Neon unlocked.');
});

test('purchase failures show friendly copy: 409, pending, cancelled and disabled', async () => {
  setSubscription(subscription());
  themes.mockResolvedValue([...catalog(false), neonPack()]);
  await render();
  const attempt = async (result: Promise<unknown>) => {
    (purchaseTheme as jest.Mock).mockReturnValueOnce(result);
    await press('Buy Neon theme, ₹49');
  };
  const {toThemeBillingError} = jest.requireActual('../billing');
  await attempt(Promise.reject(toThemeBillingError({status: 409, code: 'CONFLICT', message: 'belongs to another account'})));
  expect(texts()).toContain('This Google Play purchase is already linked to another Hiva account.');
  await attempt(Promise.resolve({status: 'pending'}));
  expect(texts()).toContain('Your payment is pending. The theme unlocks as soon as Google Play confirms it.');
  await attempt(Promise.reject(toThemeBillingError({code: 'user-cancelled'})));
  expect(texts()).toContain('Purchase cancelled.');
  await attempt(Promise.reject(toThemeBillingError({status: 404, message: 'unavailable'})));
  expect(texts()).toContain('Theme packs aren’t available right now.');
});

test('choosing a theme the server rejects: PLUS_REQUIRED opens the paywall, THEME_NOT_OWNED explains', async () => {
  setSubscription(subscription({plan: 'plus', status: 'ACTIVE'}));
  themes.mockResolvedValue(catalog(true));
  const onChange = jest.fn().mockRejectedValueOnce({status: 403, code: 'THEME_NOT_OWNED', message: 'Purchase this permanent profile theme to use it'});
  await render(onChange);
  await press('Aurora theme');
  expect(texts()).toContain('Buy this theme to use it.');
  onChange.mockRejectedValueOnce({status: 403, code: 'PLUS_REQUIRED', message: 'Hiva Plus is required'});
  await press('Midnight theme');
  expect(getPlusState().paywall.visible).toBe(true);
});

test('restoring theme purchases reports success and the empty case', async () => {
  setSubscription(subscription());
  themes.mockResolvedValue([...catalog(false), neonPack()]);
  (restoreThemePurchases as jest.Mock).mockResolvedValueOnce(['neon']);
  await render();
  await press('Restore theme purchases');
  expect(restoreThemePurchases).toHaveBeenCalledWith(['theme_neon']);
  expect(texts()).toContain('Theme purchases restored.');
  const {toThemeBillingError} = jest.requireActual('../billing');
  (restoreThemePurchases as jest.Mock).mockRejectedValueOnce(toThemeBillingError({code: 'pending'}));
  await press('Restore theme purchases');
  expect(texts()).toContain('Your payment is pending. The theme unlocks as soon as Google Play confirms it.');
});

test('without a server catalog the theme group is hidden', async () => {
  setSubscription(subscription());
  themes.mockResolvedValue([]);
  await render();
  expect(radios()).toEqual([]);
});
