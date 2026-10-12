import {useColorScheme} from 'react-native';
import type {ProfileThemeEntry, ProfileThemeId} from './types';

/** Colors a profile surface needs: the accent fills, the ink on top of them and the hero's radial glow. */
export type ProfileThemeColors = {accent: string; onAccent: string; glow: string; glowMid: string};

const THEMES: Record<string, {dark: ProfileThemeColors; light: ProfileThemeColors}> = {
  aurora: {
    dark: {accent: '#F472B6', onAccent: '#2A0A1A', glow: '#3B1A32', glowMid: '#241524'},
    light: {accent: '#F472B6', onAccent: '#2A0A1A', glow: '#FCE7F3', glowMid: '#FDF2F8'},
  },
  midnight: {
    dark: {accent: '#6366F1', onAccent: '#FFFFFF', glow: '#23245A', glowMid: '#171740'},
    light: {accent: '#6366F1', onAccent: '#FFFFFF', glow: '#E0E7FF', glowMid: '#EEF2FF'},
  },
};

const DEFAULT_SWATCH = '#8B7CF6';
const NEUTRAL_SWATCH = '#94A3B8';
/** Only ids with a client palette can look different; anything else the server adds degrades to default. */
const hasPalette = (id: string) => Object.prototype.hasOwnProperty.call(THEMES, id);

/** `null` for the default theme and any id without a client palette, so callers keep their existing lavender styling untouched. */
export const profileThemeColors = (id: ProfileThemeId | null | undefined, scheme: 'light' | 'dark' | null | undefined): ProfileThemeColors | null =>
  id && hasPalette(id) ? THEMES[id][scheme === 'light' ? 'light' : 'dark'] : null;

export const useProfileTheme = (id: ProfileThemeId | null | undefined) => profileThemeColors(id, useColorScheme());

/** Picker dot: the palette accent, lavender for default, neutral for a theme this app version has no palette for. */
export const themeSwatch = (id: ProfileThemeId) => (id === 'default' ? DEFAULT_SWATCH : profileThemeColors(id, 'dark')?.accent ?? NEUTRAL_SWATCH);

/** The selection if the catalog says this account may use it right now, else 'default'. */
export const usableThemeId = (selected: ProfileThemeId | null | undefined, themes: ProfileThemeEntry[] | null): ProfileThemeId =>
  selected && themes?.some(theme => theme.id === selected && theme.owned && theme.available) ? selected : 'default';
