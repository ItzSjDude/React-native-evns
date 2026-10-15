import React from 'react';
import {Text, TextInput} from 'react-native';
import {act, create, type ReactTestRenderer} from 'react-test-renderer';
import SalesActionBar from '../SalesActionBar';
import * as svc from '../organizerService';
import {showDialog} from '../../../components/Dialog';
import type {ApiPaymentCard} from '../../messages';
import type {SalesThread} from '../types';

jest.mock('../organizerService', () => ({getOrganizerEventPrice: jest.fn(), sharePaymentDetails: jest.fn(), confirmPaymentCard: jest.fn(), cancelPaymentCard: jest.fn(), shareTicket: jest.fn()}));
jest.mock('../../../components/Dialog', () => ({showDialog: jest.fn()}));
const m = svc as unknown as Record<string, jest.Mock>;
const dialog = showDialog as jest.Mock;

const thread: SalesThread = {id: 'c1', status: 'OPEN', eventId: 'e1', eventTitle: 'Night Run', buyerName: 'Asha', buyerAvatarUrl: null, unreadCount: 0, lastActivityAt: '2026-10-01T10:00:00Z', lastMessagePreview: null};
const card = (status: ApiPaymentCard['status'], id = 'card1'): ApiPaymentCard => ({
  id, amount_minor: 49900, currency: 'INR', method: 'UPI', payee_name: null, upi_id: 'neon@okhdfc', account_number: null, ifsc: null,
  payment_link: null, qr_image_url: null, note: null, status, expires_at: null, created_at: '2026-10-01T10:00:00Z',
});

let tree: ReactTestRenderer;
const onCard = jest.fn();
const refresh = jest.fn();
const onBuyCredits = jest.fn();
const flush = async () => {await act(async () => {await Promise.resolve(); await Promise.resolve(); await Promise.resolve();});};
const mount = async (cards: ApiPaymentCard[] = [], eventId: string | null | undefined = 'e1') => {
  await act(async () => {tree = create(<SalesActionBar workspaceId="w1" thread={thread} cards={cards} eventId={eventId} onCard={onCard} refresh={refresh} onBuyCredits={onBuyCredits} />);});
  await flush();
};
const text = () => tree.root.findAllByType(Text).map(n => [n.props.children].flat().join('')).join('|');
const btn = (label: string) => tree.root.findAll(n => n.props.accessibilityLabel === label && n.props.accessibilityRole === 'button' && typeof n.type !== 'string')[0];
const press = async (label: string) => {await act(async () => {btn(label).props.onPress();}); await flush();};
const type = (label: string, value: string) => act(() => {tree.root.findAllByType(TextInput).find(n => n.props.accessibilityLabel === label)!.props.onChangeText(value);});
const dialogPress = async (index: number) => {await act(async () => {dialog.mock.calls.at(-1)[2][index].onPress();}); await flush();};

beforeEach(() => {
  jest.clearAllMocks();
  m.getOrganizerEventPrice.mockResolvedValue({isPaid: true, priceMinor: 49900, currency: 'INR'});
});
afterEach(() => act(() => tree?.unmount()));

test('shows which event the thread is for, with the event price', async () => {
  await mount();
  expect(text()).toContain('Night Run');
  expect(text()).toMatch(/499/);
  expect(m.getOrganizerEventPrice).toHaveBeenCalledWith('w1', 'e1');
});

test('no card yet: only Share payment details is live, ticket is not', async () => {
  await mount();
  expect(btn('Share payment details').props.accessibilityState.disabled).toBe(false);
  expect(btn('Share ticket').props.accessibilityState.disabled).toBe(true);
  expect(btn('Confirm payment')).toBeUndefined();
});

test('shares UPI details with the event price as amount and clears the form', async () => {
  m.sharePaymentDetails.mockResolvedValue(card('SHARED'));
  await mount();
  await press('Share payment details');
  await type('UPI ID', 'neon@okhdfc');
  await press('Send payment details');
  expect(m.sharePaymentDetails).toHaveBeenCalledWith('c1', {amountMinor: 49900, currency: 'INR', method: 'UPI', upiId: 'neon@okhdfc'});
  expect(onCard).toHaveBeenCalledWith(expect.objectContaining({id: 'card1'}));
  expect(text()).toContain('Payment details shared');
});

