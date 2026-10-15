import {
  API_BASE_URL, apiRequest, apiRequestPage, configureApiAuth, getRealtimeAccessToken, onApiError, type ApiAuthHandlers, type ApiError,
} from '../apiClient';

// Unit-level contract tests for the client itself with stubbed auth handlers. The full refresh-rotation flow
// against the real auth service lives in __tests__/apiClient.e2e.test.ts.

const reply = (status: number, body?: unknown, rawText?: string) => ({
  ok: status >= 200 && status < 300,
  status,
  text: async () => rawText ?? (body === undefined ? '' : JSON.stringify(body)),
}) as Response;
const success = (data: unknown, extra: object = {}) => ({success: true, data, ...extra});
const failure = (message: string, extra: object = {}) => ({success: false, error: {message}, ...extra});
const bearer = (init?: RequestInit) => (init?.headers as Headers).get('Authorization');

const fetchMock = jest.fn();
let handlers: jest.Mocked<ApiAuthHandlers>;

beforeEach(() => {
  fetchMock.mockReset();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  handlers = {
    getAccessToken: jest.fn().mockResolvedValue('tok-1'),
    refreshAccessToken: jest.fn().mockResolvedValue('tok-2'),
    onSessionInvalid: jest.fn().mockResolvedValue(undefined),
  };
  configureApiAuth(handlers);
});
afterEach(() => { jest.useRealTimers(); });

