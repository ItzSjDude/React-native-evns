/* eslint-disable no-script-url -- the unsafe URLs below are the test input */
import React from 'react';
import {Text} from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import PaymentCardBubble from '../PaymentCardBubble';
import TicketBubble from '../TicketBubble';
import type {DirectMessage} from '../directService';
import type {ApiPaymentCard} from '../types';

const message: DirectMessage = {
  id: 'p1', sender_id: 'org', type: 'PAYMENT_CARD', body: null, created_at: '2026-10-08T10:00:00.000Z', edited_at: null, deleted_at: null,
  metadata: {paymentCardId: 'card1', amountMinor: 49900, currency: 'INR', method: 'UPI'},
};
const card = (overrides: Partial<ApiPaymentCard> = {}): ApiPaymentCard => ({
  id: 'card1', amount_minor: 49900, currency: 'INR', method: 'UPI', payee_name: 'Neon Nights', upi_id: 'neon@okhdfc',
  account_number: null, ifsc: null, payment_link: null, qr_image_url: null, note: 'Send a screenshot', status: 'SHARED',
  expires_at: null, ...overrides,
});

type Props = React.ComponentProps<typeof PaymentCardBubble>;
const render = (props: Partial<Props> = {}) => {
  const onCopy = jest.fn();
  const onOpenLink = jest.fn();
  const onClaim = jest.fn();
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(
      <PaymentCardBubble message={message} card={card()} mine={false} attendee claiming={false}
        onCopy={onCopy} onOpenLink={onOpenLink} onClaim={onClaim} {...props} />,
    );
  });
  return {renderer, onCopy, onOpenLink, onClaim};
};
const texts = (renderer: ReactTestRenderer.ReactTestRenderer) => renderer.root.findAllByType(Text).map(node => [node.props.children].flat().join(''));
/** Composite Pressable carries the labelled props; the host View under it carries the role. */
const button = (renderer: ReactTestRenderer.ReactTestRenderer, label: string) =>
  renderer.root.findAll(node => node.props.accessibilityLabel === label && node.props.accessibilityRole === 'button')[0];
const hostButtons = (renderer: ReactTestRenderer.ReactTestRenderer) =>
  renderer.root.findAll(node => node.props.accessibilityRole === 'button' && typeof node.type === 'string');

test('SHARED on the attendee side: payee, UPI id, note, copy and I\'ve paid, and I\'ve paid claims the card', () => {
  const {renderer, onClaim, onCopy} = render();
  expect(texts(renderer)).toEqual(expect.arrayContaining(['₹499', 'Neon Nights', 'neon@okhdfc', 'Send a screenshot', 'Waiting for your payment']));
  button(renderer, 'Copy UPI ID').props.onPress();
  expect(onCopy).toHaveBeenCalledWith('neon@okhdfc');
  expect(button(renderer, "I've paid").props.disabled).toBe(false);
  button(renderer, "I've paid").props.onPress();
  expect(onClaim).toHaveBeenCalledWith(expect.objectContaining({id: 'card1', status: 'SHARED'}));
});

test('bank account numbers are masked to the last four digits everywhere in the bubble', () => {
  const {renderer} = render({
    message: {...message, metadata: {paymentCardId: 'card1', amountMinor: 1000, currency: 'INR', method: 'BANK'}},
    card: card({method: 'BANK', upi_id: null, account_number: '123456789012', ifsc: 'HDFC0001234'}),
  });
  const all = texts(renderer).join(' | ');
  expect(all).toContain('••••9012');
  expect(all).toContain('HDFC0001234');
  expect(all).not.toContain('123456789012');
  expect(button(renderer, 'Copy account number')).toBeDefined();
});

test('PAID_CLAIMED: the claim button is disabled, reads Payment claimed and cannot claim again', () => {
  const {renderer, onClaim} = render({card: card({status: 'PAID_CLAIMED'})});
  expect(texts(renderer)).toContain('Payment claimed. Waiting for the organiser to confirm');
  expect(button(renderer, 'Payment claimed').props.disabled).toBe(true);
  expect(button(renderer, 'Payment claimed').props.onPress).toBeUndefined();
  expect(onClaim).not.toHaveBeenCalled();
});

