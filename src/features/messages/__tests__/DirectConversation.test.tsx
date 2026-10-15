/* eslint-disable no-script-url -- the unsafe URLs below are the test input */
import React from 'react';
import {Linking, Text} from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import {apiRequest} from '../../../core/api/apiClient';
import {subscribeRealtime} from '../../../core/realtime/subscribeRealtime';
import {showDialog} from '../../../components/Dialog';
import DirectConversation from '../DirectConversation';
import {getDirectMessages, sendDirectMessage} from '../directService';
import {getConversationDetail, markConversationRead, markPaymentCardPaid} from '../messagesService';
import type {ApiMessage, ApiPaymentCard} from '../types';
import {resetMessagesRealtime} from '../useMessagesRealtime';

jest.mock('../../../core/api/apiClient', () => ({apiRequest: jest.fn(), getRealtimeAccessToken: jest.fn()}));
jest.mock('../../../core/realtime/subscribeRealtime', () => ({subscribeRealtime: jest.fn()}));
jest.mock('../directService', () => ({getDirectMessages: jest.fn(), sendDirectMessage: jest.fn()}));
jest.mock('../messagesService', () => ({markConversationRead: jest.fn(), getConversationDetail: jest.fn(), markPaymentCardPaid: jest.fn()}));
jest.mock('../../../components/Dialog', () => ({showDialog: jest.fn()}));
jest.mock('react-native-safe-area-context', () => {
  const {View} = jest.requireActual('react-native');
  return {SafeAreaView: View};
});

type Options = Parameters<typeof subscribeRealtime>[0];
const subscribe = subscribeRealtime as jest.Mock;
const me = apiRequest as jest.Mock;
const fetchPage = getDirectMessages as jest.Mock;
const send = sendDirectMessage as jest.Mock;
const markRead = markConversationRead as jest.Mock;
const detail = getConversationDetail as jest.Mock;
const claim = markPaymentCardPaid as jest.Mock;
const dialog = showDialog as jest.Mock;
let sockets: {options: Options; stop: jest.Mock; send: jest.Mock}[];

const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
const row = (overrides: Partial<ApiMessage> = {}): ApiMessage => ({
  id: 'm1', conversation_id: 'c1', sender_id: 'u2', sender_role: 'ATTENDEE', type: 'TEXT', body: 'hello there',
  created_at: '2026-10-08T10:00:00.000Z', edited_at: null, deleted_at: null, ...overrides,
});
const texts = (renderer: ReactTestRenderer.ReactTestRenderer) =>
  renderer.root.findAllByType(Text).map(node => [node.props.children].flat().join(''));

const render = async () => {
  let renderer: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(
      <DirectConversation conversationId="c1" contactId="u2" contactName="Ananya" contactAvatarUrl={null} onClose={jest.fn()} pollIntervalMs={5000} />,
    );
    await flush();
  });
  return renderer!;
};

const socket = () => sockets[sockets.length - 1].options;
const act = (fn: () => void) => ReactTestRenderer.act(async () => { fn(); await flush(); });

beforeEach(() => {
  jest.useFakeTimers();
  resetMessagesRealtime();
  jest.clearAllMocks();
  sockets = [];
  subscribe.mockImplementation((options: Options) => {
    const sendFrame = jest.fn();
    const stop = Object.assign(jest.fn(), {send: sendFrame});
    sockets.push({options, stop, send: sendFrame});
    return stop;
  });
  me.mockResolvedValue({realtimeUrl: 'wss://rt.example/ws', user: {realtimeUrl: 'wss://rt.example/ws'}});
  fetchPage.mockResolvedValue({data: [row()], meta: {limit: 50, offset: 0, hasMore: false}});
  markRead.mockResolvedValue({read: true});
  detail.mockResolvedValue({id: 'c1', kind: 'EVENT', status: 'OPEN', viewerSide: 'ATTENDEE', paymentCards: []});
  claim.mockResolvedValue({});
});

afterEach(() => { jest.useRealTimers(); });

