import {Text} from 'react-native';
import ReactTestRenderer from 'react-test-renderer';

type Renderer = ReactTestRenderer.ReactTestRenderer;

export const pressable = (renderer: Renderer, label: string) =>
  renderer.root.find(node => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function');

export const press = async (renderer: Renderer, label: string) => {
  await ReactTestRenderer.act(async () => { await pressable(renderer, label).props.onPress(); });
};

export const texts = (renderer: Renderer) =>
  renderer.root.findAllByType(Text).map(node => [node.props.children].flat().join('')).join('\n');

/** Picks a date through the three selects, e.g. pickDob(r, 12, 'March', 1998). */
export async function pickDob(renderer: Renderer, day: number, month: string, year: number) {
  await press(renderer, 'Birth year');
  await press(renderer, `Year ${year}`);
  await press(renderer, 'Birth month');
  await press(renderer, `Month ${month}`);
  await press(renderer, 'Birth day');
  await press(renderer, `Day ${day}`);
}
