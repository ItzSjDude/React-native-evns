import React from 'react';
import {Text} from 'react-native';
import {act, create, type ReactTestRenderer} from 'react-test-renderer';
import IconGift from '@tabler/icons-react-native/IconGift';
import GradientBanner from '../GradientBanner';

const LABEL = 'Become a creator and earn from gifts';
let tree: ReactTestRenderer;
const texts = () => tree.root.findAllByType(Text).map(node => [node.props.children].flat().join(''));
// Presses the host View the way a tap does, so a disabled Pressable really drops the press.
const tap = () => {
  const host = tree.root.find(node => typeof node.type === 'string' && node.props.accessibilityLabel === LABEL && node.props.accessibilityRole === 'button');
  const target = {};
  act(() => host.props.onClick({currentTarget: target, target, nativeEvent: {}}));
};
const mount = (props: Partial<React.ComponentProps<typeof GradientBanner>> = {}) => {
  const onPress = jest.fn();
  act(() => {
    tree = create(<GradientBanner icon={IconGift} title="Become a creator" subtitle="Set up your profile and earn from gifts" accessibilityLabel={LABEL} onPress={onPress} {...props} />);
  });
  return onPress;
};

afterEach(() => act(() => tree.unmount()));

test('renders a white title and a one-line subtitle', () => {
  mount();
  expect(texts()).toEqual(['Become a creator', 'Set up your profile and earn from gifts']);
  const [title, subtitle] = tree.root.findAllByType(Text);
  expect(title.props.className).toContain('text-white');
  expect(subtitle.props.className).toContain('text-white');
  expect(subtitle.props.numberOfLines).toBe(1);
});

test('is exposed as a button with the given accessibility label', () => {
  mount();
  const host = tree.root.find(node => typeof node.type === 'string' && node.props.accessibilityLabel === LABEL);
  expect(host.props.accessibilityRole).toBe('button');
});

test('runs onPress when tapped', () => {
  const onPress = mount();
  tap();
  expect(onPress).toHaveBeenCalledTimes(1);
});

test('a disabled banner does not run onPress', () => {
  const onPress = mount({disabled: true, accessibilityState: {disabled: true}});
  expect(tree.root.findByProps({accessibilityLabel: LABEL}).props.accessibilityState).toEqual({disabled: true});
  tap();
  expect(onPress).not.toHaveBeenCalled();
});
