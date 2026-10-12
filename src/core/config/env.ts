/**
 * Build-time configuration. Values come from HIVA_* environment variables inlined by babel.config.js;
 * anything unset falls back to production defaults, so a plain build behaves exactly as before.
 *
 *   HIVA_API_URL        API origin, e.g. https://staging-api.example.com
 *   HIVA_LINK_ORIGIN     Public HTTPS origin used for Universal/App Links
 *   HIVA_PRIVACY_URL    hosted privacy policy (shown in Login and Settings once set)
 *   HIVA_TERMS_URL      hosted terms of service
 */
const clean = (value: string | undefined) => value?.trim() || undefined;

const httpsOrigin = (value: string | undefined): string | undefined => {
  const candidate = clean(value);
  if (!candidate) return undefined;
  try {
    const url = new URL(candidate);
    if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
      return undefined;
    }
    return url.origin;
  } catch {
    return undefined;
  }
};

export const API_BASE_URL = (clean(process.env.HIVA_API_URL) ?? 'https://api-ede.itzsjdude.in').replace(/\/+$/, '');
// Fail closed when absent/invalid: custom-scheme and legacy API links still work,
// but the app will not claim an untrusted HTTPS origin.
export const LINK_ORIGIN = httpsOrigin(process.env.HIVA_LINK_ORIGIN);
export const PRIVACY_POLICY_URL = clean(process.env.HIVA_PRIVACY_URL);
export const TERMS_URL = clean(process.env.HIVA_TERMS_URL);
