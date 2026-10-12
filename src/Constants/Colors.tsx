import {Appearance} from 'react-native';

const dark = {
  background: '#0B0914',
  card: '#191824',
  sheet: '#0B0914',
  gold: '#8B7CF6',
  goldInk: '#160F2E',
  purpleSoft: '#A78BFA',
  border: '#363342',
  borderMuted: '#4A4659',
  primary: '#A78BFA',
  primaryDark: '#211B43',
  primaryBorder: '#8A6BFF',
  navBackground: '#100E1B',
  text: '#F7F5FF',
  textDark: '#10152F',
  textNavy: '#111B42',
  textBody: '#E7E4EF',
  muted: '#9A97A9',
  mutedLight: '#687087',
  white: '#FFFFFF',
  coral: '#FF786F',
  avatar: '#77717C',
  iconDark: '#080711',
  googleBorder: '#E7E9EC',
  googleBorderMid: '#C6CFD8',
  googleBorderBlue: '#5D86AA',
  shadow: '#7D8794',
  transparent: 'transparent',
  /** Profile hero glow, fading into the background. */
  heroGlow: '#3B2A86',
  heroGlowMid: '#1A1338',
  /** Soft lavender text/icons on dark surfaces. */
  textSoft: '#E6E0FF',
  /** Highest-contrast icon colour (white on dark). */
  iconStrong: '#FFFFFF',
  /** Profile screen hero glow. */
  profileGlow: '#2A1F5C',
};

type Palette = {[K in keyof typeof dark]: string};

// Mirrors the light values in global.css; accents (gold, coral, inks) are shared.
const light: Palette = {
  ...dark,
  background: '#FFFFFF',
  card: '#F3F2F7',
  sheet: '#FFFFFF',
  purpleSoft: '#6750D9',
  border: '#E2E0E8',
  borderMuted: '#CFCCD9',
  primary: '#7356E8',
  primaryDark: '#ECE7FF',
  navBackground: '#FFFFFF',
  text: '#0F0E16',
  textBody: '#2B2933',
  muted: '#6E6B7B',
  mutedLight: '#8C91A1',
  heroGlow: '#E4DCFF',
  heroGlowMid: '#F4F1FF',
  textSoft: '#2B2933',
  iconStrong: '#0F0E16',
  profileGlow: '#EEE9FF',
};

/** Picks the dark or light value on each read, following the system theme like the Tailwind tokens do. */
export const themed = <T extends object>(darkValues: T, lightValues: T): T =>
  // ponytail: a component only picks up a theme switch on its next render; add a theme context if live switching must repaint instantly.
  new Proxy(darkValues, {get: (_, key) => (Appearance.getColorScheme() === 'light' ? lightValues : darkValues)[key as keyof T]});

export const Colors = themed<Palette>(dark, light);
