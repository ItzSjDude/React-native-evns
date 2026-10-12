import * as Keychain from 'react-native-keychain';
import {apiRequest, apiRequestPage, configureApiAuth} from '../src/core/api/apiClient';
import {refreshOnce, restoreBackendSession} from '../src/features/auth/authService';
import {clearSession, loadSession, saveSession} from '../src/features/auth/session';
import type {AuthSession} from '../src/features/auth/types';

const initialSession: AuthSession = {
  user: {id: 'user-1', email: 'user@example.com', email_verified: true},
  accessToken: 'old-access',
  refreshToken: 'old-refresh',
  expiresIn: '15m',
};

const reply = (status: number, data?: unknown) => ({
  ok: status >= 200 && status < 300,
  status,
  text: async () => data === undefined ? '' : JSON.stringify(data),
}) as Response;
const success = (data: unknown) => ({success: true, data});
const failure = (message: string) => ({success: false, error: {message}});

describe('authenticated API request flow', () => {
  let storedPassword: string | null;
  let invalidations: number;

  beforeEach(async () => {
    jest.clearAllMocks();
    storedPassword = null;
    invalidations = 0;
    (Keychain.setGenericPassword as jest.Mock).mockImplementation(async (_user, password) => {
      storedPassword = password;
      return true;
    });
    (Keychain.getGenericPassword as jest.Mock).mockImplementation(async () =>
      storedPassword ? {username: 'backend-session', password: storedPassword} : false,
    );
    (Keychain.resetGenericPassword as jest.Mock).mockImplementation(async () => {
      storedPassword = null;
      return true;
    });
    await clearSession();
    await saveSession(initialSession);
    configureApiAuth({
      getAccessToken: async () => (await loadSession())?.accessToken ?? null,
      refreshAccessToken: async failedToken => {
        const current = await loadSession();
        if (!current) throw {status: 401, message: 'Session expired.'};
        if (current.accessToken !== failedToken) return current.accessToken;
        return (await refreshOnce(current)).accessToken;
      },
      onSessionInvalid: async () => {
        invalidations++;
        await clearSession();
      },
    });
  });

  it('refreshes an expired token, stores the rotated token, and retries a reaction once', async () => {
    const calls: Array<{path: string; token: string | null}> = [];
    globalThis.fetch = jest.fn(async (url, init) => {
      const path = String(url).replace('https://api-ede.itzsjdude.in', '');
      const token = (init?.headers as Headers)?.get('Authorization') ?? null;
      calls.push({path, token});
      if (path === '/auth/refresh') {
        return reply(200, success({accessToken: 'new-access', refreshToken: 'new-refresh', expiresIn: '15m'}));
      }
      return token === 'Bearer old-access'
        ? reply(401, failure('Token expired'))
        : reply(201, success({id: 'reaction-1'}));
    }) as typeof fetch;

    const result = await apiRequest<{id: string}>(
      '/conversations/c-1/messages/m-1/reactions',
      {auth: 'required', method: 'POST', body: JSON.stringify({emoji: '❤️'})},
    );

    expect(result).toEqual({id: 'reaction-1'});
    expect(calls).toEqual([
      {path: '/conversations/c-1/messages/m-1/reactions', token: 'Bearer old-access'},
      {path: '/auth/refresh', token: null},
      {path: '/conversations/c-1/messages/m-1/reactions', token: 'Bearer new-access'},
    ]);
    expect(await loadSession()).toMatchObject({accessToken: 'new-access', refreshToken: 'new-refresh'});
    expect(invalidations).toBe(0);
  });

  it('uses one refresh for concurrent expired requests', async () => {
    let refreshCalls = 0;
    globalThis.fetch = jest.fn(async (url, init) => {
      const path = String(url).replace('https://api-ede.itzsjdude.in', '');
      if (path === '/auth/refresh') {
        refreshCalls++;
        return reply(200, success({accessToken: 'new-access', refreshToken: 'new-refresh'}));
      }
      const token = (init?.headers as Headers)?.get('Authorization');
      return token === 'Bearer old-access'
        ? reply(401, failure('Token expired'))
        : reply(200, success({path}));
    }) as typeof fetch;

    const paths = ['/auth/me', '/conversations/c-1/messages'];
    const results = await Promise.all(paths.map(path => apiRequest<{path: string}>(path, {auth: 'required'})));

    expect(results.map(result => result.path)).toEqual(paths);
    expect(refreshCalls).toBe(1);
  });

  it('restores a startup session with the rotated token pair', async () => {
    globalThis.fetch = jest.fn(async (url, init) => {
      if (String(url).endsWith('/auth/refresh')) {
        return reply(200, success({accessToken: 'new-access', refreshToken: 'new-refresh'}));
      }
      const token = (init?.headers as Headers)?.get('Authorization');
      return token === 'Bearer old-access'
        ? reply(401, failure('Token expired'))
        : reply(200, success({user: {...initialSession.user, name: 'Fresh name'}}));
    }) as typeof fetch;

    await expect(restoreBackendSession()).resolves.toMatchObject({
      accessToken: 'new-access', refreshToken: 'new-refresh',
      user: {name: 'Fresh name'},
    });
  });

  it('accepts an empty 204 response when removing a reaction', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue(reply(204)) as typeof fetch;
    await expect(apiRequest<void>(
      '/conversations/c-1/messages/m-1/reactions/%E2%9D%A4%EF%B8%8F',
      {auth: 'required', method: 'DELETE'},
    )).resolves.toBeUndefined();
  });

  it('keeps server pagination metadata for profile lists', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue(reply(200, {
      success: true,
      data: [{id: 'post-1'}],
      meta: {limit: 20, offset: 0, hasMore: true},
    })) as typeof fetch;

    await expect(apiRequestPage<Array<{id: string}>>(
      '/users/user-1/posts?limit=20&offset=0', {auth: 'required'},
    )).resolves.toEqual({
      data: [{id: 'post-1'}],
      meta: {limit: 20, offset: 0, hasMore: true},
    });
  });

  it('clears the session when refresh credentials are rejected', async () => {
    globalThis.fetch = jest.fn(async (url) => String(url).endsWith('/auth/refresh')
      ? reply(401, failure('Refresh token expired'))
      : reply(401, failure('Access token expired')),
    ) as typeof fetch;

    await expect(apiRequest('/auth/me', {auth: 'required'})).rejects.toMatchObject({status: 401});
    expect(await loadSession()).toBeNull();
    expect(invalidations).toBe(1);
  });

  it('preserves the session when refresh fails because the network is unavailable', async () => {
    globalThis.fetch = jest.fn(async (url) => {
      if (String(url).endsWith('/auth/refresh')) throw new Error('Network unavailable');
      return reply(401, failure('Access token expired'));
    }) as typeof fetch;

    await expect(apiRequest('/auth/me', {auth: 'required'})).rejects.toThrow('Network unavailable');
    expect(await loadSession()).toMatchObject(initialSession);
    expect(invalidations).toBe(0);
  });

  it('does not restore a session when logout happens during refresh', async () => {
    let releaseRefresh!: (response: Response) => void;
    let refreshStarted!: () => void;
    const started = new Promise<void>(resolve => { refreshStarted = resolve; });
    const refreshResponse = new Promise<Response>(resolve => { releaseRefresh = resolve; });
    globalThis.fetch = jest.fn(async (url) => {
      if (String(url).endsWith('/auth/refresh')) {
        refreshStarted();
        return refreshResponse;
      }
      return reply(401, failure('Access token expired'));
    }) as typeof fetch;

    const request = apiRequest('/auth/me', {auth: 'required'});
    await started;
    await clearSession();
    releaseRefresh(reply(200, success({accessToken: 'late-access', refreshToken: 'late-refresh'})));

    await expect(request).rejects.toThrow('Session changed while refreshing.');
    expect(await loadSession()).toBeNull();
  });

  it('does not retry forever when the refreshed token is also rejected', async () => {
    globalThis.fetch = jest.fn(async (url) => String(url).endsWith('/auth/refresh')
      ? reply(200, success({accessToken: 'new-access', refreshToken: 'new-refresh'}))
      : reply(401, failure('Token rejected')),
    ) as typeof fetch;

    await expect(apiRequest('/auth/me', {auth: 'required'})).rejects.toMatchObject({status: 401});
    expect(globalThis.fetch).toHaveBeenCalledTimes(3);
    expect(await loadSession()).toBeNull();
    expect(invalidations).toBe(1);
  });

  it('does not refresh a permission error', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue(reply(403, failure('Forbidden'))) as typeof fetch;
    await expect(apiRequest('/auth/me', {auth: 'required'})).rejects.toMatchObject({status: 403});
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });
});
