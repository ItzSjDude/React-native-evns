import {Platform} from 'react-native';
import * as Iap from 'react-native-iap';
import {connectBilling, purchasePlan, resetBillingForTests, restorePurchases, syncAvailablePurchases} from '../billing';
import {buildPlanOptions} from '../pricing';
import {verifyGooglePlayPurchase} from '../plusService';
import {getPlusState, resetPlus, setSubscription} from '../plusStore';
import {plans, playProduct, purchase, subscription} from '../__fixtures__/plusFixtures';

jest.mock('../plusService', () => ({
  ...jest.requireActual('../plusService'),
  verifyGooglePlayPurchase: jest.fn(),
  getSubscription: jest.fn(),
}));

const iap = Iap as unknown as typeof Iap & {__emitPurchase: (p: unknown) => void; __emitPurchaseError: (e: unknown) => void; __resetListeners: () => void};
const verify = verifyGooglePlayPurchase as jest.Mock;
const monthly = () => buildPlanOptions([playProduct], plans).find(option => option.basePlanId === 'monthly')!;
const flush = () => new Promise<void>(resolve => setTimeout(resolve, 0));

beforeEach(() => {
  jest.clearAllMocks();
  jest.replaceProperty(Platform, 'OS', 'android');
  iap.__resetListeners();
  resetBillingForTests();
  resetPlus();
  setSubscription(subscription());
});

test('buys the chosen base plan offer and posts the token; the app never acknowledges (the server does)', async () => {
  verify.mockResolvedValue(subscription({plan: 'plus', status: 'active', basePlanId: 'monthly'}));
  const pending = purchasePlan(monthly());
  await flush();
  expect(Iap.requestPurchase).toHaveBeenCalledWith({
    type: 'subs',
    request: {google: {skus: ['hiva_plus'], subscriptionOffers: [{sku: 'hiva_plus', offerToken: 'tok-monthly-intro'}]}},
  });
  iap.__emitPurchase(purchase());
  await expect(pending).resolves.toMatchObject({status: 'active', subscription: {plan: 'plus'}});
  expect(verify).toHaveBeenCalledWith('hiva_plus', 'play-token-1');
  expect(Iap.finishTransaction).not.toHaveBeenCalled();
  expect(getPlusState().subscription?.plan).toBe('plus');
});

test('a pending payment resolves as pending and is not posted', async () => {
  const pending = purchasePlan(monthly());
  await flush();
  iap.__emitPurchase(purchase({purchaseState: 'pending'}));
  await expect(pending).resolves.toEqual({status: 'pending'});
  expect(verify).not.toHaveBeenCalled();
  expect(Iap.finishTransaction).not.toHaveBeenCalled();
});

test('TOKEN_IN_USE is reported', async () => {
  verify.mockRejectedValue({status: 409, code: 'TOKEN_IN_USE', message: 'Token in use'});
  const pending = purchasePlan(monthly());
  await flush();
  iap.__emitPurchase(purchase());
  await expect(pending).rejects.toMatchObject({kind: 'tokenInUse', message: expect.stringContaining('another Hiva account')});
});

test('backend purchase errors map to clear messages', async () => {
  for (const [code, status, kind] of [['PLUS_DISABLED', 404, 'disabled'], ['PLAY_NOT_CONFIGURED', 503, 'disabled'], ['INVALID_PURCHASE', 400, 'invalid'], ['PACKAGE_MISMATCH', 400, 'invalid'], ['UPSTREAM_ERROR', 502, 'verifyFailed']] as const) {
    resetBillingForTests();
    verify.mockRejectedValueOnce({status, code, message: code});
    const pending = purchasePlan(monthly());
    await flush();
    iap.__emitPurchase(purchase({purchaseToken: `t-${code}`}));
    await expect(pending).rejects.toMatchObject({kind});
  }
});

test('a cancelled purchase sheet maps to cancelled', async () => {
  const pending = purchasePlan(monthly());
  await flush();
  iap.__emitPurchaseError({code: 'user-cancelled', message: 'cancelled'});
  await expect(pending).rejects.toMatchObject({kind: 'cancelled'});
});

test('restore posts every owned Hiva subscription', async () => {
  (Iap.getAvailablePurchases as jest.Mock).mockResolvedValue([
    purchase({purchaseToken: 'old-token', isAcknowledgedAndroid: true}),
    purchase({productId: 'someone_elses_sku', purchaseToken: 'other'}),
    purchase({purchaseToken: 'new-token'}),
  ]);
  verify.mockResolvedValue(subscription({plan: 'plus', status: 'active'}));
  await expect(restorePurchases(['hiva_plus'])).resolves.toMatchObject({plan: 'plus'});
  expect(verify.mock.calls).toEqual([['hiva_plus', 'old-token'], ['hiva_plus', 'new-token']]);
  expect(Iap.finishTransaction).not.toHaveBeenCalled();
});

test('restore reports nothing to restore, and TOKEN_IN_USE when another account owns it', async () => {
  (Iap.getAvailablePurchases as jest.Mock).mockResolvedValue([]);
  await expect(restorePurchases(['hiva_plus'])).rejects.toMatchObject({kind: 'notFound'});
  (Iap.getAvailablePurchases as jest.Mock).mockResolvedValue([purchase()]);
  verify.mockRejectedValue({status: 409, code: 'TOKEN_IN_USE', message: 'Token in use'});
  await expect(restorePurchases(['hiva_plus'])).rejects.toMatchObject({kind: 'tokenInUse'});
});

test('no Play Billing on the device means unavailable', async () => {
  (Iap.initConnection as jest.Mock).mockRejectedValueOnce({code: 'billing-unavailable', message: 'no billing'});
  await expect(connectBilling()).resolves.toBe(false);
  (Iap.initConnection as jest.Mock).mockRejectedValueOnce({code: 'billing-unavailable', message: 'no billing'});
  await expect(purchasePlan(monthly())).rejects.toMatchObject({kind: 'unavailable', message: 'Purchases aren’t available on this device'});
});

test('launch sync posts every Hiva purchase Play returns, acknowledged or not', async () => {
  (Iap.getAvailablePurchases as jest.Mock).mockResolvedValue([purchase({isAcknowledgedAndroid: true, purchaseToken: 'acked'}), purchase({purchaseToken: 'stuck'}), purchase({productId: 'other', purchaseToken: 'x'})]);
  verify.mockResolvedValue(subscription({plan: 'plus'}));
  await syncAvailablePurchases(['hiva_plus']);
  expect(verify.mock.calls).toEqual([['hiva_plus', 'acked'], ['hiva_plus', 'stuck']]);
});
