import type {LimitReachedDetails, LimitReason, PlanOption, PlanPhase, SubscriptionPlanRef} from './types';

/** Structural subset of react-native-iap's ProductSubscriptionAndroid, so this file stays pure and testable. */
type PricingPhaseLike = {billingCycleCount: number; billingPeriod: string; formattedPrice: string; priceAmountMicros: string; priceCurrencyCode: string; recurrenceMode: number};
type OfferLike = {basePlanIdAndroid?: string | null; offerTokenAndroid?: string | null; pricingPhasesAndroid?: {pricingPhaseList: PricingPhaseLike[]} | null};
export type SubscriptionProductLike = {id: string; subscriptionOffers?: OfferLike[] | null};

/** Play Billing `ProductDetails.RecurrenceMode.INFINITE_RECURRING`. */
const INFINITE_RECURRING = 1;

const toPhase = (phase: PricingPhaseLike): PlanPhase => ({
  formattedPrice: phase.formattedPrice,
  priceMicros: Number(phase.priceAmountMicros) || 0,
  currency: phase.priceCurrencyCode,
  billingPeriod: phase.billingPeriod,
  cycles: phase.billingCycleCount || 1,
});

/** Splits an offer's phases into the renewing price and an optional intro/trial in front of it. */
function phasesOf(offer: OfferLike): {regular: PlanPhase; intro: PlanPhase | null} | null {
  const list = offer.pricingPhasesAndroid?.pricingPhaseList ?? [];
  if (!list.length) return null;
  const found = list.findIndex(phase => phase.recurrenceMode === INFINITE_RECURRING);
  const regularIndex = found >= 0 ? found : list.length - 1;
  const regular = toPhase(list[regularIndex]);
  const first = list[0];
  const intro = regularIndex > 0 && Number(first.priceAmountMicros) < regular.priceMicros ? toPhase(first) : null;
  return {regular, intro};
}

/**
 * One option per backend base plan, in the backend's order. Play only returns offers this user is eligible
 * for, so an offer with an intro phase wins over the bare base plan when both are present.
 */
export function buildPlanOptions(products: SubscriptionProductLike[], plans: SubscriptionPlanRef[]): PlanOption[] {
  const options: PlanOption[] = [];
  for (const plan of plans) {
    const product = products.find(item => item.id === plan.productId);
    const offers = (product?.subscriptionOffers ?? []).filter(offer => offer.basePlanIdAndroid === plan.basePlanId && !!offer.offerTokenAndroid);
    let best: PlanOption | null = null;
    for (const offer of offers) {
      const phases = phasesOf(offer);
      if (!phases) continue;
      const candidate: PlanOption = {productId: plan.productId, basePlanId: plan.basePlanId, offerToken: offer.offerTokenAndroid!, ...phases};
      if (!best || (candidate.intro && !best.intro) || (candidate.intro && best.intro && candidate.intro.priceMicros < best.intro.priceMicros)) best = candidate;
    }
    if (best) options.push(best);
  }
  return options;
}

/** Billing periods per year for an ISO 8601 period such as P1W, P1M, P3M, P1Y. */
export function periodsPerYear(period: string): number | null {
  const match = /^P(\d+)([DWMY])$/.exec(period);
  if (!match) return null;
  const count = Number(match[1]);
  if (!count) return null;
  const perUnit = {D: 365, W: 52, M: 12, Y: 1}[match[2] as 'D' | 'W' | 'M' | 'Y'];
  return perUnit / count;
}

/**
 * Whole-percent saving of the yearly plan against paying monthly (or weekly when there is no monthly plan)
 * for a year, from Play's real prices. `null` when there is nothing honest to show.
 */