test('falls back to polling when the server has no realtimeUrl', async () => {
  me.mockResolvedValue({user: {id: 'me'}});
  const renderer = await render();
  expect(subscribe).not.toHaveBeenCalled();
  expect(fetchPage).toHaveBeenCalledTimes(1);

  fetchPage.mockResolvedValue({data: [row({id: 'm2', body: 'polled in', created_at: '2026-10-08T10:01:00.000Z'}), row()], meta: {limit: 50, offset: 0, hasMore: false}});
  await act(() => { jest.advanceTimersByTime(5000); });
  expect(fetchPage).toHaveBeenCalledTimes(2);
  expect(texts(renderer)).toEqual(expect.arrayContaining(['hello there', 'polled in']));
  await ReactTestRenderer.act(async () => { renderer.unmount(); });
});

test('while connected: no polling, live append, deletes, read marking, and polling again if the socket drops', async () => {
  const renderer = await render();
  expect(subscribe).toHaveBeenCalledTimes(1);
  await act(() => socket().onStatus(true));
  const afterConnect = fetchPage.mock.calls.length; // initial load + reconnect catch-up
  expect(afterConnect).toBe(2);

  await act(() => { jest.advanceTimersByTime(20000); });
  expect(fetchPage).toHaveBeenCalledTimes(afterConnect);

  await act(() => socket().onEvent({type: 'message.created', conversationId: 'c1', eventId: 'e1', seq: 1, v: 1,
    message: row({id: 'm2', body: 'live one', created_at: '2026-10-08T10:02:00.000Z'})}));
  await act(() => socket().onEvent({type: 'message.created', conversationId: 'other', eventId: 'e2', seq: 2, v: 1,
    message: row({id: 'm3', conversation_id: 'other', body: 'elsewhere'})}));
  expect(texts(renderer)).toContain('live one');
  expect(texts(renderer)).not.toContain('elsewhere');

  await act(() => { jest.advanceTimersByTime(1500); });
  expect(markRead).toHaveBeenCalledWith('c1');

  await act(() => socket().onEvent({type: 'message.deleted', conversationId: 'c1', eventId: 'e3', seq: 3, v: 1,
    message: row({body: null, deleted_at: '2026-10-08T10:03:00.000Z'})}));
  expect(texts(renderer)).toContain('Message deleted');
  expect(texts(renderer)).not.toContain('hello there');

  await act(() => socket().onStatus(false));
  await act(() => { jest.advanceTimersByTime(5000); });
  expect(fetchPage).toHaveBeenCalledTimes(afterConnect + 1);
  await ReactTestRenderer.act(async () => { renderer.unmount(); });
});

test('my sent message echoed by the socket is not duplicated', async () => {
  const renderer = await render();
  await act(() => socket().onStatus(true));
  const mine = row({id: 'm9', sender_id: 'me', body: 'on my way', created_at: '2026-10-08T10:05:00.000Z'});
  send.mockResolvedValue(mine);
  const input = renderer.root.findByProps({accessibilityLabel: 'Message Ananya'});
  await act(() => input.props.onChangeText('on my way'));
  await act(() => socket().onEvent({type: 'message.created', conversationId: 'c1', eventId: 'e9', seq: 1, message: mine}));
  await act(() => renderer.root.findByProps({accessibilityLabel: 'Send message'}).props.onPress());
  expect(texts(renderer).filter(text => text === 'on my way')).toHaveLength(1);
  expect(markRead).not.toHaveBeenCalled();
  await ReactTestRenderer.act(async () => { renderer.unmount(); });
});

