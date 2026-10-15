import React from 'react';
import {act, create, type ReactTestRenderer} from 'react-test-renderer';
import PayoutStatusBadge from '../PayoutStatusBadge';
import {paidTicketLockMessage, payoutStatusCopy} from '../organizerPresentation';
import type {OrganizerPayoutAccount} from '../types';

const account = (patch: Partial<OrganizerPayoutAccount> = {}): OrganizerPayoutAccount =>
  ({status: 'PENDING', accountSuffix: '1234', payoutSchedule: 'AFTER_EACH_EVENT', rejectionReason: null, updatedAt: null, ...patch});

let tree: ReactTestRenderer;
const texts = () => tree.root.findAll(n => (n.type as unknown) === 'Text').map(n => [n.props.children].flat().join(''));
const render = (value: OrganizerPayoutAccount | null) => {
  act(() => {tree = create(<PayoutStatusBadge account={value} />);});
};

afterEach(() => act(() => tree?.unmount()));

test('PENDING says the details are under review', () => {
  render(account({status: 'PENDING'}));
  expect(texts()).toContain('Payout details under review');
  expect(texts()).toContain('Account ending 1234');
});

test('VERIFIED says the payout is verified', () => {
  render(account({status: 'VERIFIED'}));
  expect(texts()).toContain('Payout verified');
});

test('REJECTED shows the reason and asks for a resubmission', () => {
  render(account({status: 'REJECTED', rejectionReason: 'Account holder name does not match'}));
  expect(texts()).toContain('Payout rejected: Account holder name does not match. Update your details and resubmit.');
});

test('REJECTED without a reason still reads cleanly', () => {
  expect(payoutStatusCopy(account({status: 'REJECTED', rejectionReason: null}))?.title).toBe('Payout rejected. Update your details and resubmit.');
});

test('NOT_SUBMITTED asks for bank details', () => {
  render(account({status: 'NOT_SUBMITTED', accountSuffix: null}));
  expect(texts()).toContain('Add your bank details to receive payouts');
});

test('an unknown status (API 404) renders nothing', () => {
  render(null);
  expect(tree.toJSON()).toBeNull();
});

test('paid tickets are locked with an explanation for every status except VERIFIED', () => {
  expect(paidTicketLockMessage(account({status: 'VERIFIED'}))).toBeNull();
  expect(paidTicketLockMessage(null)).toBeNull();
  for (const status of ['PENDING', 'REJECTED', 'NOT_SUBMITTED'] as const) {
    expect(paidTicketLockMessage(account({status}))).toMatch(/^Paid events need a verified payout account\./);
  }
});

test('the PENDING lock message never dead-ends: it says review is ongoing and free events remain possible', () => {
  expect(paidTicketLockMessage(account({status: 'PENDING'}))).toContain('under review');
  expect(paidTicketLockMessage(account({status: 'PENDING'}))).toContain('free');
});
