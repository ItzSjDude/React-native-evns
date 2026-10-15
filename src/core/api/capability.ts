import {useEffect, useState} from 'react';

/**
 * Capability probe for routes the backend may not have deployed yet (docs/TASKS.md F-04.6).
 *
 * `check()` runs the request once per session: a 404 means "not deployed" and is cached as `false`, success is
 * cached as `true`. Any other failure (offline, 5xx, 401) is not cached and resolves `false` so the entry stays
 * hidden, and the next `check()` probes again. Call `resetCapabilities()` on sign-out.
 */
export type CapabilityProbe = {check: () => Promise<boolean>; peek: () => boolean | null; reset: () => void};

const probes = new Set<CapabilityProbe>();

export function createCapabilityProbe(request: () => Promise<unknown>): CapabilityProbe {
  let cached: boolean | null = null;
  let inFlight: Promise<boolean> | null = null;
  const probe: CapabilityProbe = {
    check() {
      if (cached !== null) return Promise.resolve(cached);
      inFlight ??= request().then(
        () => (cached = true),
        (error: {status?: number}) => {
          if (error?.status === 404) cached = false;
          return false;
        },
      ).finally(() => {inFlight = null;});
      return inFlight;
    },
    peek: () => cached,
    reset() {cached = null; inFlight = null;},
  };
  probes.add(probe);
  return probe;
}

export const resetCapabilities = () => probes.forEach(probe => probe.reset());

/** True once `probe` confirms the route exists; false while `active` is false, pending, or unavailable. */
export function useCapability(probe: CapabilityProbe, active = true): boolean {
  const [available, setAvailable] = useState(probe.peek() === true);
  useEffect(() => {
    if (!active) return;
    let mounted = true;
    probe.check().then(ok => {if (mounted) setAvailable(ok);});
    return () => {mounted = false;};
  }, [probe, active]);
  return active && available;
}
