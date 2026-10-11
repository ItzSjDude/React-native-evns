import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import PlusSettingsScreen from '../PlusSettingsScreen';
import {getPlusState, resetPlus, setSubscription} from '../plusStore';
import {subscription} from '../__fixtures__/plusFixtures';

const prefs = {showPlusBadge: false, profileTheme: 'default' as const};
let tree: ReactTestRenderer.ReactTestRenderer | undefined;
const render = async (onChange = jest.fn()) => {
  await ReactTestRenderer.act(async () => {tree = ReactTestRenderer.create(<PlusSettingsScreen visible onClose={jest.fn()} preferences={prefs} onChange={onChange} />);});
  return tree!;
};
const press = (label: string) => ReactTestRenderer.act(async () => {
  tree!.root.findAll(node => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function')[0].props.onPress();
});

afterEach(() => ReactTestRenderer.act(() => tree?.unmount()));
beforeEach(() => resetPlus());

test('a Plus member changes the badge and theme through onChange', async () => {
  setSubscription(subscription({plan: 'plus', status: 'ACTIVE', expiresAt: '2030-01-01T00:00:00Z'}));
  const onChange = jest.fn();
  await render(onChange);
  await press('Show Plus badge');
  expect(onChange).toHaveBeenCalledWith({showPlusBadge: true});
  await press('Aurora theme');
  expect(onChange).toHaveBeenCalledWith({profileTheme: 'aurora'});
});

test('a free user is sent to the paywall instead of changing settings', async () => {
  setSubscription(subscription());
  const onChange = jest.fn();
  await render(onChange);
  await press('Midnight theme');
  expect(onChange).not.toHaveBeenCalled();
  expect(getPlusState().paywall.visible).toBe(true);
});