test('shows typing for about 4s and sends throttled typing frames while composing', async () => {
  const renderer = await render();
  await act(() => socket().onStatus(true));

  await act(() => socket().onEvent({type: 'typing', conversationId: 'c1', userId: 'u2'}));
  expect(renderer.root.findAllByProps({testID: 'typing-indicator'}).length).toBeGreaterThan(0);
  await act(() => { jest.advanceTimersByTime(3000); });
  expect(texts(renderer)).toContain('Ananya is typing…');
  await act(() => { jest.advanceTimersByTime(1000); });
  expect(texts(renderer)).not.toContain('Ananya is typing…');

  const input = renderer.root.findByProps({accessibilityLabel: 'Message Ananya'});
  const frames = sockets[0].send;
  await act(() => input.props.onChangeText('h'));
  await act(() => input.props.onChangeText('he'));
  await act(() => { jest.advanceTimersByTime(2000); });
  await act(() => input.props.onChangeText('hel'));
  expect(frames).toHaveBeenCalledTimes(1);
  expect(frames).toHaveBeenCalledWith({action: 'typing', conversationId: 'c1'});
  await act(() => { jest.advanceTimersByTime(1000); });
  await act(() => input.props.onChangeText('hell'));
  expect(frames).toHaveBeenCalledTimes(2);
  await act(() => { jest.advanceTimersByTime(5000); });
  await act(() => input.props.onChangeText('   '));
  expect(frames).toHaveBeenCalledTimes(2);
  await ReactTestRenderer.act(async () => { renderer.unmount(); });
});

// Event threads: attendee side of the paid-ticket flow (F-06.1).
const card = (overrides: Partial<ApiPaymentCard> = {}): ApiPaymentCard => ({
  id: 'card1', amount_minor: 49900, currency: 'INR', method: 'UPI', payee_name: 'Neon Nights', upi_id: 'neon@okhdfc',
  account_number: null, ifsc: null, payment_link: null, qr_image_url: null, note: null, status: 'SHARED', expires_at: null, ...overrides,
});
const cardRow = (overrides: Partial<ApiMessage> = {}): ApiMessage => row({
  id: 'p1', sender_id: 'org', sender_role: 'WORKSPACE', type: 'PAYMENT_CARD', body: null,
  metadata: {paymentCardId: 'card1', amountMinor: 49900, currency: 'INR', method: 'UPI'}, ...overrides,
});
const renderEvent = async (extra: Partial<React.ComponentProps<typeof DirectConversation>> = {}) => {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(
      <DirectConversation conversationId="c1" contactId="" contactName="Neon Nights" contactAvatarUrl={null} kind="EVENT"
        onClose={jest.fn()} pollIntervalMs={5000} {...extra} />,
    );
    await flush();
  });
  return renderer;
};
const pressable = (renderer: ReactTestRenderer.ReactTestRenderer, label: string) =>
  renderer.root.findAll(node => node.props.accessibilityLabel === label && node.props.accessibilityRole === 'button')[0];
const dialogButton = (call: number, text: string) => (dialog.mock.calls[call][2] as {text: string; onPress?: () => void}[]).find(button => button.text === text)!;

test('an event thread reads its payment cards; a direct thread never does', async () => {
  fetchPage.mockResolvedValue({data: [cardRow()], meta: {limit: 50, offset: 0, hasMore: false}});
  detail.mockResolvedValue({id: 'c1', kind: 'EVENT', status: 'OPEN', viewerSide: 'ATTENDEE', paymentCards: [card()]});
  const renderer = await renderEvent();
  expect(detail).toHaveBeenCalledWith('c1');
  expect(texts(renderer)).toEqual(expect.arrayContaining(['Neon Nights', 'neon@okhdfc', "I've paid"]));
  await ReactTestRenderer.act(async () => { renderer.unmount(); });

  detail.mockClear();
  const direct = await render();
  expect(detail).not.toHaveBeenCalled();
  await ReactTestRenderer.act(async () => { direct.unmount(); });
});

