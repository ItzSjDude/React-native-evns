import React from 'react';
import {Text, View} from 'react-native';

/** Small lavender "PLUS" pill shown beside a Plus member's name. */
export default function PlusBadge({size = 'sm'}: {size?: 'sm' | 'md'}) {
  return <View accessible accessibilityLabel="Hiva Plus member" className={`ml-1.5 shrink-0 rounded-full border border-purple-line bg-purple-tint ${size === 'md' ? 'px-2 py-0.5' : 'px-1.5 py-px'}`}>
    <Text className={`font-extrabold tracking-[0.6px] text-purple-soft ${size === 'md' ? 'text-[11px]' : 'text-[9px]'}`}>PLUS</Text>
  </View>;
}
