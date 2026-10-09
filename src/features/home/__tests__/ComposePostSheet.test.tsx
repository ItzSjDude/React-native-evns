import React from 'react';
import {Text} from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import {launchImageLibrary} from 'react-native-image-picker';
import {apiRequest} from '../../../core/api/apiClient';
import {uploadMedia} from '../../../core/media';
import ComposePostSheet from '../ComposePostSheet';
import {createPost} from '../homeService';

jest.mock('../../../core/api/apiClient', () => ({apiRequest: jest.fn(), apiRequestPage: jest.fn()}));
jest.mock('../../../core/media', () => ({...jest.requireActual('../../../core/media'), uploadMedia: jest.fn()}));

const launch = launchImageLibrary as jest.Mock;
const upload = uploadMedia as jest.Mock;
const request = apiRequest as jest.Mock;

const asset = (n: number) => ({uri: `file:///cache/${n}.jpg`, type: 'image/jpeg', fileSize: 1000, fileName: `${n}.jpg`});
const urlOf = (n: number) => `https://cdn.example/posts/${n}.jpg`;

beforeEach(() => {
  jest.clearAllMocks();
  upload.mockImplementation(async (file: {uri: string}) => ({key: file.uri, fileUrl: urlOf(Number(file.uri.match(/(\d+)\.jpg/)![1]))}));
});

const texts = (renderer: ReactTestRenderer.ReactTestRenderer) =>
  renderer.root.findAllByType(Text).map(node => [node.props.children].flat().join(''));
const byLabel = (renderer: ReactTestRenderer.ReactTestRenderer, label: string) =>
  renderer.root.find(node => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function');
const press = (renderer: ReactTestRenderer.ReactTestRenderer, label: string) =>
  ReactTestRenderer.act(async () => { byLabel(renderer, label).props.onPress(); });

const render = async (draft = '', onSubmit = jest.fn()) => {
  let renderer: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<ComposePostSheet visible draft={draft} error={null} onChangeDraft={jest.fn()} onClose={jest.fn()} onSubmit={onSubmit} />);
  });
  return {renderer: renderer!, onSubmit};
};

test('attaches up to 4 photos, uploads them as post media and submits their https URLs', async () => {
  const {renderer, onSubmit} = await render('Beach day');
  launch.mockResolvedValueOnce({assets: [asset(1), asset(2), asset(3)]});
  await press(renderer, 'Add photos');
  expect(launch).toHaveBeenLastCalledWith(expect.objectContaining({selectionLimit: 4, mediaType: 'photo'}));
  expect(upload).toHaveBeenCalledTimes(3);
  expect(upload).toHaveBeenCalledWith(expect.objectContaining({uri: 'file:///cache/1.jpg'}), 'post');

  launch.mockResolvedValueOnce({assets: [asset(4)]});
  await press(renderer, 'Add photos');
  expect(launch).toHaveBeenLastCalledWith(expect.objectContaining({selectionLimit: 1}));
  expect(byLabel(renderer, 'Add photos').props.disabled).toBe(true);

  await press(renderer, 'Remove photo 2');
  await press(renderer, 'Post');
  expect(onSubmit).toHaveBeenCalledWith('Beach day', [1, 3, 4].map(n => ({url: urlOf(n), type: 'IMAGE'})));
});

test('blocks posting while an upload is in flight, and allows a photo-only post', async () => {
  let finish: (value: {key: string; fileUrl: string}) => void = () => {};
  upload.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
  const {renderer, onSubmit} = await render('');
  launch.mockResolvedValueOnce({assets: [asset(1)]});
  await press(renderer, 'Add photos');

  expect(byLabel(renderer, 'Uploading…').props.disabled).toBe(true);
  expect(texts(renderer)).toContain('Uploading photos…');

  await ReactTestRenderer.act(async () => { finish({key: 'k', fileUrl: urlOf(1)}); });
  expect(byLabel(renderer, 'Post').props.disabled).toBe(false);
  await press(renderer, 'Post');
  expect(onSubmit).toHaveBeenCalledWith('', [{url: urlOf(1), type: 'IMAGE'}]);
});

test('reports a rejected "post" purpose and blocks posting until the photo is removed', async () => {
  upload.mockRejectedValueOnce({status: 400, message: 'Invalid request body', details: [{field: 'purpose', message: 'Invalid enum value'}]});
  const {renderer} = await render('Hello');
  launch.mockResolvedValueOnce({assets: [asset(1)]});
  await press(renderer, 'Add photos');

  expect(texts(renderer).join('\n')).toMatch(/upload purpose "post" was rejected/);
  expect(byLabel(renderer, 'Post').props.disabled).toBe(true);
  await press(renderer, 'Remove photo 1');
  expect(byLabel(renderer, 'Post').props.disabled).toBe(false);
});

test('createPost sends media and omits empty text', async () => {
  const apiPost = {id: 'n', body: null, media: [{url: urlOf(1), type: 'IMAGE'}], visibility: 'PUBLIC', createdAt: '', updatedAt: '',
    author: {id: 'me', name: 'Me', avatarUrl: null}, reactions: {likeCount: 0, viewerHasLiked: false}};
  request.mockResolvedValue(apiPost);
  const created = await createPost('', [{url: urlOf(1), type: 'IMAGE'}]);
  expect(request).toHaveBeenLastCalledWith('/posts', {auth: 'required', method: 'POST', body: JSON.stringify({media: [{url: urlOf(1), type: 'IMAGE'}]})});
  expect(created.images).toEqual([urlOf(1)]);

  await createPost('Hi', [{url: urlOf(2), type: 'IMAGE'}]);
  expect(request).toHaveBeenLastCalledWith('/posts', {auth: 'required', method: 'POST', body: JSON.stringify({body: 'Hi', media: [{url: urlOf(2), type: 'IMAGE'}]})});
});
