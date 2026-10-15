import React from 'react';
import {Text} from 'react-native';
import {act, create, type ReactTestRenderer} from 'react-test-renderer';
import OrganizerSalesInbox from '../OrganizerSalesInbox';
import * as svc from '../organizerService';

jest.mock('../organizerService', () => ({listSalesThreads: jest.fn()}));
jest.mock('../OrganizerCreditsScreen', () => () => null);
jest.mock('../SalesActionBar', () => () => null);
jest.mock('../../messages', () => ({DirectConversation: (props: {contactName: string; kind: string}) => {
  const {Text: T} = jest.requireActual('react-native');
  return <T>{`CHAT ${props.contactName} ${props.kind}`}</T>;
}}));
jest.mock('@shopify/flash-list', () => {
  const {View} = jest.requireActual('react-native');
  return {FlashList: ({data, renderItem, ListEmptyComponent}: {data: unknown[]; renderItem: (a: {item: unknown; index: number}) => React.ReactNode; ListEmptyComponent: React.ReactNode}) =>
    <View>{data.length ? data.map((item, index) => <View key={index}>{renderItem({item, index})}</View>) : ListEmptyComponent}</View>};
});
const m = svc as unknown as Record<string, jest.Mock>;

const thread = {id: 'c1', status: 'OPEN', eventId: 'e1', eventTitle: 'Night Run', buyerName: 'Asha', buyerAvatarUrl: null, unreadCount: 2, lastActivityAt: '2026-10-01T10:00:00Z', lastMessagePreview: 'Hi, is this open?'};
let tree: ReactTestRenderer;
const flush = async () => {await act(async () => {await Promise.resolve(); await Promise.resolve(); await Promise.resolve();});};
const text = () => tree.root.findAllByType(Text).map(n => [n.props.children].flat().join('')).join('|');
const mount = async (onAccessRevoked?: () => void) => {await act(async () => {tree = create(<OrganizerSalesInbox workspaceId="w1" onAccessRevoked={onAccessRevoked} />);}); await flush();};

beforeEach(() => {jest.clearAllMocks(); m.listSalesThreads.mockResolvedValue({items: [thread], hasMore: false, offset: 0});});
afterEach(() => act(() => tree?.unmount()));

test('lists buyer, event, status and last message', async () => {
  await mount();
  expect(m.listSalesThreads).toHaveBeenCalledWith('w1');
  const out = text();
  expect(out).toContain('Asha'); expect(out).toContain('Night Run'); expect(out).toContain('2 new'); expect(out).toContain('Hi, is this open?');
});

test('opening a thread shows the shared conversation for that buyer', async () => {
  await mount();
  await act(async () => {tree.root.findAll(n => n.props.accessibilityLabel?.startsWith('Asha') && typeof n.type !== 'string')[0].props.onPress();});
  expect(text()).toContain('CHAT Asha EVENT');
});

test('empty, unavailable (404) and failed states', async () => {
  m.listSalesThreads.mockResolvedValue({items: [], hasMore: false, offset: 0});
  await mount();
  expect(text()).toContain('No buyer conversations yet');
  await act(() => tree.unmount());
  m.listSalesThreads.mockRejectedValue({status: 404, message: 'x'});
  await mount();
  expect(text()).toContain('not available');
  await act(() => tree.unmount());
  m.listSalesThreads.mockRejectedValue({status: 500, message: 'Boom'});
  await mount();
  expect(text()).toContain('Boom');
});

test('a 403 reports revoked access', async () => {
  m.listSalesThreads.mockRejectedValue({status: 403});
  const onAccessRevoked = jest.fn();
  await mount(onAccessRevoked);
  expect(onAccessRevoked).toHaveBeenCalled();
});