export function yearlySavingsPercent(options: PlanOption[]): number | null {
  const yearly = options.find(option => periodsPerYear(option.regular.billingPeriod) === 1);
  if (!yearly) return null;
  const shorter = options.filter(option => option !== yearly && option.regular.currency === yearly.regular.currency && (periodsPerYear(option.regular.billingPeriod) ?? 0) > 1);
  const baseline = shorter.find(option => periodsPerYear(option.regular.billingPeriod) === 12) ?? shorter[0];
  if (!baseline) return null;
  const annualBaseline = baseline.regular.priceMicros * (periodsPerYear(baseline.regular.billingPeriod) ?? 0);
  if (annualBaseline <= 0) return null;
  const percent = Math.floor((1 - yearly.regular.priceMicros / annualBaseline) * 100);
  return percent >= 1 ? percent : null;
}

const UNIT_LABELS: Record<string, [string, string]> = {D: ['day', 'days'], W: ['week', 'weeks'], M: ['month', 'months'], Y: ['year', 'years']};

/** "week", "month", "3 months", "year". */
export function periodLabel(period: string): string {
  const match = /^P(\d+)([DWMY])$/.exec(period);
  if (!match) return period;
  const count = Number(match[1]);
  const [one, many] = UNIT_LABELS[match[2]];
  return count === 1 ? one : `${count} ${many}`;
}

/** "₹49 for the first month", "Free for 1 week", "₹49/month for 3 months". */
export function introLabel(intro: PlanPhase): string {
  const span = intro.cycles > 1 ? `${intro.cycles} ${UNIT_LABELS[intro.billingPeriod.slice(-1)]?.[1] ?? periodLabel(intro.billingPeriod)}` : null;
  if (intro.priceMicros === 0) return `Free for ${span ?? `1 ${periodLabel(intro.billingPeriod)}`}`;
  return span ? `${intro.formattedPrice}/${periodLabel(intro.billingPeriod)} for ${span}` : `${intro.formattedPrice} for the first ${periodLabel(intro.billingPeriod)}`;
}

export const PLAN_TITLES: Record<string, string> = {weekly: 'Weekly', monthly: 'Monthly', yearly: 'Yearly'};
export const planTitle = (basePlanId: string | null | undefined) =>
  basePlanId ? PLAN_TITLES[basePlanId] ?? basePlanId.charAt(0).toUpperCase() + basePlanId.slice(1) : 'Plus';

/** Plus allowances quoted when a limit error doesn't carry `plusMax`. Keep in sync with the backend's Plus tier. */
const PLUS_DEFAULTS: Record<LimitReason, number> = {dmStarts: 40, vibeNotes: 10, vibeNoteLifetime: 24 * 60, randomMatches: 0};

const hours = (minutes: number) => {
  const value = minutes / 60;
  return `${Number.isInteger(value) ? value : value.toFixed(1)} h`;
};

/** Headline tied to why the paywall opened. */
export function paywallHeadline(reason?: LimitReason, details?: LimitReachedDetails): string {
  const max = details?.max;
  const plusMax = details?.plusMax ?? (reason ? PLUS_DEFAULTS[reason] : undefined);
  switch (reason) {
    case 'dmStarts':
      return `You’ve used today’s ${max ?? 'free'} new chats — Plus gives you ${plusMax}`;
    case 'vibeNotes':
      return `You’ve posted today’s ${max ?? 'free'} vibe notes — Plus gives you ${plusMax}`;
    case 'vibeNoteLifetime':
      return max ? `Free vibe notes last ${hours(max)} — Plus keeps them up for ${hours(plusMax ?? PLUS_DEFAULTS.vibeNoteLifetime)}` : `Keep vibe notes up for ${hours(plusMax ?? PLUS_DEFAULTS.vibeNoteLifetime)} with Plus`;
    case 'randomMatches':
      return plusMax ? `You’ve used today’s ${max ?? 'free'} random matches — Plus gives you ${plusMax}` : `You’ve used today’s ${max ?? 'free'} random matches — Plus gives you more`;
    default:
      return 'Meet more people with Hiva Plus';
  }
}