test("a claim in flight disables I've paid", () => {
  const {renderer} = render({claiming: true});
  expect(button(renderer, "I've paid").props.disabled).toBe(true);
  expect(button(renderer, "I've paid").props.onPress).toBeUndefined();
});

test('CONFIRMED and CANCELLED show their state and no actions', () => {
  const confirmed = render({card: card({status: 'CONFIRMED'})});
  expect(texts(confirmed.renderer)).toContain('Payment confirmed');
  expect(hostButtons(confirmed.renderer)).toHaveLength(0);

  const cancelled = render({card: card({status: 'CANCELLED'})});
  expect(texts(cancelled.renderer)).toContain('Request withdrawn');
  expect(hostButtons(cancelled.renderer)).toHaveLength(0);
});

test('a card past its expiry date is a hint, and the claim stays enabled', () => {
  const {renderer} = render({card: card({expires_at: '2020-01-01T00:00:00.000Z'})});
  expect(texts(renderer).join(' ')).toContain('Past its expiry date');
  expect(button(renderer, "I've paid").props.disabled).toBe(false);
});

test('a LINK card opens only https or upi links; javascript, http and intent get no open button', () => {
  const linkMessage = {...message, metadata: {paymentCardId: 'card1', amountMinor: 49900, currency: 'INR', method: 'LINK'}};
  for (const unsafe of ['javascript:alert(1)', 'http://pay.example.com', 'intent://pay#Intent;end']) {
    const {renderer} = render({message: linkMessage, card: card({method: 'LINK', upi_id: null, payment_link: unsafe})});
    expect(button(renderer, 'Open payment link')).toBeUndefined();
  }

  const {renderer, onOpenLink} = render({message: linkMessage, card: card({method: 'LINK', upi_id: null, payment_link: 'https://pay.example.com/x'})});
  expect(texts(renderer).join(' ')).toContain('pay.example.com');
  button(renderer, 'Open payment link').props.onPress();
  expect(onOpenLink).toHaveBeenCalledWith({url: 'https://pay.example.com/x', host: 'pay.example.com', scheme: 'https'});
});

test('before the detail loads the bubble shows the amount from the message and no actions', () => {
  const {renderer} = render({card: null});
  expect(texts(renderer)).toEqual(expect.arrayContaining(['₹499', 'Loading payment details']));
  expect(hostButtons(renderer)).toHaveLength(0);
});

test('DIRECT threads get the generic bubble: no payee, no details, no actions (D5)', () => {
  const {renderer} = render({attendee: false});
  const all = texts(renderer).join(' | ');
  expect(all).toContain('Payment request');
  expect(all).toContain('Payment details are not shown in direct chats.');
  expect(all).not.toContain('Neon Nights');
  expect(all).not.toContain('neon@okhdfc');
  expect(hostButtons(renderer)).toHaveLength(0);
});

test('TicketBubble opens the pass by id and shows no code', () => {
  const onOpenTicket = jest.fn();
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<TicketBubble mine={false} onOpenTicket={onOpenTicket}
      message={{...message, id: 't1', type: 'TICKET', metadata: {ticketId: 'tk1', code: 'GTHR-7K2M-9QX4', eventId: 'e1'}}} />);
  });
  expect(texts(renderer)).toContain('Your ticket is ready');
  expect(texts(renderer).join(' ')).not.toContain('GTHR-7K2M-9QX4');
  button(renderer, 'View ticket').props.onPress();
  expect(onOpenTicket).toHaveBeenCalledWith('tk1');
});

test('TicketBubble without a ticket id cannot open anything', () => {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<TicketBubble mine={false} onOpenTicket={jest.fn()} message={{...message, id: 't2', type: 'TICKET', metadata: null}} />);
  });
  expect(texts(renderer)).toContain('Ticket details are loading.');
  expect(hostButtons(renderer)).toHaveLength(0);
});
