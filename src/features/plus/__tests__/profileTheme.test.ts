import {profileThemeColors, themeSwatch, usableThemeId} from '../profileTheme';
import {catalog} from '../__fixtures__/themeFixtures';

test('default and unknown themes leave the existing lavender styling alone', () => {
  expect(profileThemeColors('default', 'dark')).toBeNull();
  expect(profileThemeColors(undefined, 'dark')).toBeNull();
  expect(profileThemeColors('nope', 'dark')).toBeNull();
  // Object.prototype names are valid server ids but must not hit the palette lookup.
  expect(profileThemeColors('constructor', 'dark')).toBeNull();
});

test('Plus themes follow the color scheme', () => {
  expect(profileThemeColors('aurora', 'dark')).toMatchObject({accent: '#F472B6', glow: '#3B1A32'});
  expect(profileThemeColors('aurora', 'light')).toMatchObject({accent: '#F472B6', glow: '#FCE7F3'});
  expect(profileThemeColors('midnight', null)?.accent).toBe('#6366F1');
});

test('swatches: palette accent, lavender default, neutral for ids this app has no palette for', () => {
  expect(themeSwatch('aurora')).toBe('#F472B6');
  expect(themeSwatch('default')).toBe('#8B7CF6');
  expect(themeSwatch('neon')).toBe('#94A3B8');
});

test('only a selection the catalog marks usable applies; otherwise default', () => {
  expect(usableThemeId('aurora', catalog(true))).toBe('aurora');
  expect(usableThemeId('aurora', catalog(false))).toBe('default');
  expect(usableThemeId('aurora', null)).toBe('default');
  expect(usableThemeId('removed_theme', catalog(true))).toBe('default');
  expect(usableThemeId(undefined, catalog(true))).toBe('default');
});
