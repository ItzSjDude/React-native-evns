import {getPlusState, paywallOnLimit, resetPlus, setSubscription} from '../plusStore';
import {subscription} from '../__fixtures__/plusFixtures';

const limitError = (plusAvailable = true) => ({
  status: 429, code: 'LIMIT_REACHED', message: 'Daily limit reached',
  details: {limit: 'dmStarts', used: 10, max: 10, plusMax: 40, resetAt: '2026-10-10T00:00:00Z', plusAvailable},
});

beforeEach(() => {
  resetPlus();
  setSubscription(subscription());
});

test('hitting the new-chat limit opens the paywall with the dmStarts reason', () => {
  paywallOnLimit(limitError(), '/conversations/direct');
  expect(getPlusState().paywall).toMatchObject({visible: true, reason: 'dmStarts', details: {max: 10, plusMax: 40}});
});

test('no paywall when Plus is disabled or the server says Plus would not help', () => {
  setSubscription(subscription({enabled: false}));
  paywallOnLimit(limitError(), '/conversations/direct');
  expect(getPlusState().paywall.visible).toBe(false);

  setSubscription(subscription());
  paywallOnLimit(limitError(false), '/conversations/direct');
  expect(getPlusState().paywall.visible).toBe(false);
});

test('replies never open the paywall, and other errors are ignored', () => {
  paywallOnLimit(limitError(), '/conversations/c1/messages');
  paywallOnLimit({status: 403, message: 'Private'}, '/conversations/direct');
  expect(getPlusState().paywall.visible).toBe(false);
});
