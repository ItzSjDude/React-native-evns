import {Platform} from 'react-native';
import * as Iap from 'react-native-iap';
import {loadThemePrices, purchaseTheme, resetBillingForTests, restoreThemePurchases} from '../billing';
import {verifyGooglePlayPurchase} from '../plusService';
import {getProfileThemes, verifyThemePurchase} from '../profileThemeService';
import {getProfileThemesState, resetProfileThemes} from '../profileThemeStore';
import {resetPlus, setSubscription} from '../plusStore';
import {purchase, subscription} from '../__fixtures__/plusFixtures';
import {catalog, neonPack} from '../__fixtures__/themeFixtures';

jest.mock('../plusService', () => ({...jest.requireActual('../plusService'), verifyGooglePlayPurchase: jest.fn(), getSubscription: jest.fn()}));
jest.mock('../profileThemeService', () => ({getProfileThemes: jest.fn(), verifyThemePurchase: jest.fn()}));

const iap = Iap as unknown as typeof Iap & {__emitPurchase: (p: unknown) => void; __emitPurchaseError: (e: unknown) => void; __resetListeners: () => void};
const verifyTheme = verifyThemePurchase as jest.Mock;
const flush = () => new Promise<void>(resolve => setTimeout(resolve, 0));
const themePurchase = (overrides: Record<string, unknown> = {}) => purchase({productId: 'theme_neon', purchaseToken: 'theme-token-1', isAutoRenewing: false, ...overrides});

beforeEach(() => {
  jest.clearAllMocks();
  jest.replaceProperty(Platform, 'OS', 'android');
  iap.__resetListeners();
  resetBillingForTests();
  resetPlus();
  resetProfileThemes();
  setSubscription(subscription());
  (getProfileThemes as jest.Mock).mockResolvedValue([...catalog(false), neonPack({owned: true})]);
});

test('fetches the localized in-app price for the catalog products', async () => {
  (Iap.fetchProducts as jest.Mock).mockResolvedValueOnce([{id: 'theme_neon', displayPrice: '₹49', type: 'in-app'}]);
  await expect(loadThemePrices(['theme_neon'])).resolves.toEqual({theme_neon: '₹49'});
  expect(Iap.fetchProducts).toHaveBeenCalledWith({skus: ['theme_neon'], type: 'in-app'});
});

test('buys a one-time product, posts the token to the theme endpoint (never the subscription one) and refetches the catalog; the app never acknowledges', async () => {
  verifyTheme.mockResolvedValue({themeId: 'neon', owned: true, alreadyOwned: false});
  const pending = purchaseTheme('theme_neon');
  await flush();
  expect(Iap.requestPurchase).toHaveBeenCalledWith({type: 'in-app', request: {google: {skus: ['theme_neon']}}});
  iap.__emitPurchase(themePurchase());
  await expect(pending).resolves.toEqual({status: 'owned', themeId: 'neon'});
  expect(verifyTheme).toHaveBeenCalledWith('theme_neon', 'theme-token-1');
  expect(verifyGooglePlayPurchase).not.toHaveBeenCalled();
  expect(Iap.finishTransaction).not.toHaveBeenCalled();
  expect(getProfileThemes).toHaveBeenCalled();
  expect(getProfileThemesState().themes?.find(theme => theme.id === 'neon')?.owned).toBe(true);
});

test('a pending payment resolves as pending and is not posted', async () => {
  const pending = purchaseTheme('theme_neon');
  await flush();
  iap.__emitPurchase(themePurchase({purchaseState: 'pending'}));
  await expect(pending).resolves.toEqual({status: 'pending'});
  expect(verifyTheme).not.toHaveBeenCalled();
});

