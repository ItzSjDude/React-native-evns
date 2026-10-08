import {getCrashlytics, log, recordError as recordCrashlyticsError, setCrashlyticsCollectionEnabled, setUserId} from '@react-native-firebase/crashlytics';

type GlobalErrorHandler = (error: unknown, isFatal?: boolean) => void;
type ErrorUtilsLike = {getGlobalHandler: () => GlobalErrorHandler; setGlobalHandler: (handler: GlobalErrorHandler) => void};

const toError = (value: unknown) => (value instanceof Error ? value : new Error(typeof value === 'string' ? value : 'Unknown error'));

/** Reporting is off in development so Metro red-box noise doesn't pollute the dashboard. */
const enabled = () => !__DEV__;

/** Records a handled error (API failures you recover from, etc.). Never throws. */
export function recordError(error: unknown, context?: string) {
  if (!enabled()) return;
  try {
    const crashlytics = getCrashlytics();
    if (context) log(crashlytics, context);
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
