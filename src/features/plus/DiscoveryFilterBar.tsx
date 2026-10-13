import React, {useState} from 'react';
import {Pressable, Switch, Text, TextInput, View} from 'react-native';
import IconFilter from '@tabler/icons-react-native/IconFilter';
import IconLock from '@tabler/icons-react-native/IconLock';
import IconX from '@tabler/icons-react-native/IconX';
import BottomSheet, {SheetButton} from '../../components/BottomSheet';
import {Colors} from '../../Constants/Colors';
import {CITY_MAX_LENGTH, countFilters, INTEREST_MAX_LENGTH, LANGUAGES} from './discoveryFilters';
import {openPaywall} from './plusStore';
import type {DiscoveryFilters} from './types';
import {usePlus} from './usePlus';

export type DiscoveryFilterBarProps = {filters: DiscoveryFilters; onChange: (filters: DiscoveryFilters) => void; subtitle?: string; /** Passport has its own city input. */ hideCity?: boolean; /** Useful in tight toolbars; clearing remains available in the sheet. */ showClearAction?: boolean};

const inputClass = 'h-11 rounded-xl border border-border bg-card px-3 text-[15px] text-foreground';
const fieldLabel = 'mb-1.5 mt-3 text-[11px] font-semibold uppercase tracking-[0.8px] text-muted';

/**
 * Compact filter control for Nearby and people search. Free users see a lock and tapping it opens the
 * 'filters' paywall; Plus users edit a draft in a sheet and apply it. Hidden while the server doesn't offer Plus.
 */
export default function DiscoveryFilterBar({filters, onChange, subtitle, hideCity, showClearAction = true}: DiscoveryFilterBarProps) {
  const {enabled, isPlus} = usePlus();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DiscoveryFilters>(filters);
  if (!enabled) return null;

  const count = isPlus ? countFilters(filters) : 0;
  const press = () => {
    if (!isPlus) {openPaywall('filters'); return;}
    setDraft(filters);
    setOpen(true);
  };
  const apply = (next: DiscoveryFilters) => {setOpen(false); onChange(next);};

  return <View className="flex-row items-center gap-2">
    <Pressable accessibilityRole="button" accessibilityLabel={isPlus ? (count ? `Filters, ${count} active` : 'Filters') : 'Filters, requires Hiva Plus'}
      onPress={press} hitSlop={{top: 6, bottom: 6}} className={`h-9 flex-row items-center gap-1.5 rounded-full px-4 active:opacity-70 ${count ? 'bg-gold' : 'bg-card'}`}>
      <IconFilter size={15} color={count ? Colors.textDark : Colors.muted} />
      <Text className={`text-[13px] font-semibold ${count ? 'text-text-dark' : 'text-muted'}`}>{count ? `Filters · ${count}` : 'Filters'}</Text>
      {!isPlus && <IconLock size={13} color={Colors.muted} />}
    </Pressable>
    {count > 0 && showClearAction && <Pressable accessibilityRole="button" accessibilityLabel="Clear all filters" onPress={() => onChange({})} hitSlop={6}
      className="h-9 flex-row items-center gap-1 px-2 active:opacity-70">
      <IconX size={14} color={Colors.muted} /><Text className="text-[13px] font-semibold text-muted">Clear all</Text>
    </Pressable>}

    <BottomSheet visible={open} onClose={() => setOpen(false)} title="Filters" subtitle={subtitle}
      footer={<>
        <SheetButton label="Apply filters" onPress={() => apply(draft)} />
        <SheetButton label="Clear all" variant="ghost" onPress={() => apply({})} />
      </>}>
      {!hideCity && <>
        <Text className={fieldLabel}>City</Text>
        <TextInput accessibilityLabel="City" value={draft.city ?? ''} onChangeText={city => setDraft(prev => ({...prev, city}))} maxLength={CITY_MAX_LENGTH}
          placeholder="Any city" placeholderTextColor={Colors.muted} autoCorrect={false} className={inputClass} />
      </>}
      <Text className={fieldLabel}>Interest</Text>
      <TextInput accessibilityLabel="Interest" value={draft.interest ?? ''} onChangeText={interest => setDraft(prev => ({...prev, interest}))} maxLength={INTEREST_MAX_LENGTH}
        placeholder="Any interest" placeholderTextColor={Colors.muted} autoCorrect={false} className={inputClass} />
      <Text className={fieldLabel}>Language</Text>
      <View className="flex-row gap-2">
        {LANGUAGES.map(({value, label}) => {
          const selected = draft.language === value;
          return <Pressable key={value} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{selected}}
            onPress={() => setDraft(prev => ({...prev, language: selected ? undefined : value}))} hitSlop={{top: 6, bottom: 6}}
            className={`h-9 items-center justify-center rounded-full px-4 active:opacity-70 ${selected ? 'bg-gold' : 'bg-card'}`}>
            <Text className={`text-[13px] font-semibold ${selected ? 'text-text-dark' : 'text-muted'}`}>{label}</Text>
          </Pressable>;
        })}
      </View>
      <View className="mt-4 flex-row items-center justify-between rounded-2xl bg-card px-4 py-3">
        <Text className="text-[15px] font-semibold text-foreground">Active now</Text>
        <Switch accessibilityLabel="Active now" value={!!draft.activeNow} onValueChange={activeNow => setDraft(prev => ({...prev, activeNow}))} />
      </View>
    </BottomSheet>
  </View>;
}
