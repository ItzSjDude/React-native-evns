import React from 'react';
import {act, create, type ReactTestRenderer} from 'react-test-renderer';
import {useOrganizerCreditsAvailable} from '../availability';
import * as svc from '../organizerService';
import type {Workspace} from '../types';

jest.mock('../organizerService', () => ({listMyWorkspaces: jest.fn()}));
const m = svc as unknown as Record<string, jest.Mock>;

const workspace = (role: Workspace['role']): Workspace =>
  ({id: 'w1', name: 'Acme', slug: 'acme', description: null, logoUrl: null, ticketBalance: 0, status: 'ACTIVE', role, memberCount: null});

let available = false;
let tree: ReactTestRenderer;
const Probe = ({active}: {active: boolean}) => {available = useOrganizerCreditsAvailable(active); return null;};
const flush = async () => {await act(async () => {await Promise.resolve(); await Promise.resolve();});};

beforeEach(() => {m.listMyWorkspaces.mockReset(); available = false;});
afterEach(() => act(() => tree?.unmount()));

test('stays hidden and does not probe while inactive, then shows once an OWNER/ADMIN workspace is found', async () => {
  m.listMyWorkspaces.mockResolvedValue([workspace('OWNER')]);
  await act(async () => {tree = create(<Probe active={false} />);});
  expect(m.listMyWorkspaces).not.toHaveBeenCalled();
  expect(available).toBe(false);
  await act(async () => {tree.update(<Probe active />);});
  await flush();
  expect(available).toBe(true);
});

test('a member-only workspace keeps the entry hidden', async () => {
  m.listMyWorkspaces.mockResolvedValue([workspace('MEMBER')]);
  await act(async () => {tree = create(<Probe active />);});
  await flush();
  expect(available).toBe(false);
});

test('a failed probe (e.g. 404 when this API is not deployed yet) leaves the entry hidden', async () => {
  m.listMyWorkspaces.mockRejectedValue({status: 404});
  await act(async () => {tree = create(<Probe active />);});
  await flush();
  expect(available).toBe(false);
});
