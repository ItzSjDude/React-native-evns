import {useEffect, useState} from 'react';
import {createCapabilityProbe, useCapability} from '../../core/api/capability';
import {getOrganizerDashboard, listMyWorkspaces} from './organizerService';

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

let dashboardWorkspaceId = '';
const dashboardProbe = createCapabilityProbe(() => getOrganizerDashboard(dashboardWorkspaceId));

/** Whether `GET /workspaces/:id/organizer-dashboard` is deployed (F-04.6); hidden on 404 and until a workspace is known. */
export function useOrganizerDashboardAvailable(workspaceId: string | undefined): boolean {
  if (workspaceId) dashboardWorkspaceId = workspaceId;
  return useCapability(dashboardProbe, !!workspaceId);
}
