import React from 'react';
import {Text} from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import PersonRow, {PersonRowSkeleton, arrangeChips} from '../PersonRow';

const render = (element: React.ReactElement) => {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => { renderer = ReactTestRenderer.create(element); });
  return renderer;
};
const texts = (r: ReactTestRenderer.ReactTestRenderer) => r.root.findAllByType(Text).map(node => [node.props.children].flat().join(''));
const byLabel = (r: ReactTestRenderer.ReactTestRenderer, label: string) => r.root.findAll(node => node.props.accessibilityLabel === label);

test('renders only the name when every optional field is missing', () => {
  const r = render(<PersonRow name="Asha Rao" />);
  expect(texts(r)).toEqual(['AR', 'Asha Rao']);
  expect(byLabel(r, 'Active now')).toHaveLength(0);
});

test('shows handle, bio, coarse meta, hint and follows-you when provided', () => {
  const r = render(<PersonRow name="Asha" handle="asha" followsYou bio="Into music" meta="Under 2 km" hint="Both at Sunburn" />);
  const shown = texts(r).join('|');
  expect(shown).toContain('@asha');
  expect(shown).toContain('Follows you');
  expect(shown).toContain('Into music');
  expect(shown).toContain('Under 2 km');
  expect(shown).toContain('· Both at Sunburn');
});

test('shows the Plus badge and active-now dot only when asked', () => {
  const r = render(<PersonRow name="Asha" plusBadge activeNow />);
  expect(byLabel(r, 'Hiva Plus member').length).toBeGreaterThan(0);
  expect(byLabel(r, 'Active now').length).toBeGreaterThan(0);
});

test('puts shared interests first, highlights them and collapses overflow into +N', () => {
  expect(arrangeChips(['Chess', 'Music', 'Art', 'Run', 'Yoga'], ['music', 'YOGA'], 3)).toEqual({
    chips: [{label: 'Music', shared: true}, {label: 'Yoga', shared: true}, {label: 'Chess', shared: false}],
    overflow: 2,
  });
  expect(arrangeChips(['a', 'a', ' ', 'b'], [], 5)).toEqual({chips: [{label: 'a', shared: false}, {label: 'b', shared: false}], overflow: 0});
  expect(arrangeChips(undefined, undefined)).toEqual({chips: [], overflow: 0});
  const r = render(<PersonRow name="Asha" interests={['Chess', 'Music', 'Art', 'Run']} sharedInterests={['Music']} maxChips={2} />);
  expect(byLabel(r, 'Music, shared interest').length).toBeGreaterThan(0);
  expect(byLabel(r, '2 more interests').length).toBeGreaterThan(0);
});

test('wires the row press, primary action and busy state', () => {
  const onPress = jest.fn();
  const onAction = jest.fn();
  const r = render(<PersonRow name="Asha" accessibilityLabel="Open Asha" onPress={onPress} actionLabel="Say hi" actionAccessibilityLabel="Message Asha" onAction={onAction} />);
  byLabel(r, 'Open Asha')[0].props.onPress();
  byLabel(r, 'Message Asha')[0].props.onPress();
  expect(onPress).toHaveBeenCalledTimes(1);
  expect(onAction).toHaveBeenCalledTimes(1);
  ReactTestRenderer.act(() => r.update(<PersonRow name="Asha" actionLabel="Say hi" actionAccessibilityLabel="Message Asha" actionBusy onAction={onAction} />));
  expect(byLabel(r, 'Message Asha')[0].props.accessibilityState).toEqual({disabled: true, busy: true});
  expect(texts(r)).not.toContain('Say hi');
});

test('renders an inline notice and a footer, and the skeleton mounts', () => {
  const r = render(<PersonRow variant="card" name="Asha" notice="Could not follow." footer={<Text>footer</Text>} />);
  expect(texts(r)).toEqual(expect.arrayContaining(['Could not follow.', 'footer']));
  expect(() => render(<PersonRowSkeleton />)).not.toThrow();
});
