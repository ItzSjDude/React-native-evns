import {useColorScheme} from 'react-native';
import type {ProfileThemeId} from './types';

/** Colors a profile surface needs: the accent fills, the ink on top of them and the hero's radial glow. */
export type ProfileThemeColors = {accent: string; onAccent: string; glow: string; glowMid: string};

export const PROFILE_THEMES: {id: ProfileThemeId; label: string; swatch: string}[] = [
  {id: 'default', label: 'Default', swatch: '#8B7CF6'},
  {id: 'aurora', label: 'Aurora', swatch: '#F472B6'},
  {id: 'midnight', label: 'Midnight', swatch: '#6366F1'},
];

const THEMES: Record<Exclude<ProfileThemeId, 'default'>, {dark: ProfileThemeColors; light: ProfileThemeColors}> = {
  aurora: {
    dark: {accent: '#F472B6', onAccent: '#2A0A1A', glow: '#3B1A32', glowMid: '#241524'},
    light: {accent: '#F472B6', onAccent: '#2A0A1A', glow: '#FCE7F3', glowMid: '#FDF2F8'},
  },
  midnight: {
    dark: {accent: '#6366F1', onAccent: '#FFFFFF', glow: '#23245A', glowMid: '#171740'},
    light: {accent: '#6366F1', onAccent: '#FFFFFF', glow: '#E0E7FF', glowMid: '#EEF2FF'},
  },
};

/** `null` for the default theme, so callers keep their existing lavender styling untouched. */
export const profileThemeColors = (id: ProfileThemeId | null | undefined, scheme: 'light' | 'dark' | null | undefined): ProfileThemeColors | null =>
  id && id !== 'default' && THEMES[id] ? THEMES[id][scheme === 'light' ? 'light' : 'dark'] : null;

export const useProfileTheme = (id: ProfileThemeId | null | undefined) => profileThemeColors(id, useColorScheme());
