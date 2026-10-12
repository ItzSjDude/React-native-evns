import React from 'react';
import {act, create, type ReactTestRenderer} from 'react-test-renderer';
import {apiRequest} from '../../../core/api/apiClient';
import PartyRoomPanel from '../PartyRoomPanel';
import type {PartyParticipant, PartyRoom} from '../partyService';

jest.mock('../../../core/api/apiClient', () => ({apiRequest: jest.fn()}));
const request = apiRequest as jest.Mock;

const person = (userId: string, role: PartyParticipant['role'], seatIndex: number | null): PartyParticipant => ({userId, name: userId, avatarUrl: null, role, seatIndex, active: true, muted: false, locked: false, videoEnabled: false, joinedAt: '2026-10-06', leftAt: null});
const participants = [person('host', 'HOST', 0), person('cohost', 'CO_HOST', 1), person('friend', 'MEMBER', null)];
const base = {onClose: jest.fn(), onSelect: jest.fn(), participants, requests: [], lockedSeats: [], seatCount: 8, busy: false, error: null, onAction: jest.fn(), title: 'Party',
  settings: {id: 'p1', kind: 'AUDIO', status: 'ACTIVE', title: 'Party', topic: null, category: null, language: null, interestTags: [], host: {id: 'host', name: 'host', avatarUrl: null}, participantCount: 3, scheduledStartAt: null} as PartyRoom};
let tree: ReactTestRenderer;
const labels = () => tree.root.findAll(n => typeof n.props.accessibilityLabel === 'string').map(n => n.props.accessibilityLabel as string);
const flush = async () => {await act(async () => {await Promise.resolve(); await Promise.resolve();});};
const mount = async (partyId: string, identity: string, kind: 'info' | 'studio' = 'info') => {
  await act(async () => {tree = create(<PartyRoomPanel {...base} partyId={partyId} identity={identity} panel={{kind}} />);});
  await flush();
};
const studio = (host: (path: string) => Promise<unknown>) => request.mockImplementation((path: string) => path.startsWith('/host-studio') ? host(path) : Promise.reject({status: 404}));

beforeEach(() => request.mockReset());
afterEach(() => act(() => tree?.unmount()));

test('flag off (404) hides the Studio entry for host and audience paths', async () => {
  studio(() => Promise.reject({status: 404, message: 'Host Studio is unavailable'}));
  await mount('flag-off', 'host');
  expect(labels()).not.toContain('Host Studio');
  expect(labels()).toContain('Share party');
});

test('no Organizer Pro entitlement (403) hides the host entry', async () => {
  studio(() => Promise.reject({status: 403, message: 'Organizer Pro with the Host Studio capability is required'}));
  await mount('no-pro', 'cohost');
  expect(labels()).not.toContain('Host Studio');
});

test('host and co-host get the Studio entry once the probe succeeds', async () => {
  studio(() => Promise.resolve({party_id: 'p-ok', notes: '', updated_at: null}));
  await mount('p-ok', 'cohost');
  expect(labels()).toContain('Host Studio');
});

test('audience gets an Ask entry without any manager-only request', async () => {
  studio(() => Promise.resolve([]));
  await mount('p-aud', 'friend');
  expect(labels()).toContain('Ask a question');
  expect(labels()).not.toContain('Host Studio');
  expect(request.mock.calls.some(([path]) => String(path).startsWith('/host-studio'))).toBe(false);
});

test('audience studio sheet shows the ask box and never the notes', async () => {
  studio(() => Promise.resolve([]));
  await mount('p-aud2', 'friend', 'studio');
  expect(labels()).toContain('Your question');
  expect(labels()).not.toContain('Run of show notes');
});
