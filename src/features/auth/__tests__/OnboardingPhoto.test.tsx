import React from 'react';
import {Image, Text} from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import Onboarding from '../Onboarding';
import {imagePicker, uploadMedia} from '../../../core/media';
import {getOnboardingProfile, saveOnboardingProfile} from '../onboarding/onboardingService';
import {fillProfile as fillProfileWith} from '../__testHelpers__/onboardingTestUtils';

jest.mock('../../../core/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (select: (state: unknown) => unknown) => select({auth: {ageGate: 'none'}}),
}));
jest.mock('../onboarding/onboardingService', () => ({getOnboardingProfile: jest.fn(), saveOnboardingProfile: jest.fn()}));
jest.mock('../../../core/media', () => ({
  imagePicker: {available: true, pickImage: jest.fn(), pickImages: jest.fn()},
  uploadMedia: jest.fn(),
  uploadErrorMessage: (error: {message?: string}) => error?.message || 'Photo upload failed. Please try again.',
}));

const pick = imagePicker.pickImage as jest.Mock;
const upload = uploadMedia as jest.Mock;
const saveProfile = saveOnboardingProfile as jest.Mock;
const file = {uri: 'file:///cache/me.jpg', type: 'image/jpeg', size: 2048, name: 'me.jpg'};
const profile = {id: 'u1', name: 'Asha Rao', email: 'asha@example.com', handle: null, avatar_url: null, interests: [], city: null};

beforeEach(() => {
  jest.clearAllMocks();
  (getOnboardingProfile as jest.Mock).mockResolvedValue(profile);
  saveProfile.mockResolvedValue(profile);
});

const press = async (renderer: ReactTestRenderer.ReactTestRenderer, label: string) => {
  await ReactTestRenderer.act(async () => {
    renderer.root.find(node => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function').props.onPress();
  });
};
const texts = (renderer: ReactTestRenderer.ReactTestRenderer) =>
  renderer.root.findAllByType(Text).map(node => [node.props.children].flat().join('')).join('\n');

async function renderProfileStep() {
  let renderer: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => { renderer = ReactTestRenderer.create(<Onboarding />); });
  await fillProfileWith(renderer!, press);
  return renderer!;
}

async function finish(renderer: ReactTestRenderer.ReactTestRenderer) {
  await press(renderer, 'Next');
  await press(renderer, 'Just exploring');
  await press(renderer, 'Next');
  await press(renderer, 'Interest music');
  await press(renderer, 'Finish');
}

test('uploads the picked photo as an avatar and saves avatarUrl in the PATCH', async () => {
  pick.mockResolvedValue(file);
  upload.mockResolvedValue({key: 'avatars/u1/x.jpg', fileUrl: 'https://cdn.example/avatars/u1/x.jpg'});
  const renderer = await renderProfileStep();

  await press(renderer, 'Add photo');
  expect(upload).toHaveBeenCalledWith(file, 'avatar');
  expect(renderer.root.findAllByType(Image).some(node => node.props.source?.uri === 'https://cdn.example/avatars/u1/x.jpg')).toBe(true);

  await finish(renderer);
  expect(saveProfile).toHaveBeenCalledWith({name: 'Asha Rao', handle: 'asha_rao', interests: ['music'], avatarUrl: 'https://cdn.example/avatars/u1/x.jpg'});
});

test('a photo is mandatory: the upload error shows and Next stays on step 1', async () => {
  pick.mockResolvedValue(file);
  upload.mockRejectedValue({status: 0, message: 'Upload failed. Check your connection and try again.'});
  const renderer = await renderProfileStep();

  await press(renderer, 'Add photo');
  expect(texts(renderer)).toContain('Upload failed. Check your connection and try again.');

  await press(renderer, 'Next');
  expect(texts(renderer)).toContain('Step 1 of 3');
  expect(saveProfile).not.toHaveBeenCalled();
});

test('a Google avatar already on the profile satisfies the photo requirement', async () => {
  (getOnboardingProfile as jest.Mock).mockResolvedValue({...profile, avatar_url: 'https://lh3.example/a.jpg'});
  const renderer = await renderProfileStep();
  await press(renderer, 'Next');
  expect(texts(renderer)).toContain('Step 2 of 3');
});

test('cancelling the picker does not upload', async () => {
  pick.mockResolvedValue(null);
  const renderer = await renderProfileStep();
  await press(renderer, 'Add photo');
  expect(upload).not.toHaveBeenCalled();
});