describe('request building', () => {
  test('prefixes the base URL and sends no credentials for auth: none (default)', async () => {
    fetchMock.mockResolvedValue(reply(200, success({ok: true})));
    await expect(apiRequest('/health')).resolves.toEqual({ok: true});
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${API_BASE_URL}/health`);
    expect(bearer(init)).toBeNull();
    expect(handlers.getAccessToken).not.toHaveBeenCalled();
  });

  test('sets JSON content-type for string bodies without overriding an explicit one', async () => {
    fetchMock.mockResolvedValue(reply(200, success(null)));
    await apiRequest('/a', {method: 'POST', body: '{"x":1}'});
    await apiRequest('/b', {method: 'POST', body: 'plain', headers: {'Content-Type': 'text/plain'}});
    await apiRequest('/c');
    expect((fetchMock.mock.calls[0][1].headers as Headers).get('Content-Type')).toBe('application/json');
    expect((fetchMock.mock.calls[1][1].headers as Headers).get('Content-Type')).toBe('text/plain');
    expect((fetchMock.mock.calls[2][1].headers as Headers).get('Content-Type')).toBeNull();
  });

  test('does not force a JSON content-type onto a non-string body such as FormData', async () => {
    fetchMock.mockResolvedValue(reply(200, success(null)));
    const form = new FormData();
    await apiRequest('/upload', {method: 'POST', body: form});
    expect((fetchMock.mock.calls[0][1].headers as Headers).get('Content-Type')).toBeNull();
  });

  test('attaches the bearer token when auth is required', async () => {
    fetchMock.mockResolvedValue(reply(200, success('ok')));
    await apiRequest('/me', {auth: 'required'});
    expect(bearer(fetchMock.mock.calls[0][1])).toBe('Bearer tok-1');
  });

  test('required auth with no stored token fails with 401 locally and never calls the network or refresh', async () => {
    handlers.getAccessToken.mockResolvedValue(null);
    await expect(apiRequest('/me', {auth: 'required'})).rejects.toEqual({status: 401, message: 'Please sign in to continue.'});
    expect(fetchMock).not.toHaveBeenCalled();
    expect(handlers.refreshAccessToken).not.toHaveBeenCalled();
  });

  test('optional auth without a token sends the request anonymously and does not try to refresh a 401', async () => {
    handlers.getAccessToken.mockResolvedValue(null);
    fetchMock.mockResolvedValueOnce(reply(401, failure('Unauthorized')));
    await expect(apiRequest('/feed', {auth: 'optional'})).rejects.toMatchObject({status: 401});
    expect(bearer(fetchMock.mock.calls[0][1])).toBeNull();
    expect(handlers.refreshAccessToken).not.toHaveBeenCalled();
    expect(handlers.onSessionInvalid).not.toHaveBeenCalled();
  });

  test('optional auth with a token does refresh on 401', async () => {
    fetchMock.mockResolvedValueOnce(reply(401, failure('expired'))).mockResolvedValueOnce(reply(200, success('fine')));
    await expect(apiRequest('/feed', {auth: 'optional'})).resolves.toBe('fine');
    expect(handlers.refreshAccessToken).toHaveBeenCalledWith('tok-1');
  });

  test('authenticated requests fail loudly if auth handlers were never configured', async () => {
    jest.resetModules();
    const fresh = require('../apiClient') as typeof import('../apiClient');
    await expect(fresh.apiRequest('/me', {auth: 'required'})).rejects.toThrow('API auth handlers are not configured.');
    await expect(fresh.apiRequest('/open', {auth: 'optional'})).rejects.toThrow('API auth handlers are not configured.');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('response handling', () => {
  test('treats 204 as success with no body', async () => {
    fetchMock.mockResolvedValue(reply(204));
    await expect(apiRequest('/x', {method: 'DELETE'})).resolves.toBeUndefined();
  });

  test('treats any 2xx with an empty body as success (undefined)', async () => {
    fetchMock.mockResolvedValue(reply(200, undefined, ''));
    await expect(apiRequest('/x')).resolves.toBeUndefined();
  });

  test('an empty body on an error status is an error, not a success', async () => {
    fetchMock.mockResolvedValue(reply(502));
    await expect(apiRequest('/x')).rejects.toEqual({status: 502, message: 'Server returned a non-JSON response (502).'});
  });

  test.each([
    ['an HTML gateway page', 502, '<html>Bad gateway</html>'],
    ['truncated JSON', 200, '{"success":tr'],
    ['plain text on success status', 200, 'OK'],
  ])('maps %s to a non-JSON ApiError carrying the HTTP status', async (_name, status, text) => {
    fetchMock.mockResolvedValue(reply(status, undefined, text));
    await expect(apiRequest('/x')).rejects.toEqual({status, message: `Server returned a non-JSON response (${status}).`});
  });

  test.each([
    ['null', 'null'], ['an array', '[]'], ['a bare number', '5'], ['an object without success', '{"data":1}'],
    ['a string success flag', '{"success":"true","data":1}'],
  ])('rejects %s as an invalid envelope', async (_name, text) => {
    fetchMock.mockResolvedValue(reply(200, undefined, text));
    await expect(apiRequest('/x')).rejects.toEqual({status: 200, message: 'Server returned an invalid response (200).'});
  });

  test('maps a full error envelope: status, code, message, field details and requestId', async () => {
    const details = [{field: 'ifsc', message: 'Invalid IFSC'}];
    fetchMock.mockResolvedValue(reply(422, {success: false, error: {code: 'VALIDATION_ERROR', message: 'Bad input', details}, requestId: 'req-9'}));
    await expect(apiRequest('/x', {method: 'POST'})).rejects.toEqual({
      status: 422, code: 'VALIDATION_ERROR', message: 'Bad input', details, requestId: 'req-9',
    });
  });

  test('uses a friendly default message when the error envelope has none', async () => {
    fetchMock.mockResolvedValue(reply(500, {success: false}));
    await expect(apiRequest('/x')).rejects.toMatchObject({status: 500, message: 'Something went wrong. Please try again.'});
  });

  test('success:false inside an HTTP 200 is still an error', async () => {
    fetchMock.mockResolvedValue(reply(200, failure('Soft failure')));
    await expect(apiRequest('/x')).rejects.toMatchObject({status: 200, message: 'Soft failure'});
  });

  test('an HTTP error status wins even if the envelope claims success', async () => {
    fetchMock.mockResolvedValue(reply(500, success({huh: true})));
    await expect(apiRequest('/x')).rejects.toMatchObject({status: 500});
  });

  test('apiRequestPage returns data with meta, and errors when meta is absent', async () => {
    const meta = {limit: 10, offset: 0, hasMore: false};
    fetchMock.mockResolvedValueOnce(reply(200, success([1, 2], {meta})));
    await expect(apiRequestPage('/list')).resolves.toEqual({data: [1, 2], meta});
    fetchMock.mockResolvedValueOnce(reply(200, success([1])));
    await expect(apiRequestPage('/list')).rejects.toThrow('Paginated response did not include meta.');
  });

  test('network failures propagate unchanged (not rewritten to an ApiError)', async () => {
    const boom = new TypeError('Network request failed');
    fetchMock.mockRejectedValue(boom);
    await expect(apiRequest('/x')).rejects.toBe(boom);
  });
});

describe('timeouts and cancellation', () => {
  // A fetch that never answers but honours AbortSignal like the real one.
  const hangingFetch = () => fetchMock.mockImplementation((_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
    const abortError = () => Object.assign(new Error('Aborted'), {name: 'AbortError'});
    if (init.signal!.aborted) reject(abortError());
    init.signal!.addEventListener('abort', () => reject(abortError()));
  }));

  test('aborts after 15s by default and reports a 408 ApiError', async () => {
    jest.useFakeTimers();
    hangingFetch();
    const outcome = apiRequest('/slow').catch(error => error);
    await jest.advanceTimersByTimeAsync(14999);
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(false);
    await jest.advanceTimersByTimeAsync(1);
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
    await expect(outcome).resolves.toEqual({status: 408, message: 'Request timed out. Check your connection and try again.'});
  });

  test('honours a custom timeoutMs', async () => {
    jest.useFakeTimers();
    hangingFetch();
    const outcome = apiRequest('/slow', {timeoutMs: 500}).catch(error => error);
    await jest.advanceTimersByTimeAsync(500);
    await expect(outcome).resolves.toMatchObject({status: 408});
  });

  test('clears the timer after a response so nothing fires later', async () => {
    jest.useFakeTimers();
    fetchMock.mockResolvedValue(reply(200, success('done')));
    await expect(apiRequest('/fast')).resolves.toBe('done');
    expect(jest.getTimerCount()).toBe(0);
  });

  test('clears the timer after a failure too', async () => {
    jest.useFakeTimers();
    fetchMock.mockResolvedValue(reply(500, failure('nope')));
    await expect(apiRequest('/fast')).rejects.toMatchObject({status: 500});
    expect(jest.getTimerCount()).toBe(0);
  });

  test('a caller abort cancels the request and surfaces the abort error, not a 408', async () => {
    hangingFetch();
    const controller = new AbortController();
    const outcome = apiRequest('/slow', {signal: controller.signal}).catch(error => error);
    await Promise.resolve();
    controller.abort();
    const error = await outcome as {name?: string; status?: number};
    expect(error).toMatchObject({name: 'AbortError'});
    expect(error.status).toBeUndefined();
  });

  test('an already-aborted caller signal aborts immediately', async () => {
    hangingFetch();
    const controller = new AbortController();
    controller.abort();
    await expect(apiRequest('/slow', {signal: controller.signal})).rejects.toMatchObject({name: 'AbortError'});
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
  });

  test('detaches its abort listener from the caller signal when finished', async () => {
    fetchMock.mockResolvedValue(reply(200, success(1)));
    const controller = new AbortController();
    const remove = jest.spyOn(controller.signal, 'removeEventListener');
    await apiRequest('/x', {signal: controller.signal});
    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
  });

  test('a timeout is reported to error listeners as 408', async () => {
    jest.useFakeTimers();
    hangingFetch();
    const listener = jest.fn();
    const off = onApiError(listener);
    const outcome = apiRequest('/slow', {timeoutMs: 10}).catch(error => error);
    await jest.advanceTimersByTimeAsync(10);
    await outcome;
    off();
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({status: 408}), '/slow');
  });
});

describe('401 refresh and session invalidation', () => {
  test('retries once with the refreshed token and preserves method and body', async () => {
    fetchMock.mockResolvedValueOnce(reply(401, failure('expired'))).mockResolvedValueOnce(reply(201, success({id: 'n1'})));
    const body = JSON.stringify({text: 'hi'});
    await expect(apiRequest('/notes', {auth: 'required', method: 'POST', body})).resolves.toEqual({id: 'n1'});
    expect(handlers.refreshAccessToken).toHaveBeenCalledTimes(1);
    expect(handlers.refreshAccessToken).toHaveBeenCalledWith('tok-1');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(bearer(fetchMock.mock.calls[1][1])).toBe('Bearer tok-2');
    expect(fetchMock.mock.calls[1][1]).toMatchObject({method: 'POST', body});
    expect(handlers.onSessionInvalid).not.toHaveBeenCalled();
  });

  test('only 401 triggers a refresh: 400, 403, 404 and 500 pass straight through', async () => {
    for (const status of [400, 403, 404, 500]) {
      fetchMock.mockResolvedValueOnce(reply(status, failure('x')));
      await expect(apiRequest('/x', {auth: 'required'})).rejects.toMatchObject({status});
    }
    expect(handlers.refreshAccessToken).not.toHaveBeenCalled();
    expect(handlers.onSessionInvalid).not.toHaveBeenCalled();
  });

  test.each([400, 401, 403])('a %s from the refresh call invalidates the session with the failed token and rethrows', async status => {
    const refreshError = {status, message: 'Refresh rejected'};
    handlers.refreshAccessToken.mockRejectedValue(refreshError);
    fetchMock.mockResolvedValue(reply(401, failure('expired')));
    await expect(apiRequest('/me', {auth: 'required'})).rejects.toBe(refreshError);
    expect(handlers.onSessionInvalid).toHaveBeenCalledTimes(1);
    expect(handlers.onSessionInvalid).toHaveBeenCalledWith('tok-1');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test.each([
    ['a network failure', new TypeError('Network request failed')],
    ['a 500', {status: 500, message: 'Server down'}],
    ['a 503', {status: 503, message: 'Unavailable'}],
    ['a 429', {status: 429, message: 'Slow down'}],
    ['a 408 timeout', {status: 408, message: 'Timed out'}],
  ])('%s during refresh keeps the session (no onSessionInvalid) and rethrows', async (_name, refreshError) => {
    handlers.refreshAccessToken.mockRejectedValue(refreshError);
    fetchMock.mockResolvedValue(reply(401, failure('expired')));
    await expect(apiRequest('/me', {auth: 'required'})).rejects.toBe(refreshError);
    expect(handlers.onSessionInvalid).not.toHaveBeenCalled();
  });

  test('a second 401 after a successful refresh invalidates with the NEW token and does not loop', async () => {
    fetchMock.mockResolvedValue(reply(401, failure('still no')));
    await expect(apiRequest('/me', {auth: 'required'})).rejects.toMatchObject({status: 401});
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(handlers.refreshAccessToken).toHaveBeenCalledTimes(1);
    expect(handlers.onSessionInvalid).toHaveBeenCalledWith('tok-2');
  });

  test('a non-401 failure on the retry does not invalidate the session', async () => {
    fetchMock.mockResolvedValueOnce(reply(401, failure('expired'))).mockResolvedValueOnce(reply(403, failure('Forbidden')));
    await expect(apiRequest('/me', {auth: 'required'})).rejects.toMatchObject({status: 403});
    expect(handlers.onSessionInvalid).not.toHaveBeenCalled();
  });

  test('a network failure on the retry does not invalidate the session', async () => {
    const boom = new TypeError('Network request failed');
    fetchMock.mockResolvedValueOnce(reply(401, failure('expired'))).mockRejectedValueOnce(boom);
    await expect(apiRequest('/me', {auth: 'required'})).rejects.toBe(boom);
    expect(handlers.onSessionInvalid).not.toHaveBeenCalled();
  });

  test('a network error on the first attempt is not treated as an expired token', async () => {
    fetchMock.mockRejectedValue(new TypeError('Network request failed'));
    await expect(apiRequest('/me', {auth: 'required'})).rejects.toThrow('Network request failed');
    expect(handlers.refreshAccessToken).not.toHaveBeenCalled();
  });

  test('concurrent expired requests each hand the handler the token that failed, so it can coalesce them', async () => {
    let release!: (token: string) => void;
    const gate = new Promise<string>(resolve => { release = resolve; });
    handlers.refreshAccessToken.mockReturnValue(gate);
    fetchMock.mockImplementation(async (_url: string, init: RequestInit) =>
      bearer(init) === 'Bearer tok-1' ? reply(401, failure('expired')) : reply(200, success('fresh')));
    const both = Promise.all([apiRequest('/a', {auth: 'required'}), apiRequest('/b', {auth: 'required'})]);
    await new Promise<void>(resolve => setImmediate(resolve));
    release('tok-2');
    await expect(both).resolves.toEqual(['fresh', 'fresh']);
    expect(handlers.refreshAccessToken.mock.calls).toEqual([['tok-1'], ['tok-1']]);
  });

  test('a timeout while retrying still reports 408 and keeps the session', async () => {
    jest.useFakeTimers();
    fetchMock.mockResolvedValueOnce(reply(401, failure('expired')));
    fetchMock.mockImplementationOnce((_url: string, init: RequestInit) => new Promise((_r, reject) => {
      init.signal!.addEventListener('abort', () => reject(new Error('Aborted')));
    }));
    const outcome = apiRequest('/me', {auth: 'required', timeoutMs: 100}).catch(error => error);
    await jest.advanceTimersByTimeAsync(100);
    await expect(outcome).resolves.toMatchObject({status: 408});
    expect(handlers.onSessionInvalid).not.toHaveBeenCalled();
  });
});

describe('error listeners', () => {
  test('are told about ApiErrors with the request path, and not about successes', async () => {
    const listener = jest.fn();
    const off = onApiError(listener);
    fetchMock.mockResolvedValueOnce(reply(200, success(1)));
    await apiRequest('/ok');
    expect(listener).not.toHaveBeenCalled();
    fetchMock.mockResolvedValueOnce(reply(403, failure('Plus required', {})));
    await expect(apiRequest('/gated')).rejects.toBeDefined();
    off();
    expect(listener).toHaveBeenCalledTimes(1);
    const [error, path] = listener.mock.calls[0] as [ApiError, string];
    expect(path).toBe('/gated');
    expect(error).toMatchObject({status: 403, message: 'Plus required'});
  });

  test('are not told about non-ApiError failures such as network errors', async () => {
    const listener = jest.fn();
    const off = onApiError(listener);
    fetchMock.mockRejectedValue(new TypeError('Network request failed'));
    await expect(apiRequest('/x')).rejects.toBeInstanceOf(TypeError);
    off();
    expect(listener).not.toHaveBeenCalled();
  });

  test('unsubscribing stops notifications', async () => {
    const listener = jest.fn();
    onApiError(listener)();
    fetchMock.mockResolvedValue(reply(500, failure('x')));
    await expect(apiRequest('/x')).rejects.toBeDefined();
    expect(listener).not.toHaveBeenCalled();
  });

  test('a throwing listener neither changes the outcome nor blocks other listeners', async () => {
    const bad = jest.fn(() => { throw new Error('listener bug'); });
    const good = jest.fn();
    const offBad = onApiError(bad);
    const offGood = onApiError(good);
    fetchMock.mockResolvedValue(reply(500, failure('server says no')));
    await expect(apiRequest('/x')).rejects.toMatchObject({status: 500, message: 'server says no'});
    offBad(); offGood();
    expect(bad).toHaveBeenCalledTimes(1);
    expect(good).toHaveBeenCalledTimes(1);
  });

  test('a failed local sign-in check (no token) is reported to listeners as 401', async () => {
    handlers.getAccessToken.mockResolvedValue(null);
    const listener = jest.fn();
    const off = onApiError(listener);
    await expect(apiRequest('/me', {auth: 'required'})).rejects.toBeDefined();
    off();
    expect(listener).toHaveBeenCalledWith({status: 401, message: 'Please sign in to continue.'}, '/me');
  });
});

describe('getRealtimeAccessToken', () => {
  test('pings /auth/me (so an expired token is refreshed) and then returns the current token', async () => {
    handlers.getAccessToken.mockResolvedValueOnce('tok-1').mockResolvedValueOnce('tok-2');
    fetchMock.mockResolvedValueOnce(reply(401, failure('expired'))).mockResolvedValueOnce(reply(200, success({id: 'u'})));
    await expect(getRealtimeAccessToken()).resolves.toBe('tok-2');
    expect(fetchMock.mock.calls.map(call => call[0])).toEqual([`${API_BASE_URL}/auth/me`, `${API_BASE_URL}/auth/me`]);
  });

  test('rejects when the session cannot be validated, so a socket is never opened with a dead token', async () => {
    fetchMock.mockResolvedValue(reply(500, failure('down')));
    await expect(getRealtimeAccessToken()).rejects.toMatchObject({status: 500});
  });
});
