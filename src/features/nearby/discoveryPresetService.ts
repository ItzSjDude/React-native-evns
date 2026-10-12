import {apiRequest} from '../../core/api/apiClient';
import type {DiscoveryPreset, NewDiscoveryPreset} from './types';

/** All Plus only: a free account gets 403 PLUS_REQUIRED. The server allows 10 presets, names unique per user. */
const json = (method: string, body?: unknown) => ({auth: 'required' as const, method, ...(body === undefined ? {} : {body: JSON.stringify(body)})});

export const NAME_MAX_LENGTH = 40;

export const listDiscoveryPresets = () => apiRequest<DiscoveryPreset[]>('/me/discovery-presets', {auth: 'required'});

export const createDiscoveryPreset = (preset: NewDiscoveryPreset) => apiRequest<DiscoveryPreset>('/me/discovery-presets', json('POST', preset));

export const updateDiscoveryPreset = (id: string, patch: Partial<NewDiscoveryPreset>) =>
  apiRequest<DiscoveryPreset>(`/me/discovery-presets/${encodeURIComponent(id)}`, json('PATCH', patch));

export const deleteDiscoveryPreset = (id: string) => apiRequest<{deleted: true}>(`/me/discovery-presets/${encodeURIComponent(id)}`, json('DELETE'));
