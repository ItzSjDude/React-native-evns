import React from 'react';
import Svg, {Circle, Path} from 'react-native-svg';
import {Colors} from './Colors';

export type IconName =
  | 'bell'
  | 'plus'
  | 'comment'
  | 'share'
  | 'user'
  | 'home'
  | 'nearby'
  | 'party'
  | 'messages'
  | 'profile'
  | 'location'
  | 'music'
  | 'rocket'
  | 'football'
  | 'chevron'
  | 'people'
  | 'shield'
  | 'edit'
  | 'logout'
  | 'menu';

type IconProps = {
  name: IconName;
  size?: number;
  color?: string;
};

export const AppIcon = ({
  name,
  size = 24,
  color = Colors.text,
}: IconProps) => {
  const common = {
    fill: 'none' as const,
    stroke: color,
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };

  if (name === 'bell') {
    return <Svg width={size} height={size} viewBox="0 0 24 24"><Path {...common} d="M6.5 17.5h11M8 17.5V10a4 4 0 0 1 8 0v7.5M10 20h4" /></Svg>;
  }
  if (name === 'plus') {
    return <Svg width={size} height={size} viewBox="0 0 24 24"><Circle {...common} cx="12" cy="12" r="8.5" /><Path {...common} d="M12 8v8M8 12h8" /></Svg>;
  }
  if (name === 'comment' || name === 'messages') {
    return <Svg width={size} height={size} viewBox="0 0 24 24"><Path {...common} d="M4 5.5h16v11H9l-5 3v-14Z" /></Svg>;
  }
  if (name === 'share') {
    return <Svg width={size} height={size} viewBox="0 0 24 24"><Path {...common} d="M12 15V4M8 8l4-4 4 4M5 12v7h14v-7" /></Svg>;
  }
  if (name === 'home') {
    return <Svg width={size} height={size} viewBox="0 0 24 24"><Path fill={color} d="m4 10 8-6 8 6v9H4Z" /><Path stroke={Colors.card} strokeWidth="1.5" d="M9.5 19v-5h5v5" /></Svg>;
  }
  if (name === 'nearby') {
    return <Svg width={size} height={size} viewBox="0 0 24 24"><Circle {...common} cx="12" cy="12" r="2" /><Path {...common} d="M7.8 7.8a6 6 0 0 0 0 8.4M16.2 7.8a6 6 0 0 1 0 8.4M4.8 4.8a10.2 10.2 0 0 0 0 14.4M19.2 4.8a10.2 10.2 0 0 1 0 14.4" /></Svg>;
  }
  if (name === 'party') {
    return <Svg width={size} height={size} viewBox="0 0 24 24"><Path {...common} d="M7 9h10v8a3 3 0 0 1-3 3h-4a3 3 0 0 1-3-3V9ZM5 10H4a2 2 0 0 0 0 4h3M19 10h1a2 2 0 0 1 0 4h-3M9 6a3 3 0 0 1 6 0v3H9V6ZM12 3v3" /></Svg>;
  }
  if (name === 'profile' || name === 'user') {
    return <Svg width={size} height={size} viewBox="0 0 24 24"><Circle {...common} cx="12" cy="8" r="3" /><Path {...common} d="M5.5 20a6.5 6.5 0 0 1 13 0" /></Svg>;
  }
  if (name === 'location') {
    return <Svg width={size} height={size} viewBox="0 0 24 24"><Path {...common} d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" /><Circle {...common} cx="12" cy="10" r="2.5" /></Svg>;
  }
  if (name === 'music') {
    return <Svg width={size} height={size} viewBox="0 0 24 24"><Path {...common} d="M9 18V5l10-2v13M9 18a3 3 0 1 1-3-3 3 3 0 0 1 3 3Zm10-2a3 3 0 1 1-3-3 3 3 0 0 1 3 3Z" /></Svg>;
  }
  if (name === 'rocket') {
    return <Svg width={size} height={size} viewBox="0 0 24 24"><Path {...common} d="M14 4c2.5-2 5-2 6-2 0 1 0 3-2 6l-5 5-4-4 5-5ZM9 9 5 10l-2 3 5 1M15 15l-1 4-3 2-1-5M7 17l-2 2M5 14l-2 1" /></Svg>;
  }
  if (name === 'football') {
    return <Svg width={size} height={size} viewBox="0 0 24 24"><Circle {...common} cx="12" cy="12" r="9" /><Path {...common} d="m12 8 3 2-1 4h-4l-1-4 3-2Zm0 0V5m3 5 3 1m-4 3 2 3m-6-3-2 3m1-6-3 1" /></Svg>;
  }
  if (name === 'chevron') {
    return <Svg width={size} height={size} viewBox="0 0 24 24"><Path {...common} d="m9 5 7 7-7 7" /></Svg>;
  }
  if (name === 'people') {
    return <Svg width={size} height={size} viewBox="0 0 24 24"><Circle {...common} cx="9" cy="8" r="3" /><Path {...common} d="M3 20a6 6 0 0 1 12 0M16 5a3 3 0 0 1 0 6M17 14a5 5 0 0 1 4 6" /></Svg>;
  }
  if (name === 'shield') {
    return <Svg width={size} height={size} viewBox="0 0 24 24"><Path {...common} d="M12 21s8-3 8-10V5l-8-3-8 3v6c0 7 8 10 8 10Z" /><Path {...common} d="M12 8v5m0 3h.01" /></Svg>;
  }
  if (name === 'edit') {
    return <Svg width={size} height={size} viewBox="0 0 24 24"><Path {...common} d="m4 16-.8 4.8L8 20l11-11-4-4L4 16ZM13.5 6.5l4 4" /></Svg>;
  }
  if (name === 'logout') {
    return <Svg width={size} height={size} viewBox="0 0 24 24"><Path {...common} d="M10 4H5v16h5M14 8l4 4-4 4M18 12H9" /></Svg>;
  }
  if (name === 'menu') {
    return <Svg width={size} height={size} viewBox="0 0 24 24"><Circle fill={color} cx="12" cy="5" r="1.5" /><Circle fill={color} cx="12" cy="12" r="1.5" /><Circle fill={color} cx="12" cy="19" r="1.5" /></Svg>;
  }
  return null;
};

export default AppIcon;
