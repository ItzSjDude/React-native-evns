import React from 'react';
import {act, create, type ReactTestRenderer} from 'react-test-renderer';
import {createCapabilityProbe, resetCapabilities, useCapability} from '../capability';

describe('createCapabilityProbe', () => {
  it('caches success so the route is probed once per session', async () => {
    const request = jest.fn().mockResolvedValue({});
    const probe = createCapabilityProbe(request);
    expect(await probe.check()).toBe(true);
    expect(await probe.check()).toBe(true);
    expect(request).toHaveBeenCalledTimes(1);
    expect(probe.peek()).toBe(true);
  });

  it('caches a 404 as unavailable', async () => {
    const request = jest.fn().mockRejectedValue({status: 404});
    const probe = createCapabilityProbe(request);
    expect(await probe.check()).toBe(false);
    expect(await probe.check()).toBe(false);
    expect(request).toHaveBeenCalledTimes(1);
    expect(probe.peek()).toBe(false);
  });

  it('does not cache other failures; the next check probes again', async () => {
    const request = jest.fn().mockRejectedValueOnce({status: 503}).mockResolvedValueOnce({});
    const probe = createCapabilityProbe(request);
    expect(await probe.check()).toBe(false);
    expect(probe.peek()).toBeNull();
    expect(await probe.check()).toBe(true);
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('shares one in-flight request and re-probes after resetCapabilities', async () => {
    const request = jest.fn().mockResolvedValue({});
    const probe = createCapabilityProbe(request);
    await Promise.all([probe.check(), probe.check()]);
    expect(request).toHaveBeenCalledTimes(1);
    resetCapabilities();
    expect(probe.peek()).toBeNull();
    await probe.check();
    expect(request).toHaveBeenCalledTimes(2);
  });
});

describe('useCapability', () => {
  let value = false;
  let tree: ReactTestRenderer;
  const Probe = ({probe, active}: {probe: ReturnType<typeof createCapabilityProbe>; active: boolean}) => {value = useCapability(probe, active); return null;};
  afterEach(() => act(() => tree?.unmount()));

  it('is false while inactive without probing, then true once the route exists', async () => {
    const request = jest.fn().mockResolvedValue({});
    const probe = createCapabilityProbe(request);
    await act(async () => {tree = create(<Probe probe={probe} active={false} />);});
    expect(request).not.toHaveBeenCalled();
    expect(value).toBe(false);
    await act(async () => {tree.update(<Probe probe={probe} active />);});
    expect(value).toBe(true);
  });

  it('stays hidden when the route 404s', async () => {
    const probe = createCapabilityProbe(jest.fn().mockRejectedValue({status: 404}));
    await act(async () => {tree = create(<Probe probe={probe} active />);});
    expect(value).toBe(false);
  });
});
