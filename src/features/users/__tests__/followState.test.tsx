import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import {followStore, useFollowToggle, useIsFollowing, useViewerId} from '../followState';
import {followUser, getViewerFollowingIds, unfollowUser} from '../usersService';
import {loadSession} from '../../auth';
import {wipeLocalUserData} from '../../../core/localData';

jest.mock('../../auth', () => ({loadSession: jest.fn()}));
jest.mock('../usersService', () => ({
  ...jest.requireActual('../usersService'),
  followUser: jest.fn(), unfollowUser: jest.fn(), getViewerFollowingIds: jest.fn(),
}));
const follow = followUser as jest.Mock;
const unfollow = unfollowUser as jest.Mock;
const loadFollowing = getViewerFollowingIds as jest.Mock;
const session = loadSession as jest.Mock;

const deferred = <T,>() => {
  let resolve!: (value: T) => void; let reject!: (error: unknown) => void;
  const promise = new Promise<T>((ok, fail) => { resolve = ok; reject = fail; });
  return {promise, resolve, reject};
};

// Minimal hook harness: renders the hook and exposes the latest result.
function mountHook<T, P>(hook: (props: P) => T, initial: P) {
  const result: {current: T} = {current: undefined as unknown as T};
  const Probe = ({props}: {props: P}) => { result.current = hook(props); return null; };
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  const mount = async () => { await ReactTestRenderer.act(async () => { renderer = ReactTestRenderer.create(<Probe props={initial} />); }); };
  const rerender = (props: P) => ReactTestRenderer.act(async () => { renderer.update(<Probe props={props} />); });
  const unmount = () => ReactTestRenderer.act(async () => { renderer.unmount(); });
  return {result, mount, rerender, unmount};
}

const mounted: Array<{unmount: () => Promise<void>}> = [];
afterEach(async () => { while (mounted.length) await mounted.pop()!.unmount(); });
beforeEach(() => {
  jest.resetAllMocks();
  followStore.reset();
  loadFollowing.mockResolvedValue(new Set());
});

describe('followStore', () => {
  test('remembers what was published and notifies subscribers until they unsubscribe', () => {
    const listener = jest.fn();
    const off = followStore.subscribe(listener);
    followStore.publish('u2', true, 10);
    expect(followStore.get('u2')).toBe(true);
    expect(listener).toHaveBeenCalledWith('u2', true, 10);
    off();
    followStore.publish('u2', false);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(followStore.get('u2')).toBe(false);
  });

  test('get is undefined for people we have not learned about', () => {
    expect(followStore.get('nobody')).toBeUndefined();
  });

  test('the viewer following list is fetched once per viewer and marks those people as followed', async () => {
    loadFollowing.mockResolvedValue(new Set(['a', 'b']));
    await Promise.all([followStore.loadViewerFollowing('me'), followStore.loadViewerFollowing('me')]);
    await followStore.loadViewerFollowing('me');
    expect(loadFollowing).toHaveBeenCalledTimes(1);
    expect(followStore.get('a')).toBe(true);
    expect(followStore.get('b')).toBe(true);
    await followStore.loadViewerFollowing('someone-else');
    expect(loadFollowing).toHaveBeenCalledTimes(2);
  });

  test('seeding from the list never overrides something learned from an explicit action', async () => {
    followStore.publish('a', false);
    loadFollowing.mockResolvedValue(new Set(['a', 'b']));
    await followStore.loadViewerFollowing('me');
    expect(followStore.get('a')).toBe(false);
    expect(followStore.get('b')).toBe(true);
  });

  test('a failed lookup is not cached: the next call retries', async () => {
    loadFollowing.mockRejectedValueOnce(new Error('offline')).mockResolvedValue(new Set(['a']));
    await expect(followStore.loadViewerFollowing('me')).rejects.toThrow('offline');
    await Promise.resolve();
    await followStore.loadViewerFollowing('me');
    expect(loadFollowing).toHaveBeenCalledTimes(2);
    expect(followStore.get('a')).toBe(true);
  });
});

describe('useViewerId', () => {
  test('is undefined while the keychain is read, then the signed-in user id', async () => {
    const gate = deferred<{user: {id: string}}>();
    session.mockReturnValue(gate.promise);
    const hook = mountHook(() => useViewerId(), undefined);
    mounted.push(hook);
    await hook.mount();
    expect(hook.result.current).toBeUndefined();
    await ReactTestRenderer.act(async () => { gate.resolve({user: {id: 'me'}}); });
    expect(hook.result.current).toBe('me');
  });

  test.each([['no session', null], ['a keychain failure', 'throw']])('is null for %s', async (_name, outcome) => {
    if (outcome === 'throw') session.mockRejectedValue(new Error('keychain')); else session.mockResolvedValue(outcome);
    const hook = mountHook(() => useViewerId(), undefined);
    mounted.push(hook);
    await hook.mount();
    expect(hook.result.current).toBeNull();
  });
});

