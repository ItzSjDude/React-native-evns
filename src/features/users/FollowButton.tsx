import React from 'react';
import {ActivityIndicator, Pressable, Text} from 'react-native';
import IconUserPlus from '@tabler/icons-react-native/IconUserPlus';
import IconUserCheck from '@tabler/icons-react-native/IconUserCheck';
import {Colors} from '../../Constants/Colors';

type Props = {
  name: string;
  following: boolean | null;
  pending?: boolean;
  onPress: () => void;
  /** 'large' is the hero's primary action; 'small' sits at the end of a list row. */
  size?: 'large' | 'small';
};

/** Gold "Follow" when not following, outline "Following" when you are; a spinner while unknown. */
export default function FollowButton({name, following, pending, onPress, size = 'large'}: Props) {
  const large = size === 'large';
  const shape = large ? 'h-11 flex-1 gap-2 px-4' : 'h-9 min-w-[98px] gap-1.5 px-3.5';
  if (following === null) {
    return <Pressable accessibilityRole="button" accessibilityLabel={`Follow ${name}`} accessibilityState={{disabled: true, busy: true}} disabled
      className={`flex-row items-center justify-center rounded-full bg-gold/40 ${shape}`}>
      <ActivityIndicator size="small" color={Colors.goldInk} />
    </Pressable>;
  }
  const Icon = following ? IconUserCheck : IconUserPlus;
  const label = following ? 'Following' : 'Follow';
  return <Pressable accessibilityRole="button" accessibilityLabel={following ? `Unfollow ${name}` : `Follow ${name}`}
    accessibilityState={{selected: following, busy: !!pending}} onPress={onPress}
    className={`flex-row items-center justify-center rounded-full ${shape} ${following ? 'border-[1.5px] border-purple-line active:opacity-70' : 'bg-gold active:opacity-80'}`}>
    <Icon size={large ? 16 : 14} color={following ? '#E6E0FF' : Colors.goldInk} />
    <Text className={`${large ? 'text-[13px]' : 'text-[12px]'} font-extrabold ${following ? 'text-[#E6E0FF]' : 'text-gold-ink'}`}>{label}</Text>
  </Pressable>;
}
