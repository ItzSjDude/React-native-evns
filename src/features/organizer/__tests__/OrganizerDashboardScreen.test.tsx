import React from 'react';
import {TextInput} from 'react-native';
import {act, create, type ReactTestRenderer} from 'react-test-renderer';
import OrganizerDashboardScreen from '../OrganizerDashboardScreen';
import * as svc from '../organizerService';
import type {OrganizerEvent, Workspace} from '../types';

jest.mock('../organizerService', () => ({
  listMyWorkspaces: jest.fn(), getOrganizerDashboard: jest.fn(), listOrganizerEvents: jest.fn(), getOrganizerEventStats: jest.fn(),
  listOrganizerAttendees: jest.fn(), getPayoutAccountStatus: jest.fn(), checkInOrganizerTicket: jest.fn(), listSalesThreads: jest.fn(), isRouteNotDeployed: (e: {status?: number}) => e?.status === 404,
}));
const m = svc as unknown as Record<string, jest.Mock>;

const workspace: Workspace = {id: 'w1', name: 'Acme', slug: 'acme', description: null, logoUrl: null, ticketBalance: 0, status: 'ACTIVE', role: 'OWNER', memberCount: null, verificationStatus: 'APPROVED'};
const event: OrganizerEvent = {id: 'e1', title: 'Night Run', startsAt: '2030-01-01T10:00:00Z', venue: 'Park', status: 'PUBLISHED', coverUrl: null, ticketsSold: 3, capacity: 10};

let tree: ReactTestRenderer;
const flush = async () => {await act(async () => {await Promise.resolve(); await Promise.resolve(); await Promise.resolve();});};
const text = () => tree.root.findAll(n => (n.type as unknown) === 'Text').map(n => [n.props.children].flat().join('')).join('|');
const tab = (name: string) => tree.root.findAll(n => n.props.accessibilityRole === 'tab' && n.findAll(c => (c.type as unknown) === 'Text' && c.props.children === name).length > 0)[0];
const mount = async () => {await act(async () => {tree = create(<OrganizerDashboardScreen visible onClose={() => {}} onHostEvent={() => {}} />);}); await flush();};

beforeEach(() => {
  Object.values(m).forEach(fn => 'mockReset' in fn && fn.mockReset());
  m.listMyWorkspaces.mockResolvedValue([workspace]);
  m.getPayoutAccountStatus.mockResolvedValue(null);
  m.listSalesThreads.mockResolvedValue({items: [], hasMore: false, offset: 0});
  m.getOrganizerDashboard.mockResolvedValue({ticketsSold: 3, checkedIn: 1, events: [event]});
  m.listOrganizerEvents.mockResolvedValue({items: [event], hasMore: false, offset: 0});
  m.getOrganizerEventStats.mockResolvedValue({ticketsSold: 3, checkedIn: 1, interested: 0, cancelled: 0});
});
afterEach(() => act(() => tree?.unmount()));

test('overview shows counts and no revenue or payout sections', async () => {
  await mount();
  const out = text();
  expect(out).toContain('Night Run');
  expect(out).not.toMatch(/revenue|payout/i);
  expect(tab('Payouts')).toBeUndefined();
});

test('attendees 404 hides the list and shows a notice; check-in remains available', async () => {
  m.listOrganizerAttendees.mockRejectedValue({status: 404, message: 'Not found'});
  await mount();
  await act(async () => {tab('Attendees').props.onPress();}); await flush();
  expect(m.listOrganizerAttendees).toHaveBeenCalledWith('w1', 'e1', expect.anything());
  expect(text()).toContain('attendee list is not available yet');
  expect(tree.root.findAllByType(TextInput)).toHaveLength(0);
});

test('manual check-in goes through the service and maps a refusal to a clear message', async () => {
  m.checkInOrganizerTicket.mockResolvedValue({ok: false, result: 'CANCELLED', message: 'x', attendeeName: null, checkedInAt: null});
  await mount();
  await act(async () => {tab('Check-in').props.onPress();}); await flush();
  const input = tree.root.findByType(TextInput);
  await act(async () => {input.props.onChangeText('gthr-1');});
  const submit = tree.root.findAll(n => n.props.accessibilityRole === 'button' && n.props.onPress && n.findAll(c => c.props.children === 'Check in ticket').length)[0];
  await act(async () => {await submit.props.onPress();}); await flush();
  expect(m.checkInOrganizerTicket).toHaveBeenCalledWith('w1', 'e1', 'gthr-1');
  expect(text()).toContain('cancelled or refunded');
});

test('the Sales tab hosts the sales inbox for the selected workspace', async () => {
  await mount();
  await act(async () => {tab('Sales').props.onPress();}); await flush();
  expect(m.listSalesThreads).toHaveBeenCalledWith('w1');
});
