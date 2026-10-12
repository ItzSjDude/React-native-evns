import React from 'react';
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
