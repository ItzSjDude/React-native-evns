import AsyncStorage from '@react-native-async-storage/async-storage';
import {clearPendingPartyLink, loadPendingPartyLink, resetPendingPartyLinkMemoryForTests, savePendingPartyLink, subscribeToPendingPartyLink} from '../pendingPartyLink';

beforeEach(async () => {
  resetPendingPartyLinkMemoryForTests();
  await AsyncStorage.clear();
  jest.clearAllMocks();
});

test('persists a captured link until the authenticated handler consumes it', async () => {
  const listener = jest.fn();
  const unsubscribe = subscribeToPendingPartyLink(listener);
  await savePendingPartyLink('K7mP2qX9LdR4');
  expect(listener).toHaveBeenCalledWith('K7mP2qX9LdR4');

  resetPendingPartyLinkMemoryForTests();
  await expect(loadPendingPartyLink()).resolves.toBe('K7mP2qX9LdR4');

  await clearPendingPartyLink();
  resetPendingPartyLinkMemoryForTests();
  await expect(loadPendingPartyLink()).resolves.toBeNull();
  unsubscribe();
});

test('drops invalid stored tokens', async () => {
  await AsyncStorage.setItem('@hiva/pending-party-link', '../../not-a-token');
  await expect(loadPendingPartyLink()).resolves.toBeNull();
  expect(AsyncStorage.removeItem).toHaveBeenCalledWith('@hiva/pending-party-link');
});
