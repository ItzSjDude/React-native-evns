import React, {useCallback, useEffect, useRef, useState} from 'react';
import {Pressable, ScrollView, Text, TextInput, View} from 'react-native';
import IconBookmark from '@tabler/icons-react-native/IconBookmark';
import IconLock from '@tabler/icons-react-native/IconLock';
import IconPlus from '@tabler/icons-react-native/IconPlus';
import IconX from '@tabler/icons-react-native/IconX';
import BottomSheet, {SheetButton} from '../../components/BottomSheet';
import {Colors} from '../../Constants/Colors';
import {CITY_MAX_LENGTH, openPaywall, usePlus, type DiscoveryFilters} from '../plus';
import {createDiscoveryPreset, deleteDiscoveryPreset, listDiscoveryPresets, NAME_MAX_LENGTH} from './discoveryPresetService';
import {nearbyErrorMessage} from './nearbyErrors';
import type {DiscoveryPreset, DiscoveryPresetMode, NewDiscoveryPreset} from './types';

/** What "Save current search" stores: the mode, Passport city, range and the filters in effect. */
export type CurrentSearch = {mode: DiscoveryPresetMode; city: string; radiusMeters: number; filters: DiscoveryFilters};

type Props = {current: CurrentSearch; onApply: (preset: DiscoveryPreset) => void};

/** The server takes 50 m to 25 km. */
const clampRadius = (meters: number) => Math.min(25000, Math.max(50, Math.round(meters)));

/** Request body for the current search. A NEARBY preset must not carry a city, so its city filter is not saved. */
export function presetBody(name: string, {mode, city, radiusMeters, filters}: CurrentSearch): NewDiscoveryPreset {
  const body: NewDiscoveryPreset = {name: name.trim(), mode, radiusMeters: clampRadius(radiusMeters), activeNow: !!filters.activeNow};
  if (mode === 'PASSPORT') body.city = city.trim().slice(0, CITY_MAX_LENGTH);
  if (filters.interest?.trim()) body.interest = filters.interest.trim();
  if (filters.language) body.language = filters.language;
  return body;
}

const chip = 'h-9 flex-row items-center gap-1.5 rounded-full bg-card px-4 active:opacity-70';

/** Saved searches (Plus): chips that re-apply a search, plus "Save search". Free users get a lock that opens the paywall. */
export default function PresetsBar({current, onApply}: Props) {
  const {enabled, isPlus} = usePlus();
  const [presets, setPresets] = useState<DiscoveryPreset[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const request = useRef(0);

  // Server state, refetched after every mutation.
  const load = useCallback(async () => {
    const id = ++request.current;
    try {
      const next = await listDiscoveryPresets();
      if (id === request.current) {setPresets(next); setError(null);}
    } catch (cause) {
      if (id === request.current) setError(nearbyErrorMessage(cause, 'passport'));
    }
  }, []);

  useEffect(() => {
    if (!enabled || !isPlus) return;
    const requestRef = request;
    load();
    return () => {requestRef.current++;};
  }, [enabled, isPlus, load]);

  if (!enabled) return null;
  if (!isPlus) {
    return <Pressable accessibilityRole="button" accessibilityLabel="Saved searches, requires Hiva Plus" onPress={() => openPaywall('passport')} className={`self-start ${chip}`}>
      <IconBookmark size={15} color={Colors.muted} />
      <Text className="text-[13px] font-semibold text-muted">Saved searches</Text>
      <IconLock size={13} color={Colors.muted} />
    </Pressable>;
  }

  const save = async () => {
    const trimmed = name.trim();
    if (!trimmed) {setFormError('Give this search a name.'); return;}
    if (current.mode === 'PASSPORT' && !current.city.trim()) {setFormError('Enter a city before saving a Passport search.'); return;}
    setBusy(true);
    setFormError(null);
    try {
      await createDiscoveryPreset(presetBody(trimmed, current));
      setSaving(false);
      setName('');
      await load();
    } catch (cause) {
      setFormError(nearbyErrorMessage(cause, 'passport'));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (preset: DiscoveryPreset) => {
    try {
      await deleteDiscoveryPreset(preset.id);
      setError(null);
    } catch (cause) {
      setError(nearbyErrorMessage(cause, 'passport'));
    }
    await load();
  };

  return <View>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="items-center gap-2">
      <Pressable accessibilityRole="button" accessibilityLabel="Save current search" onPress={() => {setFormError(null); setSaving(true);}} className={chip}>
        <IconPlus size={15} color={Colors.muted} />
        <Text className="text-[13px] font-semibold text-muted">Save search</Text>
      </Pressable>
      {presets.map(preset => <View key={preset.id} className="h-9 flex-row items-center rounded-full bg-card pl-4 pr-1">
        <Pressable accessibilityRole="button" accessibilityLabel={`Apply ${preset.name}`} onPress={() => onApply(preset)} className="active:opacity-70">
          <Text className="max-w-[160px] text-[13px] font-semibold text-foreground" numberOfLines={1}>{preset.mode === 'PASSPORT' ? `${preset.name} · ${preset.city}` : preset.name}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={`Delete ${preset.name}`} onPress={() => remove(preset)} hitSlop={6} className="h-7 w-7 items-center justify-center rounded-full active:opacity-70">
          <IconX size={14} color={Colors.muted} />
        </Pressable>
      </View>)}
    </ScrollView>
    {error && <Pressable accessibilityRole="button" accessibilityLabel="Retry saved searches" onPress={load}><Text className="mt-2 text-xs text-coral">{error} Tap to retry.</Text></Pressable>}

    <BottomSheet visible={saving} onClose={() => setSaving(false)} dismissible={!busy} title="Save current search"
      subtitle={current.mode === 'PASSPORT' ? `Passport${current.city.trim() ? ` · ${current.city.trim()}` : ''}` : 'Nearby'}
      footer={<SheetButton label="Save" busy={busy} onPress={save} />}>
      <TextInput accessibilityLabel="Search name" value={name} onChangeText={setName} maxLength={NAME_MAX_LENGTH} placeholder="Name, e.g. Mumbai foodies"
        placeholderTextColor={Colors.muted} autoCorrect={false} editable={!busy} onSubmitEditing={save}
        className="h-11 rounded-xl border border-border bg-card px-3 text-[15px] text-foreground" />
      {formError && <Text accessibilityRole="alert" className="mt-3 text-sm text-coral">{formError}</Text>}
    </BottomSheet>
  </View>;
}
