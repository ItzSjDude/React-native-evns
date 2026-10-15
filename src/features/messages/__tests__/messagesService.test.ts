import {apiRequest} from '../../../core/api/apiClient';
import {isOwnMessage, messageText, relativeTime} from '../conversationPresentation';
import {getConversationDetail, markConversationRead, markPaymentCardPaid, toConversation} from '../messagesService';
import type {ApiInboxConversation} from '../types';

jest.mock('../../../core/api/apiClient', () => ({apiRequest: jest.fn()}));
const request = apiRequest as jest.Mock;

const row = (overrides: Partial<ApiInboxConversation> = {}): ApiInboxConversation => ({
  id: 'c1', kind: 'DIRECT', status: 'OPEN', workspace_id: null, event_id: null, user_id: null,
  participant_a_id: 'me', participant_b_id: 'u2', last_message_at: '2026-10-07T10:00:00.000Z',
  created_at: '2026-10-01T10:00:00.000Z', event_title: null, event_starts_at: null,
  workspace_name: null, workspace_logo_url: null, other_user_id: 'u2', other_user_name: 'Ananya Sharma',
  other_user_avatar_url: 'https://cdn/a.png', unread_count: 3, ...overrides,
});

beforeEach(() => { jest.resetAllMocks(); });

test('maps the direct participant and the per-user inbox state', () => {
  expect(toConversation(row({folder_id: 'f1', folder_name: 'Work', is_pinned: true, is_archived: false}))).toEqual({
    type: 'CONVERSATION', id: 'c1', kind: 'DIRECT', status: 'OPEN', title: 'Ananya Sharma', avatarUrl: 'https://cdn/a.png',
    contactId: 'u2', unreadCount: 3, lastActivityAt: '2026-10-07T10:00:00.000Z',
    lastMessageAt: '2026-10-07T10:00:00.000Z', lastMessage: null,
    folderId: 'f1', folderName: 'Work', pinned: true, archived: false,
  });
  // Plain /conversations rows carry no inbox columns.
  expect(toConversation(row())).toMatchObject({folderId: null, folderName: null, pinned: false, archived: false});
});

test('maps event threads to the event and organiser, and tolerates missing values', () => {
  const event = toConversation(row({
    kind: 'EVENT', other_user_id: null, other_user_name: null, other_user_avatar_url: null,
    event_title: 'Sunset Run', workspace_name: 'Run Club', workspace_logo_url: 'https://cdn/logo.png',
    unread_count: '2', last_message_at: null,
  }));
  expect(event).toMatchObject({title: 'Sunset Run', avatarUrl: 'https://cdn/logo.png', contactId: null, unreadCount: 2, lastActivityAt: '2026-10-01T10:00:00.000Z', lastMessageAt: null});
  expect(toConversation(row({other_user_name: '  ', other_user_avatar_url: null, unread_count: 0})))
    .toMatchObject({title: 'Hiva user', avatarUrl: null, unreadCount: 0});
});

test('marks a conversation read with the explicit read endpoint', async () => {
  request.mockResolvedValue({read: true});
  await markConversationRead('c 1');
  expect(request).toHaveBeenCalledWith('/conversations/c%201/read', {auth: 'required', method: 'POST'});
});

test('formats message ownership, previews and relative times', () => {
  expect(isOwnMessage({sender_id: 'me', sender_role: 'ATTENDEE'}, 'DIRECT', 'u2')).toBe(true);
  expect(isOwnMessage({sender_id: 'u2', sender_role: 'ATTENDEE'}, 'DIRECT', 'u2')).toBe(false);
  expect(isOwnMessage({sender_id: 'staff', sender_role: 'WORKSPACE'}, 'EVENT', null)).toBe(false);
  expect(isOwnMessage({sender_id: 'me', sender_role: 'ATTENDEE'}, 'EVENT', null)).toBe(true);
  expect(messageText({type: 'VOICE', body: null})).toBe('Voice note');
  expect(messageText({type: 'TEXT', body: 'hi', deleted_at: '2026-10-07T00:00:00Z'})).toBe('Message deleted');

  const now = new Date(2026, 9, 7, 12, 0);
  expect(relativeTime(new Date(2026, 9, 7, 11, 59, 30).toISOString(), now)).toBe('now');
  expect(relativeTime(new Date(2026, 9, 7, 11, 45).toISOString(), now)).toBe('15m');
  expect(relativeTime(new Date(2026, 9, 7, 9, 0).toISOString(), now)).toBe('3h');
  expect(relativeTime(new Date(2026, 9, 6, 22, 0).toISOString(), now)).toBe('Yesterday');
  expect(relativeTime('not a date', now)).toBe('');
});

test('loads the thread detail with its side and payment cards', async () => {
  request.mockResolvedValue({id: 'c 1', kind: 'EVENT', status: 'OPEN', viewerSide: 'ATTENDEE', paymentCards: []});
  await expect(getConversationDetail('c 1')).resolves.toMatchObject({viewerSide: 'ATTENDEE', paymentCards: []});
  expect(request).toHaveBeenCalledWith('/conversations/c%201', {auth: 'required'});
});

test('marks a payment card paid with an optional trimmed reference, and with an empty body otherwise', async () => {
  request.mockResolvedValue({id: 'card 1', status: 'PAID_CLAIMED'});

  await expect(markPaymentCardPaid('card 1')).resolves.toMatchObject({status: 'PAID_CLAIMED'});
  expect(request).toHaveBeenLastCalledWith('/payment-cards/card%201/mark-paid', {auth: 'required', method: 'POST', body: '{}'});

  await markPaymentCardPaid('card 1', '   ');
  expect(request).toHaveBeenLastCalledWith('/payment-cards/card%201/mark-paid', {auth: 'required', method: 'POST', body: '{}'});

  await markPaymentCardPaid('card 1', '  UPI-1234  ');
  expect(request).toHaveBeenLastCalledWith('/payment-cards/card%201/mark-paid', {auth: 'required', method: 'POST', body: '{"reference":"UPI-1234"}'});

  await markPaymentCardPaid('card1', 'x'.repeat(200));
  expect(JSON.parse(request.mock.calls.at(-1)?.[1].body).reference).toHaveLength(120);
});

test('surfaces a 409 from mark-paid to the caller without retrying', async () => {
  request.mockRejectedValueOnce({status: 409, message: 'This payment card is no longer awaiting payment'});
  await expect(markPaymentCardPaid('card1')).rejects.toMatchObject({status: 409});
  expect(request).toHaveBeenCalledTimes(1);
});
