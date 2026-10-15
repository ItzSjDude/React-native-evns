import React from 'react';
import {Image, Text} from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import {NativeAd, NativeAdView} from 'react-native-google-mobile-ads';
import NativeAdCard from '../NativeAdCard';
import {useAds} from '../AdsProvider';
import {NATIVE_AD_UNIT_ID} from '../adConfig';

jest.mock('../AdsProvider', () => ({useAds: jest.fn()}));
const createAd = NativeAd.createForAdRequest as unknown as jest.Mock;
const ads = useAds as jest.Mock;

const fakeAd = (overrides: Record<string, unknown> = {}) => ({
  headline: 'Fresh coffee, delivered', body: 'Get 20% off your first order', advertiser: 'Bean Co',
  callToAction: 'Order now', icon: {url: 'https://cdn.example/icon.png'}, mediaContent: {aspectRatio: 1.7},
  destroy: jest.fn(), ...overrides,
});

let tree: ReactTestRenderer.ReactTestRenderer | undefined;
const mount = async (element = <NativeAdCard />) => {
  await ReactTestRenderer.act(async () => {tree = ReactTestRenderer.create(element);});
};
// The test double maps NativeMediaView to a plain View, so the media slot is identified by its resizeMode prop.
const mediaViews = () => tree!.root.findAll(node => node.props.resizeMode === 'cover' && typeof node.type === 'string');
const texts = () => tree!.root.findAllByType(Text).map(node => [node.props.children].flat().join(''));

afterEach(async () => { await ReactTestRenderer.act(async () => {tree?.unmount(); tree = undefined;}); });
beforeEach(() => {
  jest.clearAllMocks();
  ads.mockReturnValue({ready: true});
  createAd.mockReset();
});

test('requests the native ad with the configured unit id only once consent has made ads ready', async () => {
  ads.mockReturnValue({ready: false});
  createAd.mockResolvedValue(fakeAd());
  await mount();
  expect(createAd).not.toHaveBeenCalled();
  expect(tree!.toJSON()).toBeNull();
  ads.mockReturnValue({ready: true});
  await ReactTestRenderer.act(async () => {tree!.update(<NativeAdCard />);});
  expect(createAd).toHaveBeenCalledTimes(1);
  expect(createAd).toHaveBeenCalledWith(NATIVE_AD_UNIT_ID);
  expect(texts()).toContain('Fresh coffee, delivered');
});

test('renders nothing until the ad has loaded', async () => {
  createAd.mockReturnValue(new Promise(() => {}));
  await mount();
  expect(tree!.toJSON()).toBeNull();
});

test('renders nothing when the ad request fails', async () => {
  createAd.mockRejectedValue(new Error('no fill'));
  await mount();
  expect(tree!.toJSON()).toBeNull();
});

test('a loaded ad is clearly labelled as sponsored and shows headline, body, advertiser, CTA, icon and media', async () => {
  const ad = fakeAd();
  createAd.mockResolvedValue(ad);
  await mount();
  expect(texts()).toEqual(expect.arrayContaining(['SPONSORED', 'Fresh coffee, delivered', 'Get 20% off your first order', 'Bean Co', 'Order now']));
  const label = tree!.root.findAllByType(Text).find(node => node.props.children === 'SPONSORED')!;
  expect(label.props.accessibilityLabel).toBe('Advertisement');
  expect(tree!.root.findByType(NativeAdView).props.nativeAd).toBe(ad);
  expect(tree!.root.findByType(Image).props.source).toEqual({uri: 'https://cdn.example/icon.png'});
  expect(mediaViews()).toHaveLength(1);
});

test('optional assets are omitted and the advertiser falls back to "Sponsored"', async () => {
  createAd.mockResolvedValue(fakeAd({body: '', advertiser: null, callToAction: undefined, icon: undefined, mediaContent: undefined}));
  await mount();
  expect(texts()).toEqual(['SPONSORED', 'Fresh coffee, delivered', 'Sponsored']);
  expect(tree!.root.findAllByType(Image)).toHaveLength(0);
  expect(mediaViews()).toHaveLength(0);
});

test('destroys the native ad when the card unmounts', async () => {
  const ad = fakeAd();
  createAd.mockResolvedValue(ad);
  await mount();
  expect(ad.destroy).not.toHaveBeenCalled();
  await ReactTestRenderer.act(async () => {tree!.unmount(); tree = undefined;});
  expect(ad.destroy).toHaveBeenCalledTimes(1);
});

test('an ad that finishes loading after the card unmounted is destroyed and never rendered', async () => {
  const ad = fakeAd();
  let resolve!: (value: unknown) => void;
  createAd.mockReturnValue(new Promise(r => {resolve = r;}));
  const errors = jest.spyOn(console, 'error').mockImplementation(() => {});
  await mount();
  await ReactTestRenderer.act(async () => {tree!.unmount(); tree = undefined;});
  await ReactTestRenderer.act(async () => {resolve(ad);});
  expect(ad.destroy).toHaveBeenCalledTimes(1);
  expect(errors).not.toHaveBeenCalled();
  errors.mockRestore();
});

// When the user withdraws consent through the privacy options form, `ready` flips back to false. The effect
// cleanup destroys the loaded NativeAd, but NativeAdCard.tsx never clears its `ad` state (the effect returns
// early when !ready), so the card keeps rendering a destroyed ad after consent was withdrawn.
test('stops rendering the ad once ads are no longer ready (consent withdrawn)', async () => {
  const ad = fakeAd();
  createAd.mockResolvedValue(ad);
  await mount();
  expect(texts()).toContain('SPONSORED');
  ads.mockReturnValue({ready: false});
  await ReactTestRenderer.act(async () => {tree!.update(<NativeAdCard />);});
  expect(ad.destroy).toHaveBeenCalledTimes(1);
  expect(tree!.toJSON()).toBeNull();
});
