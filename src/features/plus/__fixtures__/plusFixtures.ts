import type {Subscription} from '../types';

export const phase = (formattedPrice: string, rupees: number, billingPeriod: string, recurrenceMode = 1, billingCycleCount = 0) => ({
  formattedPrice, priceAmountMicros: String(rupees * 1_000_000), priceCurrencyCode: 'INR', billingPeriod, recurrenceMode, billingCycleCount,
});

/** What Play returns for `hiva_plus`: three base plans plus a ₹49 first-month intro offer on monthly. */
export const playProduct = {
  id: 'hiva_plus',
  type: 'subs',
  platform: 'android',
  subscriptionOffers: [
    {id: 'weekly', basePlanIdAndroid: 'weekly', offerTokenAndroid: 'tok-weekly', pricingPhasesAndroid: {pricingPhaseList: [phase('₹39', 39, 'P1W')]}},
    {id: 'monthly', basePlanIdAndroid: 'monthly', offerTokenAndroid: 'tok-monthly', pricingPhasesAndroid: {pricingPhaseList: [phase('₹99', 99, 'P1M')]}},
    {id: 'intro49', basePlanIdAndroid: 'monthly', offerTokenAndroid: 'tok-monthly-intro', pricingPhasesAndroid: {pricingPhaseList: [phase('₹49', 49, 'P1M', 2, 1), phase('₹99', 99, 'P1M')]}},
    {id: 'yearly', basePlanIdAndroid: 'yearly', offerTokenAndroid: 'tok-yearly', pricingPhasesAndroid: {pricingPhaseList: [phase('₹799', 799, 'P1Y')]}},
  ],
};

export const plans = ['weekly', 'monthly', 'yearly'].map(basePlanId => ({productId: 'hiva_plus', basePlanId}));

export const subscription = (overrides: Partial<Subscription> = {}): Subscription => ({
  enabled: true, plan: 'free', status: null, productId: null, basePlanId: null, expiresAt: null, autoRenewing: false,
  limits: {dmStartsPerDay: 10, vibeNotesPerDay: 2, vibeNoteMaxMinutes: 240, randomMatchesPerDay: 5},
  usage: {dmStartsToday: 10, vibeNotesToday: 0, randomMatchesToday: 0, resetAt: null},
  plans, ...overrides,
});

export const purchase = (overrides: Record<string, unknown> = {}) => ({
  id: 'GPA.1', productId: 'hiva_plus', purchaseToken: 'play-token-1', purchaseState: 'purchased', isAcknowledgedAndroid: false,
  isAutoRenewing: true, quantity: 1, platform: 'android', store: 'google', transactionDate: 0, ...overrides,
});
