import React from 'react';
import {Image, Text} from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import {launchImageLibrary} from 'react-native-image-picker';
import {uploadMedia} from '../../../core/media';
import {EditProfileSheet} from '../ProfileSheets';
import type {UserProfile} from '../types';

jest.mock('../../../core/media', () => ({...jest.requireActual('../../../core/media'), uploadMedia: jest.fn()}));

const launch = launchImageLibrary as jest.Mock;
const upload = uploadMedia as jest.Mock;

const profile = (overrides: Partial<UserProfile> = {}): UserProfile => ({
  id: 'u1', name: 'Sachin Jangir', email: 'me@example.com', avatar_url: null, cover_image_url: null,
  handle: 'sachinj', bio: 'Just for fun', interests: ['music'], city: 'Jaipur',
  stats: {following: 0, hosted: 96, posts: 12}, ...overrides,
});
const baseUpdate = {name: 'Sachin Jangir', handle: 'sachinj', bio: 'Just for fun', city: 'Jaipur', interests: ['music']};
const photo = {uri: 'file:///cache/me.jpg', type: 'image/jpeg', fileSize: 5000, fileName: 'me.jpg'};

beforeEach(() => { jest.clearAllMocks(); });

const texts = (renderer: ReactTestRenderer.ReactTestRenderer) =>
  renderer.root.findAllByType(Text).map(node => [node.props.children].flat().join(''));
const byLabel = (renderer: ReactTestRenderer.ReactTestRenderer, label: string) =>
  renderer.root.find(node => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function');
const press = (renderer: ReactTestRenderer.ReactTestRenderer, label: string) =>
  ReactTestRenderer.act(async () => { byLabel(renderer, label).props.onPress(); });
const render = async (user: UserProfile, onSave = jest.fn().mockResolvedValue(undefined)) => {
  let renderer: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<EditProfileSheet profile={user} visible onClose={jest.fn()} onSave={onSave} />);
  });
  return {renderer: renderer!, onSave};
};

test('changing the photo uploads it as an avatar and PATCHes avatarUrl', async () => {
  launch.mockResolvedValueOnce({assets: [photo]});
  upload.mockResolvedValueOnce({key: 'k', fileUrl: 'https://cdn.example/avatars/new.jpg'});
  const {renderer, onSave} = await render(profile());

  await press(renderer, 'Add photo');
  expect(upload).toHaveBeenCalledWith({uri: photo.uri, type: 'image/jpeg', size: 5000, name: 'me.jpg'}, 'avatar');
  expect(renderer.root.findAllByType(Image).some(node => node.props.source?.uri === 'https://cdn.example/avatars/new.jpg')).toBe(true);

  await press(renderer, 'Save changes');
  expect(onSave).toHaveBeenCalledWith({...baseUpdate, avatarUrl: 'https://cdn.example/avatars/new.jpg'});
});

test('cover uploads use the misc purpose; remove sends null', async () => {
  launch.mockResolvedValueOnce({assets: [photo]});
  upload.mockResolvedValueOnce({key: 'k', fileUrl: 'https://cdn.example/misc/cover.jpg'});
  const {renderer, onSave} = await render(profile({avatar_url: 'https://cdn.example/avatars/old.jpg'}));

  await press(renderer, 'Add cover');
  expect(upload).toHaveBeenCalledWith(expect.objectContaining({uri: photo.uri}), 'misc');
  await press(renderer, 'Remove photo');
  await press(renderer, 'Save changes');
  expect(onSave).toHaveBeenCalledWith({...baseUpdate, avatarUrl: null, coverImageUrl: 'https://cdn.example/misc/cover.jpg'});
});

test('blocks saving while uploading and shows upload errors', async () => {
  let fail: (error: unknown) => void = () => {};
  upload.mockReturnValueOnce(new Promise((_, reject) => { fail = reject; }));
  launch.mockResolvedValueOnce({assets: [photo]});
  const {renderer, onSave} = await render(profile());

  await press(renderer, 'Add photo');
  expect(byLabel(renderer, 'Uploading photo…').props.disabled).toBe(true);

  await ReactTestRenderer.act(async () => { fail({status: 0, message: 'Upload failed. Check your connection and try again.'}); });
  expect(texts(renderer)).toContain('Upload failed. Check your connection and try again.');
  await press(renderer, 'Save changes');
  expect(onSave).toHaveBeenCalledWith(baseUpdate);
});
