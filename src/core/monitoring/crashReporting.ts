import {getCrashlytics, log, recordError as recordCrashlyticsError, setCrashlyticsCollectionEnabled, setUserId} from '@react-native-firebase/crashlytics';

type GlobalErrorHandler = (error: unknown, isFatal?: boolean) => void;
type ErrorUtilsLike = {getGlobalHandler: () => GlobalErrorHandler; setGlobalHandler: (handler: GlobalErrorHandler) => void};

/** Last line of defence: server `message` strings and thrown text can carry emails or phone numbers. */
export const redactPii = (text: string) =>
  text.replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, '[email]').replace(/\+?\d[\d\s().-]{6,}\d/g, '[number]');

const toError = (value: unknown) => {
  const message = value instanceof Error ? value.message : typeof value === 'string' ? value : 'Unknown error';
  const clean = redactPii(message);
  if (!(value instanceof Error)) return new Error(clean);
  if (clean === message) return value;
  const redacted = new Error(clean);
  redacted.name = value.name;
  return redacted;
};

/** Reporting is off in development so Metro red-box noise doesn't pollute the dashboard. */
const enabled = () => !__DEV__;

/**
 * Records a handled error (API failures you recover from, etc.). Never throws.
 *
 * PII RULE: `context` is a short, fixed, developer-written label ("Onboarding read-back mismatch").
 * Never put in it, or throw as the error, anything a person typed or the server sent back: emails,
 * phone numbers, names, DOB, message/post/search text, tokens, field values, or `ApiError.message`
 * (servers echo emails and phones). Ids and HTTP status codes are fine. Messages are redacted for
 * emails/phone numbers as a backstop, but that is not a licence to pass them.
 */
export function recordError(error: unknown, context?: string) {
  if (!enabled()) return;
  try {
    const crashlytics = getCrashlytics();
    if (context) log(crashlytics, redactPii(context));
    recordCrashlyticsError(crashlytics, toError(error));
  } catch {/* reporting must never break the app */}
}

/** Tags crashes with the signed-in user's id (never email or name) so they can be correlated with backend logs. */
export function setCrashUser(userId: string | null) {
  if (!enabled()) return;
  try {setUserId(getCrashlytics(), userId ?? '').catch(() => {});} catch {/* ignore */}
}

let started = false;

/** Call once at startup: turns collection on and forwards uncaught JS errors, then defers to React Native's own handler. */
export function startCrashReporting() {
  if (started) return;
  started = true;
  try {setCrashlyticsCollectionEnabled(getCrashlytics(), enabled()).catch(() => {});} catch {/* ignore */}
  const utils = (globalThis as {ErrorUtils?: ErrorUtilsLike}).ErrorUtils;
  if (!utils) return;
  const previous = utils.getGlobalHandler();
  utils.setGlobalHandler((error, isFatal) => {
    if (enabled()) {
      try {
        const crashlytics = getCrashlytics();
        log(crashlytics, isFatal ? 'Fatal JS error' : 'Uncaught JS error');
        recordCrashlyticsError(crashlytics, toError(error));
      } catch {/* ignore */}
    }
    previous(error, isFatal);
  });
}