test('rejects a non-https link client-side without calling the API', async () => {
  await mount();
  await press('Share payment details');
  await act(async () => {tree.root.findAll(n => n.props.accessibilityRole === 'tab' && n.findAllByType(Text).some(t => t.props.children === 'Link'))[0].props.onPress();});
  await type('Payment link (https)', 'http://pay.example.com');
  await press('Send payment details');
  expect(m.sharePaymentDetails).not.toHaveBeenCalled();
  expect(text()).toContain('https://');
});

test.each(['SHARED', 'PAID_CLAIMED'] as const)('a %s card enables Confirm, Cancel and Share ticket', async status => {
  await mount([card(status)]);
  expect(btn('Confirm payment').props.accessibilityState.disabled).toBe(false);
  expect(btn('Cancel request')).toBeDefined();
  expect(btn('Share ticket').props.accessibilityState.disabled).toBe(false);
  expect(btn('Share payment details')).toBeUndefined();
});

test('a confirmed card keeps Share ticket live and drops Confirm and Cancel; a cancelled card does not allow issuing', async () => {
  await mount([card('CONFIRMED')]);
  expect(btn('Confirm payment')).toBeUndefined();
  expect(btn('Share ticket').props.accessibilityState.disabled).toBe(false);
  await act(() => tree.unmount());
  await mount([card('CANCELLED')]);
  expect(btn('Share ticket').props.accessibilityState.disabled).toBe(true);
  expect(btn('Share payment details')).toBeDefined();
});

test('confirm calls the API and merges the updated card', async () => {
  m.confirmPaymentCard.mockResolvedValue(card('CONFIRMED'));
  await mount([card('PAID_CLAIMED')]);
  await press('Confirm payment');
  expect(m.confirmPaymentCard).toHaveBeenCalledWith('card1');
  expect(onCard).toHaveBeenCalledWith(expect.objectContaining({status: 'CONFIRMED'}));
});

test('cancel asks first, then cancels', async () => {
  m.cancelPaymentCard.mockResolvedValue(card('CANCELLED'));
  await mount([card('SHARED')]);
  await press('Cancel request');
  expect(m.cancelPaymentCard).not.toHaveBeenCalled();
  await dialogPress(1);
  expect(m.cancelPaymentCard).toHaveBeenCalledWith('card1');
});

test('issuing names the event, then sends the open card id', async () => {
  m.shareTicket.mockResolvedValue({});
  await mount([card('SHARED')]);
  await press('Share ticket');
  expect(dialog.mock.calls[0][0]).toContain('Night Run');
  expect(m.shareTicket).not.toHaveBeenCalled();
  await dialogPress(1);
  expect(m.shareTicket).toHaveBeenCalledWith('c1', {paymentCardId: 'card1'});
  expect(refresh).toHaveBeenCalled();
});

test('a free event can issue without any card', async () => {
  m.getOrganizerEventPrice.mockResolvedValue({isPaid: false, priceMinor: 0, currency: 'INR'});
  m.shareTicket.mockResolvedValue({});
  await mount();
  expect(btn('Share ticket').props.accessibilityState.disabled).toBe(false);
  await press('Share ticket'); await dialogPress(1);
  expect(m.shareTicket).toHaveBeenCalledWith('c1', {});
});

test('402 offers the credits screen', async () => {
  m.shareTicket.mockRejectedValue({status: 402, code: 'NO_TICKET_CREDITS'});
  await mount([card('SHARED')]);
  await press('Share ticket'); await dialogPress(1);
  expect(text()).toContain('out of ticket credits');
  await press('Buy ticket credits');
  expect(onBuyCredits).toHaveBeenCalled();
});

test('409 shows the reason and re-reads the thread', async () => {
  m.shareTicket.mockRejectedValue({status: 409, message: 'This event is sold out'});
  await mount([card('SHARED')]);
  await press('Share ticket'); await dialogPress(1);
  expect(text()).toContain('This event is sold out');
  expect(refresh).toHaveBeenCalled();
});

test('429 is reported as rate limiting', async () => {
  m.confirmPaymentCard.mockRejectedValue({status: 429, code: 'RATE_LIMITED'});
  await mount([card('SHARED')]);
  await press('Confirm payment');
  expect(text()).toContain('Too many requests');
});

test('when the thread headline moved to another event, actions are disabled and a warning shows', async () => {
  await mount([card('SHARED')], 'e2');
  expect(text()).toContain('different event');
  expect(btn('Confirm payment').props.accessibilityState.disabled).toBe(true);
  expect(btn('Share ticket').props.accessibilityState.disabled).toBe(true);
  expect(m.getOrganizerEventPrice).not.toHaveBeenCalled();
});
