import {apiRequest} from '../../../core/api/apiClient';
import {createVibeNote, deleteVibeNote, getNearbyVibeNotes, openVibeNote} from '../vibeNoteService';

jest.mock('../../../core/api/apiClient', () => ({apiRequest: jest.fn().mockResolvedValue(undefined)}));

const request = apiRequest as jest.Mock;

test('posts a note with its coordinates and lifetime', async () => {
  await createVibeNote({body: 'hi', lat: 1, lng: 2, expiresInMinutes: 60});
  expect(request).toHaveBeenLastCalledWith('/vibe-notes', {auth: 'required', method: 'POST', body: JSON.stringify({body: 'hi', lat: 1, lng: 2, expiresInMinutes: 60})});
});

test('lists nearby notes within the server radius bounds', async () => {
  await getNearbyVibeNotes(2000);
  expect(request).toHaveBeenLastCalledWith('/vibe-notes/nearby?radiusMeters=2000&limit=30', {auth: 'required'});
  await getNearbyVibeNotes(10);
  expect(request).toHaveBeenLastCalledWith('/vibe-notes/nearby?radiusMeters=50&limit=30', {auth: 'required'});
  await getNearbyVibeNotes(90000);
  expect(request).toHaveBeenLastCalledWith('/vibe-notes/nearby?radiusMeters=25000&limit=30', {auth: 'required'});
});

test('opens and deletes a note by id', async () => {
  await openVibeNote('n1');
  expect(request).toHaveBeenLastCalledWith('/vibe-notes/n1/open', {auth: 'required', method: 'POST'});
  await deleteVibeNote('n1');
  expect(request).toHaveBeenLastCalledWith('/vibe-notes/n1', {auth: 'required', method: 'DELETE'});
});
