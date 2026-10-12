import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import {apiRequest} from '../../../core/api/apiClient';
import {OnlineDot, clearPresenceCache, requestPresence, usePresence} from '../presence';

jest.mock('../../../core/api/apiClient', () => ({apiRequest: jest.fn()}));
const request = apiRequest as jest.Mock;
const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

beforeEach(() => { jest.clearAllMocks(); clearPresenceCache(); });

test('batches ids from separate callers into one request and caches for the TTL', async () => {
  request.mockResolvedValue({presence: {a: {online: true, lastSeenAt: null}, b: {online: false, lastSeenAt: '2026-09-12T09:14:22.000Z'}}});
  await Promise.all([requestPresence(['a']), requestPresence(['b', 'a'])]);
  expect(request).toHaveBeenCalledTimes(1);
  expect(request).toHaveBeenCalledWith('/presence?userIds=a,b', {auth: 'required'});
  await requestPresence(['a', 'b']);
  expect(request).toHaveBeenCalledTimes(1);
});

test('hook: hidden users have no last seen, omitted users are unknown', async () => {
  request.mockResolvedValue({presence: {hidden: {online: false, lastSeenAt: null}, on: {online: true, lastSeenAt: 'x'}}});
  let result: Record<string, any> = {};
  const Probe = () => { result = usePresence(['hidden', 'on', 'stranger']); return null; };
  let r: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => { r = ReactTestRenderer.create(<Probe />); });
  await ReactTestRenderer.act(async () => { await sleep(80); });
  expect(result.hidden).toEqual({online: false, lastSeenAt: null});
  expect(result.on).toEqual({online: true, lastSeenAt: null});
  expect(result.stranger).toBeUndefined();
  await ReactTestRenderer.act(async () => { r!.unmount(); });
});

test('failed fetch does not throw or poison the cache', async () => {
  request.mockRejectedValueOnce({status: 500, message: 'x'});
  await requestPresence(['z']);
  request.mockResolvedValue({presence: {z: {online: true, lastSeenAt: null}}});
  await requestPresence(['z']);
  expect(request).toHaveBeenCalledTimes(2);
});

test('OnlineDot has an accessible label', async () => {
  let r: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => { r = ReactTestRenderer.create(<OnlineDot online />); });
  expect(r!.root.findByProps({accessibilityLabel: 'Online'})).toBeTruthy();
});
