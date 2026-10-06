/** Set this at build time for the environment being used by the app. */
export const API_BASE_URL = 'https://api-ede.itzsjdude.in';

export type ApiErrorDetail = {
  field?: string;
  message: string;
};

export type ApiError = {
  status: number;
  code?: string;
  message: string;
  details?: ApiErrorDetail[];
  requestId?: string;
};

type ApiEnvelope<T> = {
  success: boolean;
  data: T;
  meta?: ApiPageMeta;
  error?: {
    code?: string;
    message: string;
    details?: ApiErrorDetail[];
  };
  requestId?: string;
};

export type ApiPageMeta = {limit: number; offset: number; hasMore: boolean};
export type ApiPage<T> = {data: T; meta: ApiPageMeta};

export type ApiRequestOptions = RequestInit & {
  auth?: 'none' | 'optional' | 'required';
  timeoutMs?: number;
};

/** Supplied by the auth feature so shared infrastructure has no feature imports. */
export type ApiAuthHandlers = {
  getAccessToken: () => Promise<string | null>;
  refreshAccessToken: (failedAccessToken: string) => Promise<string>;
  onSessionInvalid: (failedAccessToken: string) => Promise<void>;
};

let authHandlers: ApiAuthHandlers | null = null;

export function configureApiAuth(handlers: ApiAuthHandlers): void {
  authHandlers = handlers;
}

function isApiError(error: unknown): error is ApiError {
  return typeof error === 'object' && error !== null &&
    typeof (error as ApiError).status === 'number';
}

async function sendRequest<T, R>(
  path: string,
  options: RequestInit,
  accessToken: string | null,
  select: (envelope: ApiEnvelope<T>) => R,
): Promise<R> {
  const headers = new Headers(options.headers);
  if (options.body != null && typeof options.body === 'string' && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);

  const response = await fetch(`${API_BASE_URL}${path}`, {...options, headers});
  const rawBody = await response.text();

  // Several successful endpoints (including reaction removal) return no body.
  if (response.ok && (response.status === 204 || rawBody.length === 0)) {
    return undefined as R;
  }

  let body: ApiEnvelope<T>;
  try {
    body = JSON.parse(rawBody) as ApiEnvelope<T>;
  } catch {
    throw {
      status: response.status,
      message: `Server returned a non-JSON response (${response.status}).`,
    } satisfies ApiError;
  }

  if (!body || typeof body !== 'object' || typeof body.success !== 'boolean') {
    throw {
      status: response.status,
      message: `Server returned an invalid response (${response.status}).`,
    } satisfies ApiError;
  }

  if (!response.ok || body.success === false) {
    throw {
      status: response.status,
      code: body.error?.code,
      message: body.error?.message ?? 'Something went wrong. Please try again.',
      details: body.error?.details,
      requestId: body.requestId,
    } satisfies ApiError;
  }

  return select(body);
}

async function executeRequestWithAuth<T, R>(
  path: string,
  {auth = 'none', ...options}: ApiRequestOptions,
  select: (envelope: ApiEnvelope<T>) => R,
): Promise<R> {
  if (auth === 'none') return sendRequest(path, options, null, select);
  if (!authHandlers) throw new Error('API auth handlers are not configured.');

  const accessToken = await authHandlers.getAccessToken();
  if (!accessToken && auth === 'required') {
    throw {status: 401, message: 'Please sign in to continue.'} satisfies ApiError;
  }

  try {
    return await sendRequest(path, options, accessToken, select);
  } catch (error) {
    if (!accessToken || !isApiError(error) || error.status !== 401) throw error;
  }

  let newAccessToken: string;
  try {
    newAccessToken = await authHandlers.refreshAccessToken(accessToken);
  } catch (error) {
    // Network and server outages are retryable; invalid refresh credentials are not.
    if (isApiError(error) && [400, 401, 403].includes(error.status)) {
      await authHandlers.onSessionInvalid(accessToken);
    }
    throw error;
  }

  try {
    return await sendRequest(path, options, newAccessToken, select);
  } catch (error) {
    if (isApiError(error) && error.status === 401) {
      await authHandlers.onSessionInvalid(newAccessToken);
    }
    throw error;
  }
}

async function executeRequest<T, R>(path: string, {timeoutMs = 15000, signal, ...options}: ApiRequestOptions, select: (envelope: ApiEnvelope<T>) => R): Promise<R> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) abort();
  signal?.addEventListener('abort', abort);
  let timedOut = false;
  const timer = setTimeout(() => {timedOut = true; controller.abort();}, timeoutMs);
  try {
    return await executeRequestWithAuth(path, {...options, signal: controller.signal}, select);
  } catch (error) {
    if (timedOut) throw {status: 408, message: 'Request timed out. Check your connection and try again.'} satisfies ApiError;
    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}

export function apiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  return executeRequest<T, T>(path, options, envelope => envelope.data);
}

/** Refresh through the normal auth retry path before a websocket handshake. */
export async function getRealtimeAccessToken(): Promise<string | null> {
  await apiRequest('/auth/me', {auth: 'required'});
  return authHandlers?.getAccessToken() ?? null;
}

export function apiRequestPage<T>(path: string, options: ApiRequestOptions = {}): Promise<ApiPage<T>> {
  return executeRequest<T, ApiPage<T>>(path, options, envelope => {
    if (!envelope.meta) throw new Error('Paginated response did not include meta.');
    return {data: envelope.data, meta: envelope.meta};
  });
}
