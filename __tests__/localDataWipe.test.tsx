import React from 'react';
import {NativeModules} from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import notifee from '@notifee/react-native';
import * as Keychain from 'react-native-keychain';
import {saveSession} from '../src/features/auth';
import {clearSession} from '../src/features/auth/session';
import {saveRecentSearches, loadRecentSearches} from '../src/features/search/recentSearches';
import {loadCachedMessages, saveCachedMessages} from '../src/features/messages/messageCache';
import {getFollowUps, scheduleFollowUp} from '../src/features/messages/followUpReminders';
import {getPendingGiftPurchase, savePendingGiftPurchase} from '../src/features/party/extras/pendingGiftPurchase';
import {loadPendingPartyLink, resetPendingPartyLinkMemoryForTests, savePendingPartyLink, subscribeToPendingPartyLink} from '../src/features/party/pendingPartyLink';
import {loadCachedSubscription, saveCachedSubscription} from '../src/features/plus/plusCache';
import {getPlusState, setSubscription} from '../src/features/plus/plusStore';
import {subscription} from '../src/features/plus/__fixtures__/plusFixtures';
import {useSavedPosts} from '../src/features/home/savedPosts';
import {wipeLocalUserData} from '../src/core/localData';
import type {AuthSession} from '../src/features/auth';

// The native geofence module is captured when vibeNoteGeofencing loads, so provide it first.
const geofence = {clearRegions: jest.fn().mockResolvedValue(undefined), clearPendingEntries: jest.fn().mockResolvedValue(undefined), replaceRegions: jest.fn()};
NativeModules.VibeNoteGeofence = geofence;
require('../src/features/nearby/vibeNoteGeofencing');

const mocked = notifee as unknown as Record<string, jest.Mock>;
const keychain = Keychain as unknown as Record<string, jest.Mock>;
const session = {accessToken: 'a', refreshToken: 'r', user: {id: 'u1'}} as unknown as AuthSession;
const message = {id: 'm1', conversation_id: 'c1', sender_id: 'u2', type: 'TEXT', body: 'private words', created_at: '2026-10-08T10:00:00.000Z'};

let savedApi: ReturnType<typeof useSavedPosts>;
const Probe = () => { savedApi = useSavedPosts(); return null; };
const settle = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };

beforeEach(async () => {
  await AsyncStorage.clear();
  resetPendingPartyLinkMemoryForTests();
  jest.clearAllMocks();
  mocked.requestPermission.mockResolvedValue({authorizationStatus: 1});
});

