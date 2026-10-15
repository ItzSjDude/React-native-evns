import {apiRequest, apiRequestPage} from '../../core/api/apiClient';
import type {CreatedVibeNote, MyVibeNote, NewVibeNote, VibeNote, VibeNoteAlertPreference, VibeNoteGeofenceCandidate} from './vibeNoteTypes';

const json = (method: string, body?: unknown) => ({auth: 'required' as const, method, ...(body === undefined ? {} : {body: JSON.stringify(body)})});

export const createVibeNote = (note: NewVibeNote) => apiRequest<CreatedVibeNote>('/vibe-notes', json('POST', note));

/** The server accepts 50 m to 25 km. */
export const getNearbyVibeNotes = (radiusMeters: number) =>
  apiRequest<VibeNote[]>(`/vibe-notes/nearby?radiusMeters=${Math.min(25000, Math.max(50, Math.round(radiusMeters)))}&limit=30`, {auth: 'required'});

export const MY_VIBES_PAGE_SIZE = 20;

/** Own active notes, including ones posted elsewhere; server returns newest first. */
export const getMyVibeNotes = (offset = 0) =>
  apiRequestPage<MyVibeNote[]>(`/vibe-notes/mine?limit=${MY_VIBES_PAGE_SIZE}&offset=${Math.max(0, Math.round(offset))}`, {auth: 'required'});

/** Marks the note opened for this viewer. Callers treat it as fire and forget. */
export const openVibeNote = (noteId: string) => apiRequest<VibeNote>(`/vibe-notes/${noteId}/open`, json('POST'));

export const deleteVibeNote = (noteId: string) => apiRequest<void>(`/vibe-notes/${noteId}`, json('DELETE'));

export const getVibeNoteAlertPreference = () =>
  apiRequest<VibeNoteAlertPreference>('/me/vibe-note-alerts', {auth: 'required'});

export const setVibeNoteAlertPreference = (enabled: boolean) =>
  apiRequest<VibeNoteAlertPreference>('/me/vibe-note-alerts', json('PUT', {enabled}));

export const getVibeNoteGeofenceCandidates = (limit: number) =>
  apiRequest<VibeNoteGeofenceCandidate[]>(`/vibe-notes/geofence-candidates?limit=${Math.max(1, Math.min(100, Math.round(limit)))}`, {auth: 'required'});
