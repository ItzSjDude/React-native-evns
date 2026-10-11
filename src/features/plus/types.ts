/** Which daily/lifetime allowance a 429 `LIMIT_REACHED` refers to. */
export type LimitReason = 'dmStarts' | 'vibeNotes' | 'vibeNoteLifetime' | 'randomMatches';

/** Why the paywall opened: a limit that was hit, or a Plus-only feature (`filters`) that was tapped. */
export type PaywallReason = LimitReason | 'filters' | 'inbox';

/** Advanced discovery filters of `GET /nearby` and `GET /users/search` (Plus only; a free user gets 403 `PLUS_REQUIRED`). */
export type DiscoveryLanguage = 'en' | 'hi' | 'hinglish';
export type DiscoveryFilters = {city?: string; interest?: string; language?: DiscoveryLanguage; activeNow?: boolean};

export type PlusPlanKind = 'free' | 'plus';

/** Allowlisted by the backend (`settings.schema.js#profileTheme`). */
export type ProfileThemeId = 'default' | 'aurora' | 'midnight';

/** The Plus-only fields of `GET/PATCH /me/settings` the Plus screen edits. */
export type PlusPreferences = {showPlusBadge: boolean; profileTheme: ProfileThemeId};

export const SUBSCRIPTION_STATUSES = ['ACTIVE', 'GRACE_PERIOD', 'ON_HOLD', 'PAUSED', 'CANCELED', 'EXPIRED', 'REVOKED'] as const;
export type SubscriptionStatus = typeof SUBSCRIPTION_STATUSES[number];

/** One Play subscription base plan the backend is willing to sell. */
export type SubscriptionPlanRef = {productId: string; basePlanId: string};

export type SubscriptionLimits = {
  dmStartsPerDay: number;
  vibeNotesPerDay: number;
  vibeNoteMaxMinutes: number;
  randomMatchesPerDay: number;
};

export type SubscriptionUsage = {
  dmStartsToday: number;
  vibeNotesToday: number;
  randomMatchesToday: number;
  resetAt: string | null;
};

/** `GET /me/subscription` and `POST /me/subscription/google-play`. */
export type Subscription = {
  enabled: boolean;
  plan: PlusPlanKind;
  status: SubscriptionStatus | null;
  productId: string | null;
  basePlanId: string | null;
  expiresAt: string | null;
  autoRenewing: boolean;
  limits: SubscriptionLimits | null;
  usage: SubscriptionUsage | null;
  plans: SubscriptionPlanRef[];
};

/** `error.details` of a 429 `LIMIT_REACHED`. */
export type LimitReachedDetails = {
  limit: LimitReason;
  used?: number;
  max?: number;
  plusMax?: number;
  resetAt?: string | null;
  plusAvailable?: boolean;
};

/** The ApiError shape the shared client throws for a 429 `LIMIT_REACHED`. */
export type LimitReachedError = {
  status: 429;
  code: 'LIMIT_REACHED';
  message: string;
  details: LimitReachedDetails;
};

/** A Play pricing phase reduced to what the UI shows. Prices always come from Play, never from code. */
export type PlanPhase = {
  formattedPrice: string;
  priceMicros: number;
  currency: string;
  /** ISO 8601 period, e.g. P1W, P1M, P1Y. */
  billingPeriod: string;
  /** How many billing periods the phase lasts (intro offers). */
  cycles: number;
};

/** A purchasable base plan with the offer token chosen for this user. */
export type PlanOption = {
  productId: string;
  basePlanId: string;
  offerToken: string;
  /** Renewing price after any intro phase. */
  regular: PlanPhase;
  /** Free trial or discounted first period(s) when Play says this user is eligible. */
  intro: PlanPhase | null;
  /** False for a prepaid base plan, which is paid once and never renews. */
  autoRenews: boolean;
};

export type PaywallState = {visible: boolean; reason?: PaywallReason; details?: LimitReachedDetails};

export type BillingErrorKind =
  | 'cancelled' | 'unavailable' | 'alreadyOwned' | 'pending' | 'network'
  | 'tokenInUse' | 'disabled' | 'invalid' | 'verifyFailed' | 'notFound' | 'unknown';

export type BillingError = {kind: BillingErrorKind; message: string};

export type PurchaseOutcome =
  | {status: 'active'; subscription: Subscription}
  | {status: 'pending'};
