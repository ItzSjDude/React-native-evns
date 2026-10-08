/**
 * Build-time configuration. Values come from HIVA_* environment variables inlined by babel.config.js;
 * anything unset falls back to production defaults, so a plain build behaves exactly as before.
 *
 *   HIVA_API_URL        API origin, e.g. https://staging-api.example.com
 *   HIVA_PRIVACY_URL    hosted privacy policy (shown in Login and Settings once set)
 *   HIVA_TERMS_URL      hosted terms of service
 */
const clean = (value: string | undefined) => value?.trim() || undefined;

export const API_BASE_URL = (clean(process.env.HIVA_API_URL) ?? 'https://api-ede.itzsjdude.in').replace(/\/+$/, '');
export const PRIVACY_POLICY_URL = clean(process.env.HIVA_PRIVACY_URL);
export const TERMS_URL = clean(process.env.HIVA_TERMS_URL);
