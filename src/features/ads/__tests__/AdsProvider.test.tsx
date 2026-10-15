// AdsProvider keeps a module-level initialize promise, so each test loads a fresh module graph
// (React and the renderer included, so they stay the same instance as the provider's).
type Info = {canRequestAds: boolean};
let tree: {unmount: () => void} | undefined;
let currentAct: ((cb: () => Promise<void> | void) => Promise<void>) | undefined;

const setup = (opts: {unitId?: string} = {}) => {
  jest.resetModules();
  const unitId = opts.unitId ?? 'ca-app-pub-test/native';
  jest.doMock('../adConfig', () => ({NATIVE_AD_UNIT_ID: unitId}));
  const React = require('react');
  const Renderer = require('react-test-renderer');
  const {AdsConsent, MobileAds} = require('react-native-google-mobile-ads');
  const initialize = jest.fn().mockResolvedValue([]);
  MobileAds.mockImplementation(() => ({initialize}));
  const {default: AdsProvider, useAds} = require('../AdsProvider');
  let latest: {ready: boolean; showPrivacyOptions: () => Promise<void>} | undefined;
  const Probe = () => { latest = useAds(); return null; };
  const mount = async () => {
    await Renderer.act(async () => {tree = Renderer.create(React.createElement(AdsProvider, null, React.createElement(Probe)));});
  };
  currentAct = Renderer.act;
  const flush = () => Renderer.act(async () => {});
  return {AdsConsent, MobileAds, initialize, mount, flush, act: Renderer.act, ads: () => latest!, React, Renderer, AdsProvider, useAds};
};
const consent = (canRequestAds: boolean): Info => ({canRequestAds});

afterEach(async () => {
  if (tree) await currentAct!(async () => {tree!.unmount();});
  tree = undefined;
  jest.dontMock('../adConfig');
});

test('without a provider, useAds reports not ready and a no-op privacy action', async () => {
  const {useAds, React, Renderer} = setup();
  let value: ReturnType<typeof useAds> | undefined;
  const Probe = () => { value = useAds(); return null; };
  await Renderer.act(async () => {tree = Renderer.create(React.createElement(Probe));});
  expect(value!.ready).toBe(false);
  await expect(value!.showPrivacyOptions()).resolves.toBeUndefined();
});

test('with no ad unit configured nothing touches consent or the ads SDK', async () => {
  const s = setup({unitId: ''});
  await s.mount();
  expect(s.AdsConsent.gatherConsent).not.toHaveBeenCalled();
  expect(s.AdsConsent.getConsentInfo).not.toHaveBeenCalled();
  expect(s.MobileAds).not.toHaveBeenCalled();
  expect(s.ads().ready).toBe(false);
});

test('gathers consent first and only initializes the SDK once ads may be requested', async () => {
  const s = setup();
  const order: string[] = [];
  s.AdsConsent.gatherConsent.mockImplementation(async () => {order.push('gather'); return consent(true);});
  s.initialize.mockImplementation(async () => {order.push('initialize'); return [];});
  await s.mount();
  expect(order).toEqual(['gather', 'initialize']);
  expect(s.ads().ready).toBe(true);
});

test('stays not-ready and never initializes the SDK when the user has not granted consent', async () => {
  const s = setup();
  s.AdsConsent.gatherConsent.mockResolvedValue(consent(false));
  await s.mount();
  expect(s.initialize).not.toHaveBeenCalled();
  expect(s.ads().ready).toBe(false);
});

test('if the consent form fails, falls back to the stored consent status', async () => {
  const s = setup();
  s.AdsConsent.gatherConsent.mockRejectedValue(new Error('form unavailable'));
  s.AdsConsent.getConsentInfo.mockResolvedValue(consent(true));
  await s.mount();
  expect(s.AdsConsent.getConsentInfo).toHaveBeenCalledTimes(1);
  expect(s.initialize).toHaveBeenCalledTimes(1);
  expect(s.ads().ready).toBe(true);
});

test('if the fallback status says no consent, ads stay off', async () => {
  const s = setup();
  s.AdsConsent.gatherConsent.mockRejectedValue(new Error('form unavailable'));
  s.AdsConsent.getConsentInfo.mockResolvedValue(consent(false));
  await s.mount();
  expect(s.initialize).not.toHaveBeenCalled();
  expect(s.ads().ready).toBe(false);
});

test('if consent gathering and the fallback both fail, the app keeps working without ads', async () => {
  const s = setup();
  s.AdsConsent.gatherConsent.mockRejectedValue(new Error('a'));
  s.AdsConsent.getConsentInfo.mockRejectedValue(new Error('b'));
  await s.mount();
  expect(s.initialize).not.toHaveBeenCalled();
  expect(s.ads().ready).toBe(false);
});

