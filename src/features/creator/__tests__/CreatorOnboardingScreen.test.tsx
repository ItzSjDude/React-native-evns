import React from 'react';
import {ActivityIndicator, Text, TextInput} from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import CreatorOnboardingScreen from '../CreatorOnboardingScreen';
import {getMyCreatorOnboarding, submitMyCreatorOnboarding, type CreatorOnboarding} from '../creatorService';

jest.mock('../creatorService', () => ({getMyCreatorOnboarding: jest.fn(), submitMyCreatorOnboarding: jest.fn()}));
const load = getMyCreatorOnboarding as jest.Mock;
const submit = submitMyCreatorOnboarding as jest.Mock;

const state = (overrides: Partial<CreatorOnboarding> = {}): CreatorOnboarding => ({
  status: 'NOT_STARTED', payoutStatus: 'NOT_SUBMITTED', payoutEligible: false, maskedAccount: null, ...overrides,
});

let tree: ReactTestRenderer.ReactTestRenderer | undefined;
const render = async (visible = true, onClose: () => void = jest.fn()) => {
  await ReactTestRenderer.act(async () => {tree = ReactTestRenderer.create(<CreatorOnboardingScreen visible={visible} onClose={onClose} />);});
  return tree!;
};
const texts = () => tree!.root.findAllByType(Text).map(node => [node.props.children].flat().join(''));
const input = (label: string) => tree!.root.findAllByType(TextInput).find(node => node.props.accessibilityLabel === label)!;
const type = (label: string, value: string) => ReactTestRenderer.act(() => {input(label).props.onChangeText(value);});
const pressables = (label: string) => tree!.root.findAll(node => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function');
const category = (name: string) => tree!.root.findAll(node => node.props.accessibilityRole === 'checkbox' && typeof node.props.onPress === 'function' && node.findAllByType(Text).some(t => t.props.children === name))[0];
// While saving the label is replaced by a spinner, so the submit Pressable is identified by its busy state too.
const submitButton = () => tree!.root.findAll(node => node.props.accessibilityRole === 'button' && typeof node.props.onPress === 'function' && (
  'busy' in (node.props.accessibilityState ?? {}) || node.findAllByType(Text).some(t => t.props.children === 'Submit for review')))[0];
const fillValid = async () => {
  await type('About you', '  I produce music and podcasts  ');
  await ReactTestRenderer.act(() => {category('Music').props.onPress();});
  await type('Account holder name', ' Asha Rao ');
  await type('Account number', '1234 5678-9012');
  await type('IFSC code', 'hdfc0001234');
};

afterEach(() => ReactTestRenderer.act(() => {tree?.unmount(); tree = undefined;}));
beforeEach(() => { jest.resetAllMocks(); });

test('does not hit the API while hidden, and loads the state when it becomes visible', async () => {
  await render(false);
  expect(load).not.toHaveBeenCalled();
  load.mockResolvedValue(state());
  await ReactTestRenderer.act(async () => {tree!.update(<CreatorOnboardingScreen visible onClose={jest.fn()} />);});
  expect(load).toHaveBeenCalledTimes(1);
  expect(texts()).toContain('Submit for review');
});

test('shows a spinner while the onboarding state loads, then the form', async () => {
  let resolve!: (value: CreatorOnboarding) => void;
  load.mockReturnValue(new Promise<CreatorOnboarding>(r => {resolve = r;}));
  await render();
  expect(tree!.root.findAllByType(ActivityIndicator)).toHaveLength(1);
  expect(texts()).not.toContain('Submit for review');
  await ReactTestRenderer.act(async () => {resolve(state());});
  expect(tree!.root.findAllByType(ActivityIndicator)).toHaveLength(0);
  expect(texts()).toContain('Submit for review');
});

test('a load failure shows the server message and keeps the form usable', async () => {
  load.mockRejectedValue({status: 500, message: 'Backend exploded'});
  await render();
  expect(texts()).toContain('Backend exploded');
  expect(tree!.root.findAllByType(TextInput).length).toBeGreaterThan(0);
});

test('falls back to a generic message when the failure has no message', async () => {
  load.mockRejectedValue(undefined);
  await render();
  expect(texts()).toContain('Please try again.');
});

test('prefills about and categories from a saved draft', async () => {
  load.mockResolvedValue(state({about: 'Existing bio here', categories: ['ART']}));
  await render();
  expect(input('About you').props.value).toBe('Existing bio here');
  expect(category('Art').props.accessibilityState).toEqual({checked: true});
  expect(category('Music').props.accessibilityState).toEqual({checked: false});
});

test('submit stays disabled until every field is valid', async () => {
  load.mockResolvedValue(state());
  await render();
  const disabled = () => submitButton().props.disabled;
  expect(disabled()).toBe(true);
  await type('About you', 'too short');
  await ReactTestRenderer.act(() => {category('Music').props.onPress();});
  await type('Account holder name', 'A');
  await type('Account number', '12345678');   // 8 digits: below the 9 minimum
  await type('IFSC code', 'HDFC1001234');      // 5th char must be 0
  expect(disabled()).toBe(true);
  await type('About you', 'long enough about');
  await type('Account holder name', 'Asha');
  await type('Account number', '123456789');
  await type('IFSC code', 'HDFC0001234');
  expect(disabled()).toBe(false);
  await ReactTestRenderer.act(() => {category('Music').props.onPress();});   // deselect last category
  expect(disabled()).toBe(true);
});

test('account number keeps only digits and IFSC is upper-cased as typed', async () => {
  load.mockResolvedValue(state());
  await render();
  await type('Account number', 'ab12-34 56');
  await type('IFSC code', 'hdfc0abc12');
  expect(input('Account number').props.value).toBe('123456');
  expect(input('IFSC code').props.value).toBe('HDFC0ABC12');
  expect(input('Account number').props.secureTextEntry).toBe(true);
});

test('does not call the API when submit is pressed on an incomplete form', async () => {
  load.mockResolvedValue(state());
  await render();
  await ReactTestRenderer.act(async () => {await submitButton().props.onPress();});
  expect(submit).not.toHaveBeenCalled();
});

test('submits trimmed, normalised values, then clears the bank details and shows the review state', async () => {
  load.mockResolvedValue(state());
  submit.mockResolvedValue(state({status: 'PENDING', payoutStatus: 'PENDING', maskedAccount: 'XXXXXXXX9012'}));
  await render();
  await fillValid();
  await ReactTestRenderer.act(async () => {await submitButton().props.onPress();});
  expect(submit).toHaveBeenCalledTimes(1);
  expect(submit).toHaveBeenCalledWith({
    about: 'I produce music and podcasts', categories: ['MUSIC'], accountHolder: 'Asha Rao',
    accountNumber: '123456789012', ifsc: 'HDFC0001234',
  });
  expect(texts()).toEqual(expect.arrayContaining(['Application in review', 'Payout account · XXXXXXXX9012']));
  expect(texts()).not.toContain('Submit for review');
  expect(JSON.stringify(tree!.toJSON())).not.toContain('123456789012');
});

test('a rejected submit shows the server message, re-enables the button and does not clear what was typed', async () => {
  load.mockResolvedValue(state());
  submit.mockRejectedValueOnce({status: 422, message: 'IFSC not recognised'});
  await render();
  await fillValid();
  await ReactTestRenderer.act(async () => {await submitButton().props.onPress();});
  expect(texts()).toContain('IFSC not recognised');
  expect(submitButton().props.disabled).toBe(false);
  expect(input('Account number').props.value).toBe('123456789012');
  expect(input('IFSC code').props.value).toBe('HDFC0001234');
});

test('ignores a second press while the first submit is in flight', async () => {
  load.mockResolvedValue(state());
  let finish!: (value: CreatorOnboarding) => void;
  submit.mockReturnValue(new Promise<CreatorOnboarding>(r => {finish = r;}));
  await render();
  await fillValid();
  await ReactTestRenderer.act(async () => {submitButton().props.onPress();});
  expect(submitButton().props.disabled).toBe(true);
  expect(submitButton().props.accessibilityState).toEqual({disabled: true, busy: true});
  await ReactTestRenderer.act(async () => {submitButton().props.onPress();});
  expect(submit).toHaveBeenCalledTimes(1);
  await ReactTestRenderer.act(async () => {finish(state({status: 'PENDING'}));});
});

test.each([
  ['approved with payouts', {status: 'APPROVED', payoutEligible: true, payoutStatus: 'VERIFIED'} as const, 'You’re ready to earn'],
  ['approved without payout access', {status: 'APPROVED', payoutEligible: false, payoutStatus: 'PENDING'} as const, 'Payout setup in progress'],
  ['pending review', {status: 'PENDING', payoutStatus: 'PENDING'} as const, 'Application in review'],
  ['payout pending while profile not started', {status: 'NOT_STARTED', payoutStatus: 'PENDING'} as const, 'Application in review'],
])('shows the %s status instead of the form', async (_name, overrides, heading) => {
  load.mockResolvedValue(state({...overrides, maskedAccount: 'XXXX4321'}));
  await render();
  expect(texts()).toContain(heading);
  expect(texts()).toContain('Payout account · XXXX4321');
  expect(texts()).not.toContain('Submit for review');
});

test('a rejected application shows the reason on the form so the creator can resubmit', async () => {
  load.mockResolvedValue(state({status: 'REJECTED', payoutStatus: 'REJECTED', rejectionReason: 'Name does not match the account'}));
  await render();
  expect(texts()).toContain('Name does not match the account');
  expect(texts()).toContain('Submit for review');
});

test('a rejected application without a reason shows a generic prompt', async () => {
  load.mockResolvedValue(state({status: 'REJECTED', rejectionReason: null}));
  await render();
  expect(texts()).toContain('Please review your details and submit them again.');
});

test('the close button and the Done button both call onClose', async () => {
  const onClose = jest.fn();
  load.mockResolvedValue(state({status: 'PENDING'}));
  await render(true, onClose);
  await ReactTestRenderer.act(() => {pressables('Close creator setup')[0].props.onPress();});
  const done = tree!.root.findAll(node => node.props.accessibilityRole === 'button' && node.findAllByType(Text).some(t => t.props.children === 'Done') && typeof node.props.onPress === 'function')[0];
  await ReactTestRenderer.act(() => {done.props.onPress();});
  expect(onClose).toHaveBeenCalledTimes(2);
});

test('closing clears the bank details so they are not retained for the next open', async () => {
  load.mockResolvedValue(state());
  await render();
  await fillValid();
  await ReactTestRenderer.act(async () => {tree!.update(<CreatorOnboardingScreen visible={false} onClose={jest.fn()} />);});
  load.mockResolvedValue(state());
  await ReactTestRenderer.act(async () => {tree!.update(<CreatorOnboardingScreen visible onClose={jest.fn()} />);});
  expect(input('Account number').props.value).toBe('');
  expect(input('IFSC code').props.value).toBe('');
});

test('a slow load that resolves after the sheet closed does not update state', async () => {
  let resolve!: (value: CreatorOnboarding) => void;
  load.mockReturnValue(new Promise<CreatorOnboarding>(r => {resolve = r;}));
  const errors = jest.spyOn(console, 'error').mockImplementation(() => {});
  await render();
  await ReactTestRenderer.act(async () => {tree!.update(<CreatorOnboardingScreen visible={false} onClose={jest.fn()} />);});
  await ReactTestRenderer.act(async () => {resolve(state({status: 'PENDING'}));});
  expect(errors).not.toHaveBeenCalled();
  errors.mockRestore();
});
