import {apiRequest} from '../../../core/api/apiClient';
import {startDirectConversation} from '../directService';
import {getPlusState, resetPlus, setSubscription} from '../../plus/plusStore';
import {subscription} from '../../plus/__fixtures__/plusFixtures';

jest.mock('../../../core/api/apiClient', () => ({apiRequest: jest.fn(), apiRequestPage: jest.fn()}));

const limitError = (plusAvailable = true) => ({
  status: 429, code: 'LIMIT_REACHED', message: 'Daily limit reached',
  details: {limit: 'dmStarts', used: 10, max: 10, plusMax: 40, resetAt: '2026-10-10T00:00:00Z', plusAvailable},
});

beforeEach(() => {
  jest.clearAllMocks();
  resetPlus();
});

test('hitting the new-chat limit opens the paywall with the dmStarts reason and still rejects', async () => {
  setSubscription(subscription());
  (apiRequest as jest.Mock).mockRejectedValue(limitError());
  await expect(startDirectConversation('user-2')).rejects.toMatchObject({code: 'LIMIT_REACHED'});
  expect(getPlusState().paywall).toMatchObject({visible: true, reason: 'dmStarts', details: {max: 10, plusMax: 40}});
});

test('no paywall when Plus is disabled or the server says Plus would not help', async () => {
  setSubscription(subscription({enabled: false}));
  (apiRequest as jest.Mock).mockRejectedValue(limitError());
  await expect(startDirectConversation('user-2')).rejects.toBeDefined();
  expect(getPlusState().paywall.visible).toBe(false);

  setSubscription(subscription());
  (apiRequest as jest.Mock).mockRejectedValue(limitError(false));
  await expect(startDirectConversation('user-2')).rejects.toBeDefined();
  expect(getPlusState().paywall.visible).toBe(false);
});

test('a limit error without plusAvailable does not open the paywall', async () => {
  setSubscription(subscription());
  const error = limitError();
  delete (error.details as {plusAvailable?: boolean}).plusAvailable;
  (apiRequest as jest.Mock).mockRejectedValue(error);
  await expect(startDirectConversation('user-2')).rejects.toBeDefined();
  expect(getPlusState().paywall.visible).toBe(false);
});

test('other errors never open the paywall', async () => {
  setSubscription(subscription());
  (apiRequest as jest.Mock).mockRejectedValue({status: 403, message: 'Private'});
  await expect(startDirectConversation('user-2')).rejects.toMatchObject({status: 403});
  expect(getPlusState().paywall.visible).toBe(false);
});
