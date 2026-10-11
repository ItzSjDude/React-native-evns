import React from 'react';
import {Switch, TextInput} from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import DiscoveryFilterBar from '../DiscoveryFilterBar';
import {getPlusState, resetPlus, setSubscription} from '../plusStore';
import {subscription} from '../__fixtures__/plusFixtures';

jest.mock('../plusService', () => ({...jest.requireActual('../plusService'), getSubscription: jest.fn()}));

type Renderer = ReactTestRenderer.ReactTestRenderer;
let tree: Renderer | undefined;
const onChange = jest.fn();
const render = async (filters = {}) => {
  await ReactTestRenderer.act(async () => {tree = ReactTestRenderer.create(<DiscoveryFilterBar filters={filters} onChange={onChange} />);});
  return tree!;
};
const byLabel = (renderer: Renderer, label: string) =>
  renderer.root.findAll(node => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function');
const press = (renderer: Renderer, label: string) => ReactTestRenderer.act(async () => {byLabel(renderer, label)[0].props.onPress();});

afterEach(() => ReactTestRenderer.act(() => tree?.unmount()));
beforeEach(() => {
  jest.clearAllMocks();
  resetPlus();
});

test('a free user sees the lock and tapping opens the filters paywall instead of the sheet', async () => {
  setSubscription(subscription({plan: 'free'}));
  const renderer = await render();
  await press(renderer, 'Filters, requires Hiva Plus');
  expect(getPlusState().paywall).toMatchObject({visible: true, reason: 'filters'});
  expect(renderer.root.findAllByType(TextInput)).toHaveLength(0);
  expect(onChange).not.toHaveBeenCalled();
});

test('a free user never counts stale filters as active', async () => {
  setSubscription(subscription({plan: 'free'}));
  const renderer = await render({city: 'Pune'});
  expect(byLabel(renderer, 'Clear all filters')).toHaveLength(0);
});

test('a Plus user edits filters in the sheet and applies them', async () => {
  setSubscription(subscription({plan: 'plus', status: 'ACTIVE'}));
  const renderer = await render();
  await press(renderer, 'Filters');
  expect(getPlusState().paywall.visible).toBe(false);

  const [city] = renderer.root.findAllByType(TextInput);
  await ReactTestRenderer.act(async () => {city.props.onChangeText('Pune');});
  await press(renderer, 'Hindi');
  await ReactTestRenderer.act(async () => {renderer.root.findByType(Switch).props.onValueChange(true);});
  await press(renderer, 'Apply filters');
  expect(onChange).toHaveBeenCalledWith({city: 'Pune', language: 'hi', activeNow: true});
});

test('Clear all resets every filter', async () => {
  setSubscription(subscription({plan: 'plus', status: 'ACTIVE'}));
  const renderer = await render({city: 'Pune', activeNow: true});
  expect(byLabel(renderer, 'Filters, 2 active')).toHaveLength(1);
  await press(renderer, 'Clear all filters');
  expect(onChange).toHaveBeenCalledWith({});
});

test('nothing renders while the server does not offer Plus', async () => {
  setSubscription(subscription({enabled: false}));
  const renderer = await render();
  expect(renderer.toJSON()).toBeNull();
});
