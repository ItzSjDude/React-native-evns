import React from 'react';
import {Modal, Text} from 'react-native';
import {act, create, type ReactTestRenderer} from 'react-test-renderer';
import {DialogHost, showDialog} from '../Dialog';

let tree: ReactTestRenderer;
const texts = () => tree.root.findAllByType(Text).map(node => [node.props.children].flat().join(''));
const tap = (label: string) => act(() => tree.root.find(node => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function').props.onPress());

beforeEach(async () => {await act(async () => {tree = create(<DialogHost />);});});
afterEach(async () => {await act(async () => tree.unmount());});

test('shows queued dialogs one at a time and runs the pressed button', async () => {
  const leave = jest.fn();
  await act(async () => {
    showDialog('Leave party?', 'You can join again later.', [{text: 'Stay', style: 'cancel'}, {text: 'Leave', style: 'destructive', onPress: leave}]);
    showDialog('Second');
  });
  expect(texts()).toEqual(['Leave party?', 'You can join again later.', 'Stay', 'Leave']);
  await tap('Leave');
  expect(leave).toHaveBeenCalledTimes(1);
  expect(texts()).toEqual(['Second', 'OK']);
  await tap('OK');
  expect(tree.root.findAllByType(Modal)).toHaveLength(0);
});

test('back press runs cancel, and is ignored when there is no cancel button', async () => {
  const stay = jest.fn();
  await act(async () => {showDialog('Pick one', undefined, [{text: 'A'}, {text: 'B'}]);});
  await act(() => tree.root.findByType(Modal).props.onRequestClose());
  expect(texts()).toContain('Pick one');
  await tap('A');
  await act(async () => {showDialog('Sure?', undefined, [{text: 'Stay', style: 'cancel', onPress: stay}, {text: 'Go'}]);});
  await act(() => tree.root.findByType(Modal).props.onRequestClose());
  expect(stay).toHaveBeenCalledTimes(1);
  expect(tree.root.findAllByType(Modal)).toHaveLength(0);
});
