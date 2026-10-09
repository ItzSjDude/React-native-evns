import {apiRequest} from '../../../core/api/apiClient';
import {isLimitReached} from '../limits';
import {buildPlanOptions, introLabel, paywallHeadline, periodsPerYear, yearlySavingsPercent} from '../pricing';
import {normalizeSubscription, verifyGooglePlayPurchase} from '../plusService';
import {phase, plans, playProduct} from '../__fixtures__/plusFixtures';

jest.mock('../../../core/api/apiClient', () => ({apiRequest: jest.fn()}));

test('builds one option per backend base plan and prefers the intro offer Play says the user can get', () => {
  const options = buildPlanOptions([playProduct], plans);
  expect(options.map(option => [option.basePlanId, option.offerToken, option.regular.formattedPrice])).toEqual([
    ['weekly', 'tok-weekly', '₹39'], ['monthly', 'tok-monthly-intro', '₹99'], ['yearly', 'tok-yearly', '₹799'],
  ]);
  expect(options[1].intro).toMatchObject({formattedPrice: '₹49', billingPeriod: 'P1M', cycles: 1});
  expect(introLabel(options[1].intro!)).toBe('₹49 for the first month');
  expect(options[0].intro).toBeNull();
});

test('skips base plans Play did not return and follows the backend plan order', () => {
  const options = buildPlanOptions([playProduct], [{productId: 'hiva_plus', basePlanId: 'yearly'}, {productId: 'hiva_plus', basePlanId: 'lifetime'}]);
  expect(options.map(option => option.basePlanId)).toEqual(['yearly']);
});

test('yearly savings come from the real prices against twelve months', () => {
  const options = buildPlanOptions([playProduct], plans);
  // 1 - 799 / (99 * 12) = 32.7%
  expect(yearlySavingsPercent(options)).toBe(32);
  // No monthly plan: compares against 52 weeks of the weekly price. 1 - 799 / (39 * 52) = 60.6%
  expect(yearlySavingsPercent(options.filter(option => option.basePlanId !== 'monthly'))).toBe(60);
  // No yearly plan or no saving: nothing to claim.
  expect(yearlySavingsPercent(options.filter(option => option.basePlanId !== 'yearly'))).toBeNull();
  const pricey = buildPlanOptions([{id: 'hiva_plus', subscriptionOffers: [
    {basePlanIdAndroid: 'monthly', offerTokenAndroid: 'm', pricingPhasesAndroid: {pricingPhaseList: [phase('₹10', 10, 'P1M')]}},
    {basePlanIdAndroid: 'yearly', offerTokenAndroid: 'y', pricingPhasesAndroid: {pricingPhaseList: [phase('₹200', 200, 'P1Y')]}},
  ]}], plans);
  expect(yearlySavingsPercent(pricey)).toBeNull();
  expect(periodsPerYear('P3M')).toBe(4);
});

test('headlines are tied to the limit that was hit', () => {
  expect(paywallHeadline('dmStarts', {limit: 'dmStarts', used: 10, max: 10, plusMax: 40})).toBe('You’ve used today’s 10 new chats — Plus gives you 40');
  expect(paywallHeadline('vibeNotes', {limit: 'vibeNotes', max: 2, plusMax: 10})).toBe('You’ve posted today’s 2 vibe notes — Plus gives you 10');
  expect(paywallHeadline('vibeNoteLifetime', {limit: 'vibeNoteLifetime', max: 240, plusMax: 1440})).toBe('Free vibe notes last 4 h — Plus keeps them up for 24 h');
  expect(paywallHeadline('randomMatches', {limit: 'randomMatches', max: 5, plusMax: 20})).toBe('You’ve used today’s 5 random matches — Plus gives you 20');
  expect(paywallHeadline()).toBe('Meet more people with Hiva Plus');
});

test('recognises only well-formed LIMIT_REACHED errors', () => {
  expect(isLimitReached({status: 429, code: 'LIMIT_REACHED', message: 'x', details: {limit: 'dmStarts', max: 10}})).toBe(true);
  expect(isLimitReached({status: 429, code: 'RATE_LIMITED', message: 'x'})).toBe(false);
  expect(isLimitReached({status: 400, code: 'LIMIT_REACHED', details: [{message: 'x'}]})).toBe(false);
  expect(isLimitReached(null)).toBe(false);
});

test('normalizes partial payloads and keeps an empty plan list empty', () => {
  const normalized = normalizeSubscription({enabled: true, plan: 'plus'});
  expect(normalized).toMatchObject({enabled: true, plan: 'plus', limits: null, autoRenewing: false, plans: []});
});

test('the purchase POST carries the package name', async () => {
  (apiRequest as jest.Mock).mockResolvedValue({enabled: true, plan: 'plus', plans});
  await verifyGooglePlayPurchase('hiva_plus', 'tok');
  expect(apiRequest).toHaveBeenCalledWith('/me/subscription/google-play', expect.objectContaining({
    method: 'POST', body: JSON.stringify({productId: 'hiva_plus', purchaseToken: 'tok', packageName: 'com.hivachat.app'}),
  }));
});
