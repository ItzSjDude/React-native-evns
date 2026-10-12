import ReactTestRenderer from 'react-test-renderer';

/** Fills the mandatory non-text fields of onboarding step 1. `press` is the test file's own press helper. */
export async function fillProfile(renderer: ReactTestRenderer.ReactTestRenderer, press: (renderer: ReactTestRenderer.ReactTestRenderer, label: string) => Promise<void>) {
  await press(renderer, 'Male');
  await press(renderer, 'Country');
  // The list is virtualised, so narrow it before picking.
  const search = renderer.root.find(node => node.props.accessibilityLabel === 'Search country' && typeof node.props.onChangeText === 'function');
  await ReactTestRenderer.act(async () => { search.props.onChangeText('India'); });
  await press(renderer, 'Country India');
  await press(renderer, 'Developer');
}
