import React from 'react';
import {Text} from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import Onboarding from '../Onboarding';
import {completeOnboarding} from '../authSlice';
import {getOnboardingProfile, saveOnboardingProfile} from '../onboarding/onboardingService';

const mockDispatch = jest.fn();
jest.mock('../../../core/store/hooks', () => ({useAppDispatch: () => mockDispatch}));
jest.mock('../onboarding/onboardingService', () => ({getOnboardingProfile: jest.fn(), saveOnboardingProfile: jest.fn()}));
jest.mock('../../../core/media', () => ({
  imagePicker: {available: false, pickImage: jest.fn()},
  uploadMedia: jest.fn(),
}));

const getProfile = getOnboardingProfile as jest.Mock;
const saveProfile = saveOnboardingProfile as jest.Mock;

const profile = {id: 'u1', name: 'Asha Rao', email: 'asha@example.com', handle: null, avatar_url: null, interests: [], city: null};

beforeEach(() => {
  jest.clearAllMocks();
  getProfile.mockResolvedValue(profile);
  saveProfile.mockResolvedValue(profile);
});

async function render() {
  let renderer: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<Onboarding />);
  });
  return renderer!;
}

const byLabel = (renderer: ReactTestRenderer.ReactTestRenderer, label: string) =>
  renderer.root.find(node => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function');
const input = (renderer: ReactTestRenderer.ReactTestRenderer, label: string) =>
  renderer.root.find(node => node.props.accessibilityLabel === label && typeof node.props.onChangeText === 'function');
const press = async (renderer: ReactTestRenderer.ReactTestRenderer, label: string) => {
  await ReactTestRenderer.act(async () => { byLabel(renderer, label).props.onPress(); });
};
const type = async (renderer: ReactTestRenderer.ReactTestRenderer, label: string, value: string) => {
  await ReactTestRenderer.act(async () => { input(renderer, label).props.onChangeText(value); });
};
const texts = (renderer: ReactTestRenderer.ReactTestRenderer) =>
  renderer.root.findAllByType(Text).map(node => [node.props.children].flat().join('')).join('\n');

test('prefills name and suggests a handle from the Google profile', async () => {
  const renderer = await render();
  expect(input(renderer, 'Name').props.value).toBe('Asha Rao');
  expect(input(renderer, 'Handle').props.value).toBe('asha_rao');
});

test('validation blocks Next on the identity step', async () => {
  const renderer = await render();
  await type(renderer, 'Name', 'A');
  await type(renderer, 'Handle', 'no spaces!');
  await press(renderer, 'Next');
  expect(texts(renderer)).toContain('Name must be 2–80 characters.');
  expect(texts(renderer)).toContain('Handle must be 3–30 lowercase letters, numbers, or underscores.');
  expect(texts(renderer)).toContain('Step 1 of 3');
});

test('requires at least one interest and caps the selection at 8', async () => {
  const renderer = await render();
  await press(renderer, 'Next');
  expect(texts(renderer)).toContain('Step 2 of 3');

  await press(renderer, 'Next');
  expect(texts(renderer)).toContain('Pick at least one interest.');

  const all = ['music', 'gaming', 'chill', 'talk', 'study', 'travel', 'sports', 'tech', 'startups'];
  for (const interest of all) {
    const chip = byLabel(renderer, `Interest ${interest}`);
    if (!chip.props.disabled) await press(renderer, `Interest ${interest}`);
  }
  expect(texts(renderer)).toContain('8/8 selected · limit reached');
  expect(byLabel(renderer, 'Interest startups').props.accessibilityState).toEqual({checked: false, disabled: true});
});

test('saves the profile with one PATCH and completes onboarding', async () => {
  const renderer = await render();
  await press(renderer, 'Next');
  await press(renderer, 'Interest music');
  await press(renderer, 'Interest tech');
  await press(renderer, 'Next');
  expect(byLabel(renderer, 'Add photo').props.disabled).toBe(true);
  await type(renderer, 'City', ' Pune ');
  await press(renderer, 'Finish');

  expect(saveProfile).toHaveBeenCalledTimes(1);
  expect(saveProfile).toHaveBeenCalledWith({name: 'Asha Rao', handle: 'asha_rao', interests: ['music', 'tech'], city: 'Pune'});
  expect(mockDispatch).toHaveBeenCalledWith(completeOnboarding());
});

test('skip for now saves without optional fields', async () => {
  const renderer = await render();
  await press(renderer, 'Next');
  await press(renderer, 'Interest chill');
  await press(renderer, 'Next');
  await type(renderer, 'City', 'Pune');
  await press(renderer, 'Skip for now');
  expect(saveProfile).toHaveBeenCalledWith({name: 'Asha Rao', handle: 'asha_rao', interests: ['chill']});
  expect(mockDispatch).toHaveBeenCalledWith(completeOnboarding());
});

test('a taken handle returns to step 1 with a field error', async () => {
  saveProfile.mockRejectedValue({status: 409, code: 'CONFLICT', message: 'That handle is already taken'});
  const renderer = await render();
  await press(renderer, 'Next');
  await press(renderer, 'Interest music');
  await press(renderer, 'Next');
  await press(renderer, 'Finish');

  expect(mockDispatch).not.toHaveBeenCalled();
  expect(texts(renderer)).toContain('Step 1 of 3');
  expect(texts(renderer)).toContain('That handle is already taken. Try another.');
});

test('shows field-level validation details and generic API errors', async () => {
  saveProfile.mockRejectedValueOnce({status: 400, message: 'Invalid request body', details: [{field: 'interests.0', message: 'Too long'}]});
  saveProfile.mockRejectedValueOnce({status: 500, message: 'Server is having a moment'});
  const renderer = await render();
  await press(renderer, 'Next');
  await press(renderer, 'Interest music');
  await press(renderer, 'Next');
  await press(renderer, 'Finish');
  expect(texts(renderer)).toContain('Step 2 of 3');
  expect(texts(renderer)).toContain('Too long');

  await press(renderer, 'Next');
  await press(renderer, 'Finish');
  expect(texts(renderer)).toContain('Server is having a moment');
  expect(mockDispatch).not.toHaveBeenCalled();
});
