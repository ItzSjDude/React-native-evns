import * as crashlytics from '@react-native-firebase/crashlytics';
import {recordError, setCrashUser, startCrashReporting} from '../crashReporting';

const mocked = crashlytics as unknown as {log: jest.Mock; recordError: jest.Mock; setUserId: jest.Mock; setCrashlyticsCollectionEnabled: jest.Mock};
const previousHandler = jest.fn();
type Global = {__DEV__: boolean; ErrorUtils?: unknown};
const g = globalThis as unknown as Global;
let installed: ((error: unknown, isFatal?: boolean) => void) | undefined;

beforeEach(() => {
  jest.clearAllMocks();
  installed = undefined;
  g.ErrorUtils = {getGlobalHandler: () => previousHandler, setGlobalHandler: (handler: typeof installed) => {installed = handler;}};
});

test('does nothing in development builds', () => {
  g.__DEV__ = true;
  recordError(new Error('boom'));
  setCrashUser('u1');
  expect(mocked.recordError).not.toHaveBeenCalled();
  expect(mocked.setUserId).not.toHaveBeenCalled();
});

test('in release it records handled errors with context and tags the user id', () => {
  g.__DEV__ = false;
  recordError(new Error('boom'), 'loading feed');
  expect(mocked.log).toHaveBeenCalledWith(expect.anything(), 'loading feed');
  expect(mocked.recordError).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({message: 'boom'}));
  setCrashUser('u1');
  expect(mocked.setUserId).toHaveBeenCalledWith(expect.anything(), 'u1');
  setCrashUser(null);
  expect(mocked.setUserId).toHaveBeenLastCalledWith(expect.anything(), '');
});

test('uncaught JS errors are recorded and then passed to the original handler', () => {
  g.__DEV__ = false;
  startCrashReporting();
  installed?.(new Error('fatal'), true);
  expect(mocked.recordError).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({message: 'fatal'}));
  expect(previousHandler).toHaveBeenCalledWith(expect.objectContaining({message: 'fatal'}), true);
});
