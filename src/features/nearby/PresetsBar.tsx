import React, {useCallback, useEffect, useRef, useState} from 'react';
import {Pressable, Text, TextInput, View} from 'react-native';
import IconBookmark from '@tabler/icons-react-native/IconBookmark';
import IconLock from '@tabler/icons-react-native/IconLock';
import IconPlus from '@tabler/icons-react-native/IconPlus';
import IconTrash from '@tabler/icons-react-native/IconTrash';
import BottomSheet, {SheetButton, SheetRow} from '../../components/BottomSheet';
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

/** A labelled entry point to saved searches. The sheet also lets Plus users save the current search. */
export default function PresetsBar({current, onApply}: Props) {
  const {enabled, isPlus} = usePlus();
  const [presets, setPresets] = useState<DiscoveryPreset[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [sheet, setSheet] = useState<'closed' | 'list' | 'save' | 'delete'>('closed');
  const [pendingDelete, setPendingDelete] = useState<DiscoveryPreset | null>(null);
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
    return <Pressable accessibilityRole="button" accessibilityLabel="Saved searches, requires Hiva Plus" onPress={() => openPaywall('passport')} hitSlop={6} className="min-h-11 flex-row items-center gap-1.5 px-2 active:opacity-70">
      <IconBookmark size={17} color={Colors.muted} />
      <Text className="text-[13px] font-semibold text-muted">Saved</Text>
      <IconLock size={12} color={Colors.muted} />
    </Pressable>;
  }

  const currentSummary = current.mode === 'PASSPORT'
    ? current.city.trim() ? `People in ${current.city.trim()}` : 'Choose a city first'
    : `Near me · ${Math.round(current.radiusMeters / 1000)} km`;
  const describe = (preset: DiscoveryPreset) => preset.mode === 'PASSPORT'
    ? `People in ${preset.city ?? 'another city'}`
    : `Near me · ${Math.round(preset.radiusMeters / 1000)} km`;

  const save = async () => {
    const trimmed = name.trim();
    if (!trimmed) {setFormError('Give this search a name.'); return;}
    if (current.mode === 'PASSPORT' && !current.city.trim()) {setFormError('Choose a city before saving this search.'); return;}
    setBusy(true);
    setFormError(null);
    try {
      await createDiscoveryPreset(presetBody(trimmed, current));
      setSheet('list');
      setName('');
      await load();
    } catch (cause) {
      setFormError(nearbyErrorMessage(cause, 'passport'));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!pendingDelete) return;
    setBusy(true);
    try {
      await deleteDiscoveryPreset(pendingDelete.id);
      setError(null);
      setPresets(saved => saved.filter(preset => preset.id !== pendingDelete.id));
      setPendingDelete(null);
      setSheet('list');
      await load();
    } catch (cause) {
      setError(nearbyErrorMessage(cause, 'passport'));
    } finally {
      setBusy(false);
    }
  };

  return <View>
    <Pressable accessibilityRole="button" accessibilityLabel="Saved searches" onPress={() => {setError(null); setSheet('list');}} hitSlop={6} className="min-h-11 flex-row items-center gap-1.5 px-2 active:opacity-70">
      <IconBookmark size={17} color={Colors.primary} />
      <Text className="text-[13px] font-semibold text-primary">Saved</Text>
    </Pressable>
    <BottomSheet visible={sheet !== 'closed'} onClose={() => setSheet('closed')} dismissible={!busy}
      title={sheet === 'save' ? 'Save this search' : sheet === 'delete' ? 'Delete saved search?' : 'Saved searches'}
      subtitle={sheet === 'save' ? currentSummary : sheet === 'delete' ? pendingDelete?.name : 'Your favourite places and filters, ready to revisit.'}
      footer={sheet === 'save' ? <SheetButton label="Save search" busy={busy} onPress={save} />
        : sheet === 'delete' ? <SheetButton label="Delete search" variant="destructive" busy={busy} onPress={remove} /> : undefined}>
      {sheet === 'list' && <>
        <SheetRow icon={IconPlus} label="Save this search" description={currentSummary}
          disabled={current.mode === 'PASSPORT' && !current.city.trim()} onPress={() => {
          setName(''); setFormError(null); setSheet('save');
        }} />
        {!!formError && <Text accessibilityRole="alert" className="mb-3 mt-2 text-[13px] text-coral">{formError}</Text>}
        {presets.length ? <Text className="mb-2 mt-5 text-[13px] font-semibold text-muted">Your searches</Text>
          : <Text className="mt-5 text-[13px] text-muted">No saved searches yet.</Text>}
        {presets.map(preset => <SheetRow key={preset.id} icon={IconBookmark} label={preset.name} description={describe(preset)}
          accessibilityLabel={`Apply ${preset.name}`} onPress={() => {setSheet('closed'); onApply(preset);}}
          accessory={<Pressable accessibilityRole="button" accessibilityLabel={`Delete ${preset.name}`} onPress={() => {setError(null); setPendingDelete(preset); setSheet('delete');}} hitSlop={8} className="h-11 w-11 items-center justify-center rounded-full">
            <IconTrash size={17} color={Colors.muted} />
          </Pressable>} />)}
        {!!error && <Pressable accessibilityRole="button" accessibilityLabel="Retry saved searches" onPress={load} className="mt-3 min-h-11 justify-center"><Text className="text-[13px] text-coral">{error} Tap to retry.</Text></Pressable>}
      </>}
      {sheet === 'save' && <>
        <TextInput accessibilityLabel="Search name" value={name} onChangeText={setName} maxLength={NAME_MAX_LENGTH} placeholder="Give it a name"
          placeholderTextColor={Colors.muted} autoCorrect={false} editable={!busy} onSubmitEditing={save}
          className="h-11 rounded-xl border border-border bg-card px-3 text-[15px] text-foreground" />
        {!!formError && <Text accessibilityRole="alert" className="mt-3 text-sm text-coral">{formError}</Text>}
      </>}
      {sheet === 'delete' && <>
        <Text className="mb-4 text-[14px] leading-5 text-muted">You can save this search again later.</Text>
        {!!error && <Text accessibilityRole="alert" className="mb-3 text-[13px] text-coral">{error}</Text>}
      </>}
    </BottomSheet>
  </View>;
}
