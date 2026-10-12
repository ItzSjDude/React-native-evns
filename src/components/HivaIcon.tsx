import React from 'react';
import Svg, {Circle, Path, Rect} from 'react-native-svg';

type Props = {size: number; variant: 'light' | 'dark'};

const TILE = {
  dark: {bg: '#111114', stroke: '#111114', fg: '#FFFFFF'},
  light: {bg: '#F4F3EF', stroke: '#DDDBD3', fg: '#111114'},
};

/** The "h." tile. `dark` = dark tile with white glyph, `light` = light tile with dark glyph. */
export default function HivaIcon({size, variant}: Props) {
  const c = TILE[variant];
  return (
    <Svg width={size} height={size} viewBox="0 0 180 180">
      <Rect x={0.25} y={0.25} width={179.5} height={179.5} rx={40} fill={c.bg} stroke={c.stroke} strokeWidth={0.5} />
      <Path d="M55 45 L55 135 M55 98 Q55 72 80 72 Q105 72 105 98 L105 135" fill="none" stroke={c.fg} strokeWidth={16} strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx={132} cy={130} r={10} fill="#7C6CF0" />
    </Svg>
  );
}
