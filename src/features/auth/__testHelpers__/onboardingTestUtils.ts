import ReactTestRenderer from 'react-test-renderer';

/** Fills the personal-details step after the identity step has advanced. */
export async function fillAbout(renderer: ReactTestRenderer.ReactTestRenderer, press: (renderer: ReactTestRenderer.ReactTestRenderer, label: string) => Promise<void>) {
  await press(renderer, 'Male');
  await press(renderer, 'Country');
  // The list is virtualised, so narrow it before picking.
  const search = renderer.root.find(node => node.props.accessibilityLabel === 'Search country' && typeof node.props.onChangeText === 'function');
  await ReactTestRenderer.act(async () => { search.props.onChangeText('India'); });
  await press(renderer, 'Country India');
}
