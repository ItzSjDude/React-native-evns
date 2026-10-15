import React from 'react';
import {Text} from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import CommentsSheet from '../CommentsSheet';
import {getPostComments} from '../homeService';
import type {HomePost} from '../types';

jest.mock('../homeService', () => ({getPostComments: jest.fn(), addPostComment: jest.fn(), deletePostComment: jest.fn()}));

const metrics = {frame: {x: 0, y: 0, width: 390, height: 844}, insets: {top: 0, left: 0, right: 0, bottom: 0}};
const post = {id: 'p1', author: 'Asha', comments: 2} as HomePost;
const comment = (id: string, body: string) => ({id, body, createdAt: new Date().toISOString(), author: {id: `a-${id}`, name: 'Ravi', avatarUrl: null}});

test('highlights the comment a notification points at', async () => {
  (getPostComments as jest.Mock).mockResolvedValue({items: [comment('c1', 'First'), comment('c2', 'Nice pic')], hasMore: false, offset: 0});
  let renderer: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<SafeAreaProvider initialMetrics={metrics}>
      <CommentsSheet visible post={post} viewerId="me" onClose={jest.fn()} onCountChange={jest.fn()} focusCommentId="c2" />
    </SafeAreaProvider>);
  });
  await ReactTestRenderer.act(async () => {await new Promise<void>(resolve => setTimeout(resolve, 0));});
  const highlighted = renderer!.root.findAll(node => typeof node.type === 'string' && /border-gold/.test(String(node.props.className ?? '')));
  expect(highlighted).toHaveLength(1);
  // Only the focused row measures itself for the scroll.
  const measured = renderer!.root.findAll(node => typeof node.type === 'string' && typeof node.props.onLayout === 'function' && node.props.className === 'mb-[14px] flex-row');
  expect(measured).toHaveLength(1);
  await ReactTestRenderer.act(async () => renderer!.unmount());
});

const mountSheet = async (focusCommentId?: string) => {
  let renderer: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<SafeAreaProvider initialMetrics={metrics}>
      <CommentsSheet visible post={post} viewerId="me" onClose={jest.fn()} onCountChange={jest.fn()} focusCommentId={focusCommentId} />
    </SafeAreaProvider>);
  });
  await ReactTestRenderer.act(async () => {await new Promise<void>(resolve => setTimeout(resolve, 0));});
  return renderer!;
};
const texts = (renderer: ReactTestRenderer.ReactTestRenderer) => renderer.root.findAllByType(Text).map(node => [node.props.children].flat().join(''));
const press = async (renderer: ReactTestRenderer.ReactTestRenderer, label: string) => {
  await ReactTestRenderer.act(async () => {renderer.root.findByProps({accessibilityLabel: label}).props.onPress();});
  await ReactTestRenderer.act(async () => {await new Promise<void>(resolve => setTimeout(resolve, 0));});
};

test('opens on the page that holds a notification comment and loads earlier ones on request', async () => {
  const getPage = getPostComments as jest.Mock;
  getPage.mockReset();
  getPage.mockResolvedValueOnce({items: [comment('c41', 'Mid thread')], hasMore: true, offset: 40, focusIndex: 0});
  const renderer = await mountSheet('c41');
  expect(getPage).toHaveBeenNthCalledWith(1, 'p1', 0, undefined, 'c41');
  expect(texts(renderer)).toContain('Mid thread');

  getPage.mockResolvedValueOnce({items: [comment('c21', 'Earlier one')], hasMore: true, offset: 20});
  await press(renderer, 'Load earlier comments');
  expect(getPage).toHaveBeenNthCalledWith(2, 'p1', 20, 20);
  const order = texts(renderer);
  expect(order.indexOf('Earlier one')).toBeLessThan(order.indexOf('Mid thread'));

  getPage.mockResolvedValueOnce({items: [comment('c61', 'Later one')], hasMore: false, offset: 60});
  await press(renderer, 'Load more comments');
  // "Load more" continues after the last loaded comment: start 20 + two loaded rows.
  expect(getPage.mock.calls[2].slice(0, 2)).toEqual(['p1', 22]);
  await ReactTestRenderer.act(async () => renderer.unmount());
});

test('shows no "Load earlier" control when the first page was served', async () => {
  (getPostComments as jest.Mock).mockReset();
  (getPostComments as jest.Mock).mockResolvedValue({items: [comment('c1', 'First')], hasMore: false, offset: 0});
  const renderer = await mountSheet('missing');
  expect(renderer.root.findAllByProps({accessibilityLabel: 'Load earlier comments'})).toHaveLength(0);
  await ReactTestRenderer.act(async () => renderer.unmount());
});
