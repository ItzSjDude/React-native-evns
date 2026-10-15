// adConfig reads __DEV__ and app.json at import time, so every case loads a fresh copy of the module.
const load = (opts: {dev: boolean; os?: 'android' | 'ios'; config?: Record<string, string>}) => {
  jest.resetModules();
  (globalThis as {__DEV__?: boolean}).__DEV__ = opts.dev;
  const {Platform} = require('react-native');
  const os = opts.os ?? 'android';
  Platform.OS = os;
  Platform.select = (spec: Record<string, unknown>) => spec[os] ?? spec.default;
  if (opts.config) {
    jest.doMock('../../../../app.json', () => ({'react-native-google-mobile-ads': opts.config}));
  }
  const ads = require('react-native-google-mobile-ads');
  return {unitId: require('../adConfig').NATIVE_AD_UNIT_ID as string, testId: ads.TestIds.NATIVE as string};
};

const originalDev = (globalThis as {__DEV__?: boolean}).__DEV__;
afterEach(() => {
  jest.dontMock('../../../../app.json');
  (globalThis as {__DEV__?: boolean}).__DEV__ = originalDev;
});

test('debug builds always use Google\'s test native ad unit, never production inventory', () => {
  const {unitId, testId} = load({dev: true, config: {android_native_ad_unit_id: 'ca-app-pub-real/android'}});
  expect(unitId).toBe(testId);
});

test('release builds with no configured unit id disable native ads (empty string)', () => {
  expect(load({dev: false, os: 'android'}).unitId).toBe('');
  expect(load({dev: false, os: 'ios'}).unitId).toBe('');
});

test('release builds pick the unit id for the running platform', () => {
  const config = {android_native_ad_unit_id: 'ca-app-pub-1/android', ios_native_ad_unit_id: 'ca-app-pub-1/ios'};
  expect(load({dev: false, os: 'android', config}).unitId).toBe('ca-app-pub-1/android');
  expect(load({dev: false, os: 'ios', config}).unitId).toBe('ca-app-pub-1/ios');
});

test('release builds with the config key missing entirely do not crash and disable ads', () => {
  jest.resetModules();
  (globalThis as {__DEV__?: boolean}).__DEV__ = false;
  jest.doMock('../../../../app.json', () => ({}));
  expect(require('../adConfig').NATIVE_AD_UNIT_ID).toBe('');
});
