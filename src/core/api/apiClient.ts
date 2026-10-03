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
  error?: {
    code?: string;
    message: string;
    details?: ApiErrorDetail[];
  };
  requestId?: string;
};

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
  accessToken?: string,
): Promise<T> {
  const url = `${API_BASE_URL}${path}`;

  console.log('[API] request:', {
    method: options.method ?? 'GET',
    url,
    hasAccessToken: Boolean(accessToken),
  });

  let response: Response;
  let rawBody = '';

  try {
    response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',

        // Used for protected APIs after login
        ...(accessToken
          ? {
              Authorization: `Bearer ${accessToken}`,
            }
          : {}),

        ...(options.headers ?? {}),
      },
    });

    rawBody = await response.text();
  } catch (error) {
    console.error('[API] network blocked:', {
      url,
      error,
    });

    throw error;
  }

  console.log('[API] response:', {
    url,
    status: response.status,
    body: rawBody,
  });

  let body: ApiEnvelope<T>;

  try {
    body = JSON.parse(rawBody) as ApiEnvelope<T>;
  } catch {
    throw {
      status: response.status,
      message: `Server returned a non-JSON response (${response.status}).`,
    } satisfies ApiError;
  }

  if (!response.ok || body.success === false) {
    throw {
      status: response.status,
      code: body.error?.code,
      message:
        body.error?.message ??
        'Something went wrong. Please try again.',
      details: body.error?.details,
      requestId: body.requestId,
    } satisfies ApiError;
  }

  // Returns only data
  return body.data;
}