test('unmounting before consent resolves never initializes the SDK or sets state', async () => {
  const s = setup();
  let resolve!: (info: Info) => void;
  s.AdsConsent.gatherConsent.mockReturnValue(new Promise<Info>(r => {resolve = r;}));
  const errors = jest.spyOn(console, 'error').mockImplementation(() => {});
  await s.mount();
  await s.act(async () => {tree!.unmount(); tree = undefined;});
  await s.act(async () => {resolve(consent(true));});
  expect(s.initialize).not.toHaveBeenCalled();
  expect(errors).not.toHaveBeenCalled();
  errors.mockRestore();
});

test('unmounting while the SDK initializes does not set state afterwards', async () => {
  const s = setup();
  let finish!: () => void;
  s.AdsConsent.gatherConsent.mockResolvedValue(consent(true));
  s.initialize.mockReturnValue(new Promise<void>(r => {finish = r;}));
  const errors = jest.spyOn(console, 'error').mockImplementation(() => {});
  await s.mount();
  expect(s.ads().ready).toBe(false);
  await s.act(async () => {tree!.unmount(); tree = undefined;});
  await s.act(async () => {finish();});
  expect(errors).not.toHaveBeenCalled();
  errors.mockRestore();
});

test('the ads SDK is initialized at most once per process, even across provider remounts', async () => {
  const s = setup();
  s.AdsConsent.gatherConsent.mockResolvedValue(consent(true));
  await s.mount();
  await s.act(async () => {tree!.unmount(); tree = undefined;});
  await s.mount();
  expect(s.initialize).toHaveBeenCalledTimes(1);
  expect(s.ads().ready).toBe(true);
});

describe('privacy options', () => {
  test('granting consent from the privacy form turns ads on', async () => {
    const s = setup();
    s.AdsConsent.gatherConsent.mockResolvedValue(consent(false));
    await s.mount();
    s.AdsConsent.getConsentInfo.mockResolvedValue(consent(true));
    await s.act(async () => {await s.ads().showPrivacyOptions();});
    expect(s.AdsConsent.showPrivacyOptionsForm).toHaveBeenCalledTimes(1);
    expect(s.initialize).toHaveBeenCalledTimes(1);
    expect(s.ads().ready).toBe(true);
  });

  test('withdrawing consent from the privacy form turns ads off again', async () => {
    const s = setup();
    s.AdsConsent.gatherConsent.mockResolvedValue(consent(true));
    await s.mount();
    expect(s.ads().ready).toBe(true);
    s.AdsConsent.getConsentInfo.mockResolvedValue(consent(false));
    await s.act(async () => {await s.ads().showPrivacyOptions();});
    expect(s.ads().ready).toBe(false);
  });

  test('re-reads consent only after the form has been closed', async () => {
    const s = setup();
    s.AdsConsent.gatherConsent.mockResolvedValue(consent(false));
    await s.mount();
    const order: string[] = [];
    s.AdsConsent.showPrivacyOptionsForm.mockImplementation(async () => {order.push('form'); return consent(false);});
    s.AdsConsent.getConsentInfo.mockImplementation(async () => {order.push('read'); return consent(false);});
    await s.act(async () => {await s.ads().showPrivacyOptions();});
    expect(order).toEqual(['form', 'read']);
  });

  test('if the form fails to open the error reaches the caller and consent is not re-read', async () => {
    const s = setup();
    s.AdsConsent.gatherConsent.mockResolvedValue(consent(false));
    await s.mount();
    s.AdsConsent.showPrivacyOptionsForm.mockRejectedValue(new Error('no form'));
    await s.act(async () => {await expect(s.ads().showPrivacyOptions()).rejects.toThrow('no form');});
    expect(s.AdsConsent.getConsentInfo).not.toHaveBeenCalled();
  });
});

// A transient SDK initialisation failure should be retryable (e.g. after the user re-opens the privacy
// options). AdsProvider.tsx caches the rejected promise in `initializePromise ??= ...`, so every later
// attempt re-throws the same rejection and `initialize` is never called again for the life of the process.
test.failing('a failed SDK initialisation is retried on the next consent refresh instead of being cached', async () => {
  const s = setup();
  s.AdsConsent.gatherConsent.mockResolvedValue(consent(true));
  s.initialize.mockRejectedValueOnce(new Error('transient init failure')).mockResolvedValue([]);
  await s.mount();
  expect(s.ads().ready).toBe(false);
  s.AdsConsent.getConsentInfo.mockResolvedValue(consent(true));
  await s.act(async () => {await s.ads().showPrivacyOptions();});
  expect(s.initialize).toHaveBeenCalledTimes(2);
  expect(s.ads().ready).toBe(true);
});
