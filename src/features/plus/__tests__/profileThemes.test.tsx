import React from 'react';
import {Text} from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import {apiRequest} from '../../../core/api/apiClient';
import {getProfileThemes, normalizeProfileThemes, verifyThemePurchase} from '../profileThemeService';
import {resetProfileThemes} from '../profileThemeStore';
import {resetPlus, setSubscription} from '../plusStore';
import {useOwnProfileTheme, useProfileThemes} from '../useProfileThemes';
import {catalog} from '../__fixtures__/themeFixtures';
import {subscription} from '../__fixtures__/plusFixtures';

jest.mock('../../../core/api/apiClient', () => ({apiRequest: jest.fn()}));
const api = apiRequest as jest.Mock;

test('normalizes the catalog and drops malformed rows', () => {
  expect(normalizeProfileThemes([
    {id: 'default', name: 'Classic', access: 'FREE', available: true, owned: true},
    {id: 'Bad Id', name: 'x', access: 'FREE'}, {id: 'nope', name: 'x', access: 'GOLD'}, {id: 'noname', name: ' ', access: 'FREE'}, null,
    {id: 'neon', name: 'Neon', access: 'PURCHASE', available: true, owned: false, productId: 'theme_neon', extra: {css: 'x'}},
  ])).toEqual([
    {id: 'default', name: 'Classic', access: 'FREE', available: true, owned: true},
    {id: 'neon', name: 'Neon', access: 'PURCHASE', available: true, owned: false, productId: 'theme_neon'},
  ]);
  expect(normalizeProfileThemes({not: 'an array'})).toEqual([]);
});

test('an older server without the catalog (404) means an empty catalog; other errors surface', async () => {
  api.mockRejectedValueOnce({status: 404});
  await expect(getProfileThemes()).resolves.toEqual([]);
  api.mockRejectedValueOnce({status: 500});
  await expect(getProfileThemes()).rejects.toMatchObject({status: 500});
});

test('posts the purchase to the server with the package name', async () => {
  api.mockResolvedValueOnce({themeId: 'neon', owned: true, alreadyOwned: false});
  await verifyThemePurchase('theme_neon', 'secret-token-123');
  expect(api).toHaveBeenCalledWith('/me/profile-themes/google-play', expect.objectContaining({
    method: 'POST', body: JSON.stringify({productId: 'theme_neon', purchaseToken: 'secret-token-123', packageName: 'com.hivachat.app'}),
  }));
});

let tree: ReactTestRenderer.ReactTestRenderer | undefined;
const flush = () => ReactTestRenderer.act(async () => {await new Promise<void>(resolve => setTimeout(resolve, 0));});

function Probe({selected}: {selected: string}) {
  const {themes, status} = useProfileThemes();
  const colors = useOwnProfileTheme(selected);
  return <Text>{`${status}|${themes?.length ?? '-'}|${colors?.accent ?? 'default'}`}</Text>;
}
const shown = () => tree!.root.findByType(Text).props.children as string;
const mount = async (selected: string) => {
  await ReactTestRenderer.act(async () => {tree = ReactTestRenderer.create(<Probe selected={selected} />);});
  await flush();
};

beforeEach(() => {
  api.mockReset();
  resetProfileThemes();
  resetPlus();
  setSubscription(subscription());
});
afterEach(() => ReactTestRenderer.act(() => tree?.unmount()));

test('own profile: a Plus theme renders default while not owned, and re-applies when Plus returns (catalog refetched on plan change)', async () => {
  api.mockResolvedValue(catalog(false));
  await mount('aurora');
  expect(shown()).toBe('ready|3|default');
  api.mockResolvedValue(catalog(true));
  await ReactTestRenderer.act(async () => {setSubscription(subscription({plan: 'plus', status: 'ACTIVE'}));});
  await flush();
  expect(shown()).toBe('ready|3|#F472B6');
});

test('own profile: default while the catalog is unavailable (never a theme the account may not own)', async () => {
  api.mockRejectedValue({status: 500});
  await mount('aurora');
  expect(shown()).toBe('error|-|default');
});

test('own profile: a theme the app has no palette for renders default and never crashes', async () => {
  api.mockResolvedValue([...catalog(false), {id: 'neon', name: 'Neon', access: 'PURCHASE', available: true, owned: true, productId: 'theme_neon'}]);
  await mount('neon');
  expect(shown()).toBe('ready|4|default');
});

test('own profile: a purchased theme keeps rendering without Plus', async () => {
  api.mockResolvedValue([catalog(false)[0], {id: 'midnight', name: 'Midnight', access: 'PURCHASE', available: true, owned: true, productId: 'theme_midnight'}]);
  await mount('midnight');
  expect(shown()).toBe('ready|2|#6366F1');
});

test('own profile: a purchased theme stops rendering when purchases are switched off server-side', async () => {
  api.mockResolvedValue([catalog(false)[0], {id: 'midnight', name: 'Midnight', access: 'PURCHASE', available: false, owned: true}]);
  await mount('midnight');
  expect(shown()).toBe('ready|2|default');
});

test('sign-out forgets the previous user catalog', async () => {
  api.mockResolvedValue(catalog(true));
  await mount('aurora');
  expect(shown()).toBe('ready|3|#F472B6');
  await ReactTestRenderer.act(async () => {resetProfileThemes();});
  expect(shown()).toBe('idle|-|default');
});
