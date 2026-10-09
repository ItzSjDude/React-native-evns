/**
 * Home feed palette, sampled from the feed design: neutral near-black surfaces (not the app's
 * purple-tinted ones), light-grey text and a lavender accent. Mirrors the `feed-*` Tailwind tokens for
 * places that need a raw colour (icons, SVG).
 */
export const FeedColors = {
  background: '#0B0B0D',
  line: '#1A1A1F',
  card: '#17171C',
  text: '#EDEDF0',
  label: '#C4C4CB',
  muted: '#6B6B73',
  dim: '#5E5E65',
  accent: '#988DF8',
} as const;

/** Avatar tints for people without a photo, picked per name so the same person always gets the same colour. */
const AVATAR_TINTS = [
  {background: '#242238', text: '#B7B0F9'},
  {background: '#19221B', text: '#A0C367'},
  {background: '#2A2218', text: '#E3B66B'},
  {background: '#2B1D24', text: '#E58BA6'},
  {background: '#172629', text: '#7CCBC8'},
  {background: '#1B2234', text: '#8FB4F5'},
] as const;

export const avatarTint = (name: string) => {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) hash = (hash * 31 + name.charCodeAt(i)) % 2147483647;
  return AVATAR_TINTS[Math.abs(hash) % AVATAR_TINTS.length];
};
