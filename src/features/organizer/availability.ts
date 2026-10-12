import {useEffect, useState} from 'react';
import {listMyWorkspaces} from './organizerService';

/**
 * Whether to show the organizer ticket-credits entry point.
 *
 * Hidden until a probe of `GET /workspaces` confirms the caller owns/admins at least one
 * workspace; any failure (including a 404 if this API isn't deployed to this environment yet)
 * leaves it hidden instead of surfacing an error from a row the user never asked to open.
 */
export function useOrganizerCreditsAvailable(active: boolean): boolean {
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    if (!active) return;
    let mounted = true;
    listMyWorkspaces()
      .then(workspaces => {if (mounted) setAvailable(workspaces.some(w => w.role === 'OWNER' || w.role === 'ADMIN'));})
      .catch(() => {});
    return () => {mounted = false;};
  }, [active]);
  return available;
}
