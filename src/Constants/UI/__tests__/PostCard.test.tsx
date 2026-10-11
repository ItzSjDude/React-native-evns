import React from 'react';
import {Text} from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import PostCard from '../PostCard';

jest.mock('../../../features/plus', () => ({PlusBadge: () => null}));

const render = async (content: string) => {
  let renderer: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<PostCard id="p1" author="Asha" time="2h" content={content} likes={0} />);
  });
  return renderer!;
};
// The invisible copy is the one that reports line counts.
const measure = (renderer: ReactTestRenderer.ReactTestRenderer, lines: number) => ReactTestRenderer.act(async () => {
  renderer.root.find(node => node.type === Text && typeof node.props.onTextLayout === 'function')
    .props.onTextLayout({nativeEvent: {lines: Array.from({length: lines}, () => ({}))}});
});
const moreButtons = (renderer: ReactTestRenderer.ReactTestRenderer) =>
  renderer.root.findAll(node => node.props.accessibilityLabel === 'Show full post' && typeof node.props.onPress === 'function');

test('long captions clamp to three lines with a "more" toggle', async () => {
  const renderer = await render('A long caption that keeps going');
  await measure(renderer, 6);
  const visible = () => renderer.root.find(node => node.type === Text && node.props.selectable);
  expect(visible().props.numberOfLines).toBe(3);
  await ReactTestRenderer.act(async () => moreButtons(renderer)[0].props.onPress());
  expect(visible().props.numberOfLines).toBeUndefined();
  expect(moreButtons(renderer)).toHaveLength(0);
});

test('short captions show no "more"', async () => {
  const renderer = await render('Hi');
  await measure(renderer, 1);
  expect(moreButtons(renderer)).toHaveLength(0);
});
