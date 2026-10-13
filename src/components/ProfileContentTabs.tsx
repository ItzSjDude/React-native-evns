import React from 'react';
import {Pressable, Text, View} from 'react-native';
import {Colors} from '../Constants/Colors';

export default function ProfileContentTabs<T extends string>({tabs, selected, onSelect, accentColor = Colors.gold, onAccentColor = Colors.goldInk}: {
  tabs: Array<{id: T; label: string}>;
  selected: T;
  onSelect: (id: T) => void;
  accentColor?: string;
  onAccentColor?: string;
}) {
  return <View accessibilityRole="tablist" className="mx-5 mt-6 flex-row gap-1 rounded-[20px] border border-border dark:border-[#2E2A4A] bg-card dark:bg-[#13111F] p-[3px]">
    {tabs.map(tab => {
      const active = tab.id === selected;
      return <Pressable key={tab.id} accessibilityRole="tab" accessibilityState={{selected: active}} onPress={() => onSelect(tab.id)} hitSlop={{top: 5, bottom: 5}}
        style={active ? {backgroundColor: accentColor} : undefined} className={`h-[34px] flex-1 items-center justify-center rounded-[17px] ${active ? '' : 'active:opacity-70'}`}>
        <Text style={active ? {color: onAccentColor} : undefined} className={`text-[14px] font-semibold ${active ? '' : 'text-muted dark:text-[#B3AECB]'}`}>{tab.label}</Text>
      </Pressable>;
    })}
  </View>;
}
