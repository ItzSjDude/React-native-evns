import React from 'react';
import {Pressable, Text, View} from 'react-native';
import RemoteImage from './RemoteImage';

export type ProfileIdentityStat = {label: string; value: number | null; displayValue: string; dotClassName: string; onPress?: () => void};

export default function ProfileIdentity({name, avatarUrl, accentColor, stats, nameAccessory, avatarAction, children}: {
  name: string;
  avatarUrl?: string | null;
  accentColor: string;
  stats: ProfileIdentityStat[];
  nameAccessory?: React.ReactNode;
  avatarAction?: React.ReactNode;
  children?: React.ReactNode;
}) {
  const initials = (name || '?').trim().split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase();
  const remoteAvatar = !!avatarUrl && /^https?:\/\//i.test(avatarUrl);
  return <>
    <View className="flex-row items-center gap-5 px-5 pt-4">
      <View style={{borderColor: accentColor}} className="h-[88px] w-[88px] rounded-full border-[2.5px] p-[3px]">
        <View className="h-full w-full items-center justify-center overflow-hidden rounded-full bg-card dark:bg-[#2A2640]">
          {remoteAvatar ? <RemoteImage accessibilityLabel={`${name || 'User'}'s avatar`} uri={avatarUrl!} priority="high" className="h-full w-full" />
            : <Text className="font-display text-[24px] text-muted dark:text-[#C9C5DE]">{initials}</Text>}
        </View>
        {avatarAction}
      </View>
      {!!stats.length && <View className="min-w-0 flex-1 flex-row gap-2">
        {stats.map(stat => {
          const content = <><Text className="font-display text-[20px] leading-[22px] text-foreground dark:text-[#F4F2FA]">{stat.displayValue}</Text>
            <View className="flex-row items-center gap-[5px]"><View className={`h-1.5 w-1.5 rounded-full ${stat.dotClassName}`} /><Text numberOfLines={1} className="text-[12px] font-medium text-muted dark:text-[#9C97B8]">{stat.label}</Text></View></>;
          return <Pressable key={stat.label} accessibilityRole={stat.onPress ? 'button' : undefined} accessibilityLabel={`${stat.value ?? ''} ${stat.label}`.trim()}
            disabled={!stat.onPress} onPress={stat.onPress} hitSlop={6} className="min-w-0 flex-1 items-center gap-1 active:opacity-70">{content}</Pressable>;
        })}
      </View>}
    </View>
    {!!(name || nameAccessory || children) && <View className="gap-1.5 px-5 pt-5">
      <View className="flex-row items-center">
        <Text accessibilityRole="header" numberOfLines={1} className="shrink font-display text-[18px] leading-[22px] tracking-[-0.2px] text-foreground dark:text-[#F4F2FA]">{name}</Text>
        {nameAccessory}
      </View>
      {children}
    </View>}
  </>;
}