test('I\'ve paid asks first; repeated taps queue one confirmation and send one mark-paid', async () => {
  fetchPage.mockResolvedValue({data: [cardRow()], meta: {limit: 50, offset: 0, hasMore: false}});
  detail.mockResolvedValue({id: 'c1', kind: 'EVENT', status: 'OPEN', viewerSide: 'ATTENDEE', paymentCards: [card()]});
  let finish!: (value: ApiPaymentCard) => void;
  claim.mockReturnValue(new Promise<ApiPaymentCard>(resolve => { finish = resolve; }));
  const renderer = await renderEvent();

  await act(() => pressable(renderer, "I've paid").props.onPress());
  await act(() => pressable(renderer, "I've paid").props.onPress());
  expect(dialog).toHaveBeenCalledTimes(1);
  expect(dialog.mock.calls[0][0]).toBe('Mark as paid?');

  await act(() => dialogButton(0, "I've paid").onPress!());
  await act(() => dialogButton(0, "I've paid").onPress!());
  expect(claim).toHaveBeenCalledTimes(1);
  expect(claim).toHaveBeenCalledWith('card1');
  // While the request runs the button is disabled and cannot start another.
  expect(pressable(renderer, "I've paid").props.disabled).toBe(true);
  expect(pressable(renderer, "I've paid").props.onPress).toBeUndefined();

  await act(async () => { finish(card({status: 'PAID_CLAIMED'})); });
  expect(texts(renderer)).toContain('Payment claimed. Waiting for the organiser to confirm');
  expect(pressable(renderer, 'Payment claimed').props.disabled).toBe(true);
  await ReactTestRenderer.act(async () => { renderer.unmount(); });
});

test('"Not yet" cancels the claim without a request, and a later tap can ask again', async () => {
  fetchPage.mockResolvedValue({data: [cardRow()], meta: {limit: 50, offset: 0, hasMore: false}});
  detail.mockResolvedValue({id: 'c1', kind: 'EVENT', status: 'OPEN', viewerSide: 'ATTENDEE', paymentCards: [card()]});
  const renderer = await renderEvent();
  await act(() => pressable(renderer, "I've paid").props.onPress());
  await act(() => dialogButton(0, 'Not yet').onPress!());
  expect(claim).not.toHaveBeenCalled();
  await act(() => pressable(renderer, "I've paid").props.onPress());
  expect(dialog).toHaveBeenCalledTimes(2);
  await ReactTestRenderer.act(async () => { renderer.unmount(); });
});

test('a 409 on mark-paid re-reads the thread instead of showing an error', async () => {
  fetchPage.mockResolvedValue({data: [cardRow()], meta: {limit: 50, offset: 0, hasMore: false}});
  detail.mockResolvedValue({id: 'c1', kind: 'EVENT', status: 'OPEN', viewerSide: 'ATTENDEE', paymentCards: [card()]});
  claim.mockRejectedValue({status: 409, message: 'This payment card is no longer awaiting payment'});
  const renderer = await renderEvent();
  const before = detail.mock.calls.length;
  await act(() => pressable(renderer, "I've paid").props.onPress());
  await act(() => dialogButton(0, "I've paid").onPress!());
  expect(detail.mock.calls.length).toBeGreaterThan(before);
  expect(dialog).toHaveBeenCalledTimes(1); // only the confirmation; no error dialog
  await ReactTestRenderer.act(async () => { renderer.unmount(); });
});

test('a failed mark-paid shows the server message and leaves the card claimable', async () => {
  fetchPage.mockResolvedValue({data: [cardRow()], meta: {limit: 50, offset: 0, hasMore: false}});
  detail.mockResolvedValue({id: 'c1', kind: 'EVENT', status: 'OPEN', viewerSide: 'ATTENDEE', paymentCards: [card()]});
  claim.mockRejectedValue({status: 500, message: 'Something went wrong'});
  const renderer = await renderEvent();
  await act(() => pressable(renderer, "I've paid").props.onPress());
  await act(() => dialogButton(0, "I've paid").onPress!());
  expect(dialog).toHaveBeenLastCalledWith('Could not mark as paid', 'Something went wrong');
  expect(pressable(renderer, "I've paid").props.disabled).toBe(false);
  await ReactTestRenderer.act(async () => { renderer.unmount(); });
});

