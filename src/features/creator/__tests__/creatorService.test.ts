import {apiRequest} from '../../../core/api/apiClient';
import {getMyCreatorOnboarding, submitMyCreatorOnboarding, type CreatorOnboarding} from '../creatorService';

jest.mock('../../../core/api/apiClient', () => ({apiRequest: jest.fn()}));
const request = apiRequest as jest.Mock;

const onboarding = (overrides: Partial<CreatorOnboarding> = {}): CreatorOnboarding => ({
  status: 'PENDING', payoutStatus: 'PENDING', payoutEligible: false, maskedAccount: 'XXXXXX1234', ...overrides,
});

beforeEach(() => { jest.resetAllMocks(); });

test('reads the caller onboarding state with a required-auth GET', async () => {
  request.mockResolvedValue(onboarding());
  await expect(getMyCreatorOnboarding()).resolves.toEqual(onboarding());
  expect(request).toHaveBeenCalledTimes(1);
  expect(request).toHaveBeenCalledWith('/creators/me/onboarding', {auth: 'required'});
});

test('submits the application with a required-auth PUT and a JSON body of exactly the provided fields', async () => {
  const body = {about: 'I make music', categories: ['MUSIC', 'ART'] as const, accountHolder: 'Asha Rao', accountNumber: '123456789012', ifsc: 'HDFC0001234'};
  request.mockResolvedValue(onboarding());
  await submitMyCreatorOnboarding({...body, categories: [...body.categories]});
  const [path, options] = request.mock.calls[0];
  expect(path).toBe('/creators/me/onboarding');
  expect(options).toMatchObject({auth: 'required', method: 'PUT'});
  expect(JSON.parse(options.body)).toEqual(body);
});

test('propagates API errors untouched so the screen can show the server message', async () => {
  const failure = {status: 422, code: 'VALIDATION_ERROR', message: 'IFSC is invalid'};
  request.mockRejectedValue(failure);
  await expect(submitMyCreatorOnboarding({about: 'x', categories: [], accountHolder: 'x', accountNumber: '1', ifsc: 'x'})).rejects.toBe(failure);
  await expect(getMyCreatorOnboarding()).rejects.toBe(failure);
});