describe('followStore seeding and wipe', () => {
  test('seedFromRows records only boolean flags, skips the viewer, and notifies nobody', () => {
    const listener = jest.fn();
    followStore.subscribe(listener);
    followStore.seedFromRows([{id: 'a', isFollowing: true}, {id: 'b', isFollowing: false}, {id: 'c'}, {id: 'me', isFollowing: false}], 'me');
    expect(followStore.get('a')).toBe(true);
    expect(followStore.get('b')).toBe(false);
    expect(followStore.get('c')).toBeUndefined();
    expect(followStore.get('me')).toBeUndefined();
    expect(listener).not.toHaveBeenCalled();
  });

  test('a wipe forgets follow state learned for user A so the next viewer starts clean', async () => {
    loadFollowing.mockResolvedValue(new Set(['a']));
    await followStore.loadViewerFollowing('userA');
    followStore.publish('x', true);
    expect(followStore.get('a')).toBe(true);
    const listener = jest.fn();
    followStore.subscribe(listener);

    await wipeLocalUserData();

    expect(followStore.get('a')).toBeUndefined();
    expect(followStore.get('x')).toBeUndefined();
    expect(listener).not.toHaveBeenCalled();
    // Second viewer: following list is fetched afresh, and the live subscriber still hears new events.
    loadFollowing.mockResolvedValue(new Set(['z']));
    await followStore.loadViewerFollowing('userB');
    expect(loadFollowing).toHaveBeenCalledTimes(2);
    expect(followStore.get('a')).toBeUndefined();
    expect(followStore.get('z')).toBe(true);
    followStore.publish('z', false);
    expect(listener).toHaveBeenCalledWith('z', false, undefined);
  });
});

describe('useIsFollowing', () => {
  const setup = async (userId: string, viewerId: string | null | undefined, enabled = true) => {
    const hook = mountHook(({u, v, e}: {u: string; v: string | null | undefined; e: boolean}) => useIsFollowing(u, v, e), {u: userId, v: viewerId, e: enabled});
    mounted.push(hook);
    await hook.mount();
    return hook;
  };

  test('starts from what the store already knows', async () => {
    followStore.publish('u2', true);
    const hook = await setup('u2', undefined);
    expect(hook.result.current).toBe(true);
  });

  test('is unknown (null) until the viewer id is known, and never looks up before then', async () => {
    const hook = await setup('u2', undefined);
    expect(hook.result.current).toBeNull();
    expect(loadFollowing).not.toHaveBeenCalled();
  });

  test('resolves to true/false from the viewer following list', async () => {
    loadFollowing.mockResolvedValue(new Set(['u2']));
    expect((await setup('u2', 'me')).result.current).toBe(true);
    expect((await setup('u3', 'me')).result.current).toBe(false);
  });

  test('does not download the following list when the store already learned the answer from a row', async () => {
    followStore.seedFromRows([{id: 'u2', isFollowing: true}, {id: 'u3', isFollowing: false}]);
    expect((await setup('u2', 'me')).result.current).toBe(true);
    expect((await setup('u3', 'me')).result.current).toBe(false);
    expect(loadFollowing).not.toHaveBeenCalled();
  });

  test('never looks up your own profile or when disabled', async () => {
    expect((await setup('me', 'me')).result.current).toBeNull();
    expect((await setup('u2', 'me', false)).result.current).toBeNull();
    expect(loadFollowing).not.toHaveBeenCalled();
  });

  test('a failed lookup settles on "not following" so the button becomes usable', async () => {
    loadFollowing.mockRejectedValue(new Error('offline'));
    expect((await setup('u2', 'me')).result.current).toBe(false);
  });
});