test('session end wipes every user-scoped store, native registration and in-memory state but keeps onboarding resume', async () => {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => { renderer = ReactTestRenderer.create(<Probe />); await settle(); });
  await ReactTestRenderer.act(async () => { await savedApi.toggle('post-1'); });
  expect([...savedApi.saved]).toEqual(['post-1']);

  await saveCachedMessages('u1', 'c1', [message] as never);
  await saveRecentSearches(['dj night']);
  await scheduleFollowUp('c1', 'Ananya', '3d');
  await savePendingGiftPurchase({partyId: 'p1', senderId: 'u1', creatorId: 'c9', productId: 'gift', reservationId: 'r1', expiresAt: null});
  await savePendingPartyLink('K7mP2qX9LdR4');
  const heard = jest.fn();
  const unsubscribe = subscribeToPendingPartyLink(heard);
  await saveCachedSubscription(subscription({plan: 'plus', status: 'ACTIVE', expiresAt: '2099-01-01T00:00:00Z'}));
  setSubscription(subscription({plan: 'plus', status: 'ACTIVE', expiresAt: '2099-01-01T00:00:00Z'}));
  await AsyncStorage.setItem('@hiva/organizer-onboarding/u1', '{"organizationName":"Acme"}');
  await AsyncStorage.setItem('@hiva/organizer-onboarding/event/u1', '{"title":"Gig"}');
  await AsyncStorage.setItem('persist:auth', '{"needsOnboarding":"true","_persist":"{}"}');
  expect((await AsyncStorage.getAllKeys()).filter(key => key !== 'persist:auth')).toHaveLength(9);

  await ReactTestRenderer.act(async () => { await clearSession(); });

  // Every app-owned key is gone, and only redux-persist's onboarding flag remains.
  expect(await AsyncStorage.getAllKeys()).toEqual(['persist:auth']);
  expect(await AsyncStorage.getItem('persist:auth')).toContain('needsOnboarding');
  expect(await loadCachedMessages('u1', 'c1')).toEqual([]);
  expect(await loadRecentSearches()).toEqual([]);
  expect(await getFollowUps()).toEqual({});
  expect(await getPendingGiftPurchase('p1', 'u1')).toBeNull();
  expect(await loadPendingPartyLink()).toBeNull();
  expect(heard).toHaveBeenLastCalledWith(null);
  expect(await loadCachedSubscription()).toBeNull();
  expect(getPlusState().subscription).toBeNull();
  // OS-scheduled reminder cancelled, badge cleared, geofences and unreported entries dropped.
  expect(mocked.cancelNotification).toHaveBeenCalledWith('follow-up-c1');
  expect(mocked.setBadgeCount).toHaveBeenCalledWith(0);
  expect(geofence.clearRegions).toHaveBeenCalled();
  expect(geofence.clearPendingEntries).toHaveBeenCalled();
  // In-memory saved posts reset for mounted screens and for the next user.
  expect([...savedApi.saved]).toEqual([]);
  expect(keychain.resetGenericPassword).toHaveBeenCalled();
  unsubscribe();
  await ReactTestRenderer.act(async () => { renderer.unmount(); });
  let next!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => { next = ReactTestRenderer.create(<Probe />); await settle(); });
  expect([...savedApi.saved]).toEqual([]);
  await ReactTestRenderer.act(async () => { next.unmount(); });
});

test('an in-flight session save cannot undo the wipe: the reset is queued behind it and the data wipe follows', async () => {
  await AsyncStorage.setItem('hiva.savedPosts.v1', '["p1"]');
  let finishWrite!: (saved: boolean) => void;
  keychain.setGenericPassword.mockImplementationOnce(() => new Promise<boolean>(resolve => { finishWrite = resolve; }));

  const saving = saveSession(session);
  await settle();
  expect(keychain.setGenericPassword).toHaveBeenCalledTimes(1); // the write is in flight
  const clearing = clearSession();
  await settle();
  // The wipe has not started: the logout is waiting its turn behind the write.
  expect(keychain.resetGenericPassword).not.toHaveBeenCalled();
  expect(await AsyncStorage.getItem('hiva.savedPosts.v1')).toBe('["p1"]');

  finishWrite(true);
  expect(await saving).toBe(false);
  await clearing;

  expect(keychain.setGenericPassword.mock.invocationCallOrder[0]).toBeLessThan(keychain.resetGenericPassword.mock.invocationCallOrder[0]);
  expect(await AsyncStorage.getItem('hiva.savedPosts.v1')).toBeNull();
});

test('a reminder scheduled while logging out is cancelled instead of surviving the wipe', async () => {
  const scheduling = scheduleFollowUp('c1', 'Ananya', '1h');
  const wiping = wipeLocalUserData();
  await Promise.all([scheduling, wiping]);
  expect(await scheduling).toBeNull();
  expect(await AsyncStorage.getAllKeys()).toEqual([]);
  expect(mocked.cancelNotification).toHaveBeenCalledWith('follow-up-c1');
});

test('logging out while offline still wipes (nothing in the wipe needs the network)', async () => {
  globalThis.fetch = jest.fn().mockRejectedValue(new Error('offline')) as unknown as typeof fetch;
  await AsyncStorage.setItem('hiva.savedPosts.v1', '["p1"]');
  await clearSession();
  expect(await AsyncStorage.getItem('hiva.savedPosts.v1')).toBeNull();
  expect(globalThis.fetch).not.toHaveBeenCalled();
});
