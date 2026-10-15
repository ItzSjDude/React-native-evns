import AsyncStorage from '@react-native-async-storage/async-storage';
import {recordError} from '../../monitoring';
import {claimLocalDataOwner, getWipeEpoch, registerLocalDataWiper, setItemUnlessWiped, wipeLocalUserData} from '../localData';

jest.mock('../../monitoring', () => ({recordError: jest.fn()}));
const recorded = recordError as jest.Mock;

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.clearAllMocks();
});

test('removes only app-owned keys and leaves redux-persist and foreign keys alone', async () => {
  await AsyncStorage.setItem('hiva.a', '1');
  await AsyncStorage.setItem('@hiva/b', '2');
  await AsyncStorage.setItem('persist:auth', '{"needsOnboarding":"true"}');
  await AsyncStorage.setItem('other.lib', '3');
  await wipeLocalUserData();
  expect((await AsyncStorage.getAllKeys()).sort()).toEqual(['other.lib', 'persist:auth']);
});

test('runs wipers before the keys are removed, and a failing or stuck wiper never blocks or rejects', async () => {
  jest.useFakeTimers();
  try {
    await AsyncStorage.setItem('hiva.seed', 'x');
    let seenByWiper: string | null = null;
    const offs = [
      registerLocalDataWiper(async () => {seenByWiper = await AsyncStorage.getItem('hiva.seed');}),
      registerLocalDataWiper(() => {throw new Error('native module missing');}),
      registerLocalDataWiper(() => new Promise<void>(() => {})),
    ];
    const done = wipeLocalUserData();
    await jest.advanceTimersByTimeAsync(5000);
    await expect(done).resolves.toBeUndefined();
    expect(seenByWiper).toBe('x');
    expect(await AsyncStorage.getItem('hiva.seed')).toBeNull();
    expect(recorded).toHaveBeenCalledTimes(2);
    offs.forEach(off => off());
  } finally { jest.useRealTimers(); }
});

test('a write that started before the wipe is dropped, one started after it lands', async () => {
  const before = getWipeEpoch();
  await wipeLocalUserData();
  await setItemUnlessWiped(before, 'hiva.late', 'old');
  expect(await AsyncStorage.getItem('hiva.late')).toBeNull();
  await setItemUnlessWiped(getWipeEpoch(), 'hiva.late', 'new');
  expect(await AsyncStorage.getItem('hiva.late')).toBe('new');
});

test('wipes are serialized: overlapping calls do not interleave', async () => {
  const order: string[] = [];
  const off = registerLocalDataWiper(async () => {order.push('start'); await Promise.resolve(); await Promise.resolve(); order.push('end');});
  await Promise.all([wipeLocalUserData(), wipeLocalUserData()]);
  expect(order).toEqual(['start', 'end', 'start', 'end']);
  off();
});

describe('claimLocalDataOwner', () => {
  test('first claim only records the owner and keeps unowned legacy data', async () => {
    await AsyncStorage.setItem('hiva.savedPosts.v1', '["p1"]');
    await claimLocalDataOwner('u1');
    expect(await AsyncStorage.getItem('hiva.savedPosts.v1')).toBe('["p1"]');
    expect(await AsyncStorage.getItem('hiva.localData.owner')).toBe('u1');
  });

  test('the same user keeps their data', async () => {
    await claimLocalDataOwner('u1');
    await AsyncStorage.setItem('hiva.savedPosts.v1', '["p1"]');
    await claimLocalDataOwner('u1');
    expect(await AsyncStorage.getItem('hiva.savedPosts.v1')).toBe('["p1"]');
  });

  test('a different account wipes the previous account data, then owns the device', async () => {
    await claimLocalDataOwner('u1');
    await AsyncStorage.setItem('hiva.savedPosts.v1', '["p1"]');
    await AsyncStorage.setItem('@hiva/pending-party-gift', '{}');
    await claimLocalDataOwner('u2');
    expect(await AsyncStorage.getItem('hiva.savedPosts.v1')).toBeNull();
    expect(await AsyncStorage.getItem('@hiva/pending-party-gift')).toBeNull();
    expect(await AsyncStorage.getItem('hiva.localData.owner')).toBe('u2');
  });

  test('a logout during the claim is not undone by the late owner write', async () => {
    const claim = claimLocalDataOwner('u1');
    await wipeLocalUserData();
    await claim;
    expect(await AsyncStorage.getItem('hiva.localData.owner')).toBeNull();
  });
});