test('Copy puts the UPI id on the clipboard without a dialog', async () => {
  fetchPage.mockResolvedValue({data: [cardRow()], meta: {limit: 50, offset: 0, hasMore: false}});
  detail.mockResolvedValue({id: 'c1', kind: 'EVENT', status: 'OPEN', viewerSide: 'ATTENDEE', paymentCards: [card()]});
  const setString = jest.fn();
  // The module object is read through require: `import *` copies it under Babel interop, so a spy would miss.
  const clipboard = jest.spyOn(require('react-native'), 'Clipboard', 'get').mockReturnValue({setString, getString: jest.fn()} as never);
  const renderer = await renderEvent();
  await act(() => pressable(renderer, 'Copy UPI ID').props.onPress());
  expect(setString).toHaveBeenCalledWith('neon@okhdfc');
  expect(dialog).not.toHaveBeenCalled();
  clipboard.mockRestore();
  await ReactTestRenderer.act(async () => { renderer.unmount(); });
});

test('a payment link opens only after a confirmation that names its host; javascript and intent links are never offered', async () => {
  const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined as never);
  fetchPage.mockResolvedValue({data: [cardRow({metadata: {paymentCardId: 'card1', amountMinor: 49900, currency: 'INR', method: 'LINK'}})], meta: {limit: 50, offset: 0, hasMore: false}});
  detail.mockResolvedValue({id: 'c1', kind: 'EVENT', status: 'OPEN', viewerSide: 'ATTENDEE', paymentCards: [card({method: 'LINK', upi_id: null, payment_link: 'javascript:alert(1)'})]});
  let renderer = await renderEvent();
  expect(pressable(renderer, 'Open payment link')).toBeUndefined();
  await ReactTestRenderer.act(async () => { renderer.unmount(); });

  detail.mockResolvedValue({id: 'c1', kind: 'EVENT', status: 'OPEN', viewerSide: 'ATTENDEE', paymentCards: [card({method: 'LINK', upi_id: null, payment_link: 'https://pay.example.com/x'})]});
  renderer = await renderEvent();
  await act(() => pressable(renderer, 'Open payment link').props.onPress());
  expect(dialog.mock.calls.at(-1)?.[0]).toBe('Open pay.example.com?');
  expect(openURL).not.toHaveBeenCalled();
  await act(() => dialogButton(dialog.mock.calls.length - 1, 'Open').onPress!());
  expect(openURL).toHaveBeenCalledWith('https://pay.example.com/x');
  openURL.mockRestore();
  await ReactTestRenderer.act(async () => { renderer.unmount(); });
});

test('a payment card frame on the socket shows the card and a SYSTEM frame re-reads the thread', async () => {
  fetchPage.mockResolvedValue({data: [], meta: {limit: 50, offset: 0, hasMore: false}});
  const renderer = await renderEvent();
  await act(() => socket().onStatus(true));
  const before = detail.mock.calls.length;
  await act(() => socket().onEvent({type: 'message.created', conversationId: 'c1', eventId: 'e5', seq: 5, v: 1,
    message: {...cardRow({id: 'p5', metadata: null}), paymentCard: card()} as ApiMessage}));
  expect(texts(renderer)).toEqual(expect.arrayContaining(['Neon Nights', "I've paid"]));
  expect(detail.mock.calls.length).toBeGreaterThan(before);

  const afterCard = detail.mock.calls.length;
  await act(() => socket().onEvent({type: 'message.created', conversationId: 'c1', eventId: 'e6', seq: 6, v: 1,
    message: row({id: 'sys1', sender_role: 'SYSTEM', sender_id: null, type: 'SYSTEM', body: 'Payment confirmed',
      metadata: {paymentCardId: 'card1', reference: null}, created_at: '2026-10-08T10:06:00.000Z'})}));
  expect(detail.mock.calls.length).toBeGreaterThan(afterCard);
  expect(texts(renderer)).toContain('Payment confirmed');
  await ReactTestRenderer.act(async () => { renderer.unmount(); });
});

