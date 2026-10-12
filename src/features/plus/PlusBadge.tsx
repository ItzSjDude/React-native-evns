import React from 'react';
import {Image} from 'react-native';

/** Purple diamond shown beside a Plus member's name. */
export default function PlusBadge({size = 'sm'}: {size?: 'sm' | 'md'}) {
  return <Image accessible accessibilityLabel="Hiva Plus member" source={require('../../../assets/images/plus_diamond.png')} resizeMode="contain"
    className={`ml-1.5 shrink-0 ${size === 'md' ? 'h-[22px] w-[23px]' : 'h-[16px] w-[17px]'}`} />;
}
