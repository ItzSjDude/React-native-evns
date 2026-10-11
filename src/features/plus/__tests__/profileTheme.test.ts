import {profileThemeColors} from '../profileTheme';

test('default and unknown themes leave the existing lavender styling alone', () => {
  expect(profileThemeColors('default', 'dark')).toBeNull();
  expect(profileThemeColors(undefined, 'dark')).toBeNull();
  expect(profileThemeColors('nope' as never, 'dark')).toBeNull();
});

test('Plus themes follow the color scheme', () => {
  expect(profileThemeColors('aurora', 'dark')).toMatchObject({accent: '#F472B6', glow: '#3B1A32'});
  expect(profileThemeColors('aurora', 'light')).toMatchObject({accent: '#F472B6', glow: '#FCE7F3'});
  expect(profileThemeColors('midnight', null)?.accent).toBe('#6366F1');
});