test('an open card is re-read on a timer until it is no longer open', async () => {
  fetchPage.mockResolvedValue({data: [cardRow()], meta: {limit: 50, offset: 0, hasMore: false}});
  detail.mockResolvedValue({id: 'c1', kind: 'EVENT', status: 'OPEN', viewerSide: 'ATTENDEE', paymentCards: [card()]});
  const renderer = await renderEvent();
  await act(() => socket().onStatus(true)); // connected, so only the card timer re-reads the thread
  const before = detail.mock.calls.length;
  await act(() => { jest.advanceTimersByTime(15000); });
  expect(detail.mock.calls.length).toBeGreaterThan(before);

  detail.mockResolvedValue({id: 'c1', kind: 'EVENT', status: 'OPEN', viewerSide: 'ATTENDEE', paymentCards: [card({status: 'CANCELLED'})]});
  await act(() => { jest.advanceTimersByTime(15000); });
  expect(texts(renderer)).toContain('Request withdrawn');
  const settled = detail.mock.calls.length;
  await act(() => { jest.advanceTimersByTime(30000); });
  expect(detail.mock.calls.length).toBe(settled);
  await ReactTestRenderer.act(async () => { renderer.unmount(); });
});

test('a DIRECT card is generic: no payee, no details, no actions', async () => {
  fetchPage.mockResolvedValue({data: [cardRow()], meta: {limit: 50, offset: 0, hasMore: false}});
  const renderer = await render();
  expect(texts(renderer)).toEqual(expect.arrayContaining(['Payment request', 'Payment details are not shown in direct chats.']));
  expect(texts(renderer).join(' ')).not.toContain('neon@okhdfc');
  await ReactTestRenderer.act(async () => { renderer.unmount(); });
});

test('a TICKET bubble opens the ticket pass the host renders inside the chat', async () => {
  fetchPage.mockResolvedValue({data: [row({id: 't1', sender_role: 'WORKSPACE', sender_id: 'org', type: 'TICKET', body: null,
    metadata: {ticketId: 'tk1', code: 'GTHR-7K2M-9QX4', eventId: 'e1'}})], meta: {limit: 50, offset: 0, hasMore: false}});
  const renderPass = jest.fn((ticketId: string) => <Text>{`pass ${ticketId}`}</Text>);
  const renderer = await renderEvent({renderTicketPass: renderPass});
  expect(texts(renderer)).toContain('Your ticket is ready');
  expect(texts(renderer).join(' ')).not.toContain('GTHR-7K2M-9QX4');
  await act(() => pressable(renderer, 'View ticket').props.onPress());
  expect(renderPass).toHaveBeenLastCalledWith('tk1', expect.any(Function));
  expect(texts(renderer)).toContain('pass tk1');
  await ReactTestRenderer.act(async () => { renderer.unmount(); });
});

describe('organiser actions slot', () => {
  const renderWith = async (viewerSide: 'ATTENDEE' | 'WORKSPACE', slot: jest.Mock) => {
    detail.mockResolvedValue({id: 'c1', kind: 'EVENT', status: 'OPEN', event_id: 'e1', viewerSide, paymentCards: [card()]});
    let renderer: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <DirectConversation conversationId="c1" contactId="" contactName="Asha" contactAvatarUrl={null} kind="EVENT" onClose={jest.fn()} pollIntervalMs={5000} renderOrganizerActions={slot} />,
      );
      await flush();
    });
    return renderer!;
  };

  test('renders for the workspace side with the thread cards and event id', async () => {
    const slot = jest.fn(() => <Text>ORG-BAR</Text>);
    const renderer = await renderWith('WORKSPACE', slot);
    expect(texts(renderer)).toContain('ORG-BAR');
    expect(slot).toHaveBeenLastCalledWith(expect.objectContaining({eventId: 'e1', cards: [expect.objectContaining({id: 'card1'})]}));
    await ReactTestRenderer.act(async () => { renderer.unmount(); });
  });

  test('never renders for the attendee side', async () => {
    const slot = jest.fn(() => <Text>ORG-BAR</Text>);
    const renderer = await renderWith('ATTENDEE', slot);
    expect(texts(renderer)).not.toContain('ORG-BAR');
    await ReactTestRenderer.act(async () => { renderer.unmount(); });
  });
});
