import {SLIDE_MODAL_ANIMATION} from '../../Constants/NavigationTransitions';

it('keeps modal transitions on the existing native slide animation', () => {
  expect(SLIDE_MODAL_ANIMATION).toBe('slide');
});
