import {apiRequest, apiRequestPage} from '../../core/api/apiClient';
import {mapNotification} from './notificationTargets';
import type {ApiNotification, AppNotification, DevicePlatform} from './types';

export const NOTIFICATIONS_PAGE_SIZE = 20;

export type NotificationsPage = {items: AppNotification[]; hasMore: boolean; nextOffset: number};

/** GET /notifications — newest first, offset paged (server default 20, max 100). */
export async function getNotificationsPage(offset = 0, limit = NOTIFICATIONS_PAGE_SIZE): Promise<NotificationsPage> {
  const page = await apiRequestPage<ApiNotification[]>(`/notifications?limit=${limit}&offset=${offset}`, {auth: 'required'});
  const items = (page.data ?? []).map(mapNotification);
  return {items, hasMore: page.meta.hasMore, nextOffset: offset + items.length};
}

/** GET /notifications/unread-count → `{count}`. */
export async function getUnreadCount(): Promise<number> {
  const result = await apiRequest<{count: number}>('/notifications/unread-count', {auth: 'required'});
  return Number(result?.count) || 0;
}

/** POST /notifications/read. Omitting `ids` marks everything read. */
export async function markNotificationsRead(ids?: string[]): Promise<void> {
  await apiRequest('/notifications/read', {
    method: 'POST',
    auth: 'required',
    body: JSON.stringify(ids && ids.length ? {ids} : {}),
  });
}

/** POST /notifications/devices — upserts on token, so re-registering is safe. */
export async function registerPushDevice(token: string, platform: DevicePlatform): Promise<void> {
  await apiRequest('/notifications/devices', {
    method: 'POST',
    auth: 'required',
    body: JSON.stringify({token, platform}),
  });
}

/** DELETE /notifications/devices/:token — needs a live session, so call it before logout. */
export async function removePushDevice(token: string): Promise<void> {
  await apiRequest(`/notifications/devices/${encodeURIComponent(token)}`, {method: 'DELETE', auth: 'required'});
}