test('409 (another account or theme) maps to a friendly message', async () => {
  verifyTheme.mockRejectedValue({status: 409, code: 'CONFLICT', message: 'This Google Play purchase belongs to another account or theme'});
  const pending = purchaseTheme('theme_neon');
  await flush();
  iap.__emitPurchase(themePurchase());
  await expect(pending).rejects.toMatchObject({kind: 'tokenInUse', message: 'This Google Play purchase is already linked to another Hiva account.'});
});

test('backend errors: 404 disabled, 503 not configured, 400 not complete', async () => {
  for (const [status, kind] of [[404, 'disabled'], [503, 'disabled'], [400, 'invalid']] as const) {
    resetBillingForTests();
    verifyTheme.mockRejectedValueOnce({status, message: 'x'});
    const pending = purchaseTheme('theme_neon');
    await flush();
    iap.__emitPurchase(themePurchase({purchaseToken: `t-${status}-long-token`}));
    await expect(pending).rejects.toMatchObject({kind});
  }
});

test('a cancelled purchase sheet and an already-owned item map to friendly kinds', async () => {
  let pending = purchaseTheme('theme_neon');
  await flush();
  iap.__emitPurchaseError({code: 'user-cancelled', message: 'cancelled'});
  await expect(pending).rejects.toMatchObject({kind: 'cancelled'});
  pending = purchaseTheme('theme_neon');
  await flush();
  iap.__emitPurchaseError({code: 'already-owned', message: 'owned'});
  await expect(pending).rejects.toMatchObject({kind: 'alreadyOwned', message: expect.stringContaining('Restore theme purchases')});
});

test('a server answer that is not owned is treated as an invalid purchase', async () => {
  verifyTheme.mockResolvedValue({themeId: 'neon', owned: false, alreadyOwned: true});
  const pending = purchaseTheme('theme_neon');
  await flush();
  iap.__emitPurchase(themePurchase());
  await expect(pending).rejects.toMatchObject({kind: 'invalid'});
});

test('restore re-posts only owned catalog products', async () => {
  (Iap.getAvailablePurchases as jest.Mock).mockResolvedValue([
    themePurchase(), purchase({productId: 'hiva_plus', purchaseToken: 'sub-token'}), themePurchase({purchaseToken: 'unfinished', purchaseState: 'pending'}),
  ]);
  verifyTheme.mockResolvedValue({themeId: 'neon', owned: true, alreadyOwned: true});
  await expect(restoreThemePurchases(['theme_neon'])).resolves.toEqual(['neon']);
  expect(verifyTheme.mock.calls).toEqual([['theme_neon', 'theme-token-1']]);
  expect(verifyGooglePlayPurchase).not.toHaveBeenCalled();
  expect(Iap.finishTransaction).not.toHaveBeenCalled();
});

test('restore reports nothing to restore, and 409', async () => {
  (Iap.getAvailablePurchases as jest.Mock).mockResolvedValue([]);
  await expect(restoreThemePurchases(['theme_neon'])).rejects.toMatchObject({kind: 'notFound', message: 'No theme purchases were found on this Google account.'});
  (Iap.getAvailablePurchases as jest.Mock).mockResolvedValue([themePurchase()]);
  verifyTheme.mockRejectedValue({status: 409, message: 'conflict'});
  await expect(restoreThemePurchases(['theme_neon'])).rejects.toMatchObject({kind: 'tokenInUse'});
});

test('purchase tokens never reach the console', async () => {
  const spies = (['log', 'warn', 'error', 'info'] as const).map(name => jest.spyOn(console, name).mockImplementation(() => {}));
  verifyTheme.mockRejectedValue({status: 409, message: 'conflict'});
  const pending = purchaseTheme('theme_neon');
  await flush();
  iap.__emitPurchase(themePurchase({purchaseToken: 'SECRET-TOKEN-VALUE'}));
  await pending.catch(() => {});
  spies.forEach(spy => expect(JSON.stringify(spy.mock.calls)).not.toContain('SECRET-TOKEN-VALUE'));
  spies.forEach(spy => spy.mockRestore());
});
