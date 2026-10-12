import React from 'react';
import {TextInput} from 'react-native';
import {act, create, type ReactTestRenderer} from 'react-test-renderer';
import OrganizerCreditsScreen from '../OrganizerCreditsScreen';
import * as svc from '../organizerService';
import type {CreditOverview, Workspace} from '../types';

jest.mock('../organizerService', () => ({listMyWorkspaces: jest.fn(), getCreditOverview: jest.fn()}));
const m = svc as unknown as Record<string, jest.Mock>;

const workspace = (id: string, role: Workspace['role'], name = id): Workspace =>
  ({id, name, slug: id, description: null, logoUrl: null, ticketBalance: 0, status: 'ACTIVE', role, memberCount: null});

const overview = (patch: Partial<CreditOverview> = {}): CreditOverview => ({balance: 40, ledger: [], recentPurchases: [], ...patch});

let tree: ReactTestRenderer;
const flush = async () => {await act(async () => {await Promise.resolve(); await Promise.resolve();});};
const match = (n: {props: Record<string, unknown>} | null, label: string) => n?.props?.accessibilityLabel === label;
const all = (label: string) => tree.root.findAll(n => match(n, label) && !match(n.parent, label));
const has = (label: string) => all(label).length > 0;
const press = async (label: string) => {await act(async () => {await all(label)[0].props.onPress();}); await flush();};
const text = () => tree.root.findAll(n => (n.type as unknown) === 'Text').map(n => [n.props.children].flat().join('')).join('|');

const mount = async (visible = true) => {
  await act(async () => {tree = create(<OrganizerCreditsScreen visible={visible} onClose={() => {}} />);});
  await flush();
};

beforeEach(() => {m.listMyWorkspaces.mockReset(); m.getCreditOverview.mockReset();});
afterEach(() => act(() => tree?.unmount()));

test('only OWNER/ADMIN workspaces are listed and credits load for the first one', async () => {
  m.listMyWorkspaces.mockResolvedValue([workspace('w1', 'MEMBER'), workspace('w2', 'OWNER', 'Acme'), workspace('w3', 'ADMIN', 'Beta')]);
  m.getCreditOverview.mockResolvedValue(overview({balance: 12}));
  await mount();
  expect(has('w1')).toBe(false);
  expect(has('Acme')).toBe(true);
  expect(has('Beta')).toBe(true);
  expect(m.getCreditOverview).toHaveBeenCalledWith('w2');
  expect(text()).toContain('12 ticket credits');
});

test('no workspace to manage shows the empty state and never calls the credits endpoint', async () => {
  m.listMyWorkspaces.mockResolvedValue([workspace('w1', 'MEMBER')]);
  await mount();
  expect(text()).toContain('No workspaces to manage');
  expect(m.getCreditOverview).not.toHaveBeenCalled();
});

test('a workspace list failure shows an error with retry', async () => {
  m.listMyWorkspaces.mockRejectedValueOnce({message: 'Network down'});
  await mount();
  expect(text()).toContain('Network down');
  m.listMyWorkspaces.mockResolvedValueOnce([workspace('w1', 'OWNER', 'Acme')]);
  m.getCreditOverview.mockResolvedValue(overview());
  await press('Retry');
  expect(has('Acme')).toBe(false); // only one workspace, so no picker — balance card still confirms the load
  expect(text()).toContain('40 ticket credits');
});

test('switching workspaces refetches credits for the newly selected one', async () => {
  m.listMyWorkspaces.mockResolvedValue([workspace('w1', 'OWNER', 'Acme'), workspace('w2', 'ADMIN', 'Beta')]);
  m.getCreditOverview.mockResolvedValueOnce(overview({balance: 5}));
  await mount();
  expect(text()).toContain('5 ticket credits');
  m.getCreditOverview.mockResolvedValueOnce(overview({balance: 99}));
  await press('Beta');
  expect(m.getCreditOverview).toHaveBeenLastCalledWith('w2');
  expect(text()).toContain('99 ticket credits');
});

test('ledger and purchase rows render read-only history with no purchase controls', async () => {
  m.listMyWorkspaces.mockResolvedValue([workspace('w1', 'OWNER', 'Acme')]);
  m.getCreditOverview.mockResolvedValue({
    balance: 40,
    ledger: [{id: 'l1', delta: -5, balanceAfter: 40, reason: 'ISSUE', createdAt: '2026-01-01T00:00:00Z'}],
    recentPurchases: [{id: 'p1', quantity: 100, amountMinor: 12500, currency: 'INR', status: 'PAID', packKey: 'starter', createdAt: '2026-01-01T00:00:00Z', paidAt: null}],
  });
  await mount();
  expect(text()).toContain('Issued');
  expect(text()).toContain('-5');
  expect(text()).toContain('100 credits');
  expect(text()).toContain('Paid');
  expect(text()).not.toMatch(/buy/i);
  expect(tree.root.findAllByType(TextInput)).toHaveLength(0);
});

test('an overview failure for the selected workspace shows an error with retry', async () => {
  m.listMyWorkspaces.mockResolvedValue([workspace('w1', 'OWNER', 'Acme')]);
  m.getCreditOverview.mockRejectedValueOnce({message: 'Forbidden'});
  await mount();
  expect(text()).toContain('Forbidden');
  m.getCreditOverview.mockResolvedValueOnce(overview({balance: 7}));
  await press('Retry');
  expect(text()).toContain('7 ticket credits');
});

test('empty ledger and purchases show their own empty copy instead of blank cards', async () => {
  m.listMyWorkspaces.mockResolvedValue([workspace('w1', 'OWNER', 'Acme')]);
  m.getCreditOverview.mockResolvedValue(overview());
  await mount();
  expect(text()).toContain('No ledger activity yet.');
  expect(text()).toContain('No purchases yet.');
});
