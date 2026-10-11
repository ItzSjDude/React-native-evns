import AsyncStorage from '@react-native-async-storage/async-storage';
import {loadCachedSubscription, saveCachedSubscription} from '../plusCache';
import {subscription} from '../__fixtures__/plusFixtures';

beforeEach(() => AsyncStorage.clear());

test('restores a cached subscription', async () => {
  await saveCachedSubscription(subscription({plan: 'plus', status: 'ACTIVE', expiresAt: '2030-01-01T00:00:00Z'}));
  expect(await loadCachedSubscription()).toMatchObject({plan: 'plus', status: 'ACTIVE'});
});

test('a cached Plus whose paid period ended is ignored, a free one is kept', async () => {
  await saveCachedSubscription(subscription({plan: 'plus', status: 'ACTIVE', expiresAt: '2020-01-01T00:00:00Z'}));
  expect(await loadCachedSubscription()).toBeNull();
  await saveCachedSubscription(subscription());
  expect(await loadCachedSubscription()).toMatchObject({plan: 'free'});
});