describe('useFollowToggle', () => {
  const setup = async (seed: {following: boolean | null; followers?: number | null}, onFailure?: (e: unknown) => void, userId = 'u2') => {
    const hook = mountHook(({u, s}: {u: string; s: typeof seed}) => useFollowToggle(u, s, onFailure), {u: userId, s: seed});
    mounted.push(hook);
    await hook.mount();
    return hook;
  };
  const toggle = async (hook: Awaited<ReturnType<typeof setup>>) => {
    let outcome: unknown;
    await ReactTestRenderer.act(async () => { outcome = await hook.result.current.toggle(); });
    return outcome;
  };

  test('flips immediately, adjusts the follower count, then settles on the server answer and publishes it', async () => {
    const gate = deferred<{userId: string; isFollowing: boolean; followers: number}>();
    follow.mockReturnValue(gate.promise);
    const hook = await setup({following: false, followers: 4});
    const listener = jest.fn();
    followStore.subscribe(listener);
    let pending!: Promise<unknown>;
    await ReactTestRenderer.act(async () => { pending = hook.result.current.toggle(); });
    expect(hook.result.current).toMatchObject({following: true, followers: 5, pending: true});
    await ReactTestRenderer.act(async () => { gate.resolve({userId: 'u2', isFollowing: true, followers: 9}); await pending; });
    expect(hook.result.current).toMatchObject({following: true, followers: 9, pending: false, error: null});
    expect(follow).toHaveBeenCalledWith('u2');
    expect(listener).toHaveBeenCalledWith('u2', true, 9);
    expect(followStore.get('u2')).toBe(true);
  });

  test('unfollows when currently following, and the count never goes below zero', async () => {
    unfollow.mockResolvedValue({userId: 'u2', isFollowing: false, followers: 0});
    const hook = await setup({following: true, followers: 0});
    const gate = deferred<{userId: string; isFollowing: boolean; followers: number}>();
    unfollow.mockReturnValue(gate.promise);
    await ReactTestRenderer.act(async () => { hook.result.current.toggle(); });
    expect(hook.result.current).toMatchObject({following: false, followers: 0});
    await ReactTestRenderer.act(async () => { gate.resolve({userId: 'u2', isFollowing: false, followers: 0}); });
    expect(unfollow).toHaveBeenCalledWith('u2');
  });

  test('an unknown follower count stays unknown through the optimistic flip', async () => {
    follow.mockReturnValue(new Promise(() => {}));
    const hook = await setup({following: false});
    await ReactTestRenderer.act(async () => { hook.result.current.toggle(); });
    expect(hook.result.current).toMatchObject({following: true, followers: null});
  });

  test('a failure rolls back to the previous state, exposes the message and calls onFailure', async () => {
    const failure = {status: 500, message: 'Could not follow'};
    follow.mockRejectedValue(failure);
    const onFailure = jest.fn();
    const hook = await setup({following: false, followers: 4}, onFailure);
    expect(await toggle(hook)).toBeNull();
    expect(hook.result.current).toMatchObject({following: false, followers: 4, pending: false, error: 'Could not follow'});
    expect(onFailure).toHaveBeenCalledWith(failure);
    expect(followStore.get('u2')).toBeUndefined();
  });

  test('a failure without a message falls back to a generic one', async () => {
    follow.mockRejectedValue(undefined);
    const hook = await setup({following: false, followers: 1});
    await toggle(hook);
    expect(hook.result.current.error).toBe('Please try again.');
  });

  test('a second tap while the first request is in flight is ignored', async () => {
    const gate = deferred<{userId: string; isFollowing: boolean; followers: number}>();
    follow.mockReturnValue(gate.promise);
    const hook = await setup({following: false, followers: 1});
    await ReactTestRenderer.act(async () => { hook.result.current.toggle(); });
    expect(await toggle(hook)).toBeNull();
    expect(follow).toHaveBeenCalledTimes(1);
    expect(unfollow).not.toHaveBeenCalled();
    await ReactTestRenderer.act(async () => { gate.resolve({userId: 'u2', isFollowing: true, followers: 2}); });
  });

  test('a retry after a failure clears the previous error', async () => {
    follow.mockRejectedValueOnce({message: 'boom'}).mockResolvedValue({userId: 'u2', isFollowing: true, followers: 2});
    const hook = await setup({following: false, followers: 1});
    await toggle(hook);
    expect(hook.result.current.error).toBe('boom');
    await toggle(hook);
    expect(hook.result.current).toMatchObject({error: null, following: true, followers: 2});
  });

  test('another surface (e.g. the follow list) publishing for the same person updates this button', async () => {
    const hook = await setup({following: false, followers: 4});
    await ReactTestRenderer.act(async () => { followStore.publish('u2', true, 7); });
    expect(hook.result.current).toMatchObject({following: true, followers: 7});
    await ReactTestRenderer.act(async () => { followStore.publish('u2', false); });
    expect(hook.result.current).toMatchObject({following: false, followers: 7});
  });

  test('publishes for other people are ignored', async () => {
    const hook = await setup({following: false, followers: 4});
    await ReactTestRenderer.act(async () => { followStore.publish('u3', true, 99); });
    expect(hook.result.current).toMatchObject({following: false, followers: 4});
  });

  test('a publish arriving while this button has its own request in flight does not clobber the optimistic state', async () => {
    const gate = deferred<{userId: string; isFollowing: boolean; followers: number}>();
    follow.mockReturnValue(gate.promise);
    const hook = await setup({following: false, followers: 4});
    await ReactTestRenderer.act(async () => { hook.result.current.toggle(); });
    await ReactTestRenderer.act(async () => { followStore.publish('u2', false, 1); });
    expect(hook.result.current).toMatchObject({following: true, followers: 5});
    await ReactTestRenderer.act(async () => { gate.resolve({userId: 'u2', isFollowing: true, followers: 6}); });
  });

  test('a late-arriving seed (e.g. the profile fetch finishing) is adopted when idle', async () => {
    const hook = await setup({following: null, followers: null});
    expect(hook.result.current).toMatchObject({following: null, followers: null});
    await hook.rerender({u: 'u2', s: {following: true, followers: 12}});
    expect(hook.result.current).toMatchObject({following: true, followers: 12});
  });

  test('switching to a different person starts over from that person\'s seed', async () => {
    const hook = await setup({following: true, followers: 4});
    await hook.rerender({u: 'u3', s: {following: false, followers: 1}});
    expect(hook.result.current).toMatchObject({following: false, followers: 1, error: null});
  });
});
