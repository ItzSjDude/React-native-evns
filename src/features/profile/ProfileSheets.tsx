import React, {useEffect, useRef, useState} from 'react';
import {ActivityIndicator, Image, Pressable, Text, TextInput, View} from 'react-native';
import IconCamera from '@tabler/icons-react-native/IconCamera';
import BottomSheet, {SheetButton} from '../../components/BottomSheet';
import {Colors} from '../../Constants/Colors';
import {imagePicker, uploadErrorMessage, uploadMedia, type MediaPurpose} from '../../core/media';
import type {ProfileUpdate, UserProfile} from './types';

const INTERESTS = ['music', 'gaming', 'chill', 'talk', 'study', 'travel', 'sports', 'tech', 'startups', 'movies', 'food', 'fitness'];
const MAX_INTERESTS = 8;
const messageOf = (error: unknown) => (error as {message?: string})?.message ?? 'Please try again.';

type Draft = {name: string; handle: string; bio: string; city: string; interests: string[]; avatarUrl: string | null; coverUrl: string | null};
const draftOf = (profile: UserProfile): Draft => ({
  name: profile.name ?? '', handle: profile.handle ?? '', bio: profile.bio ?? '', city: profile.city ?? '',
  interests: (profile.interests ?? []).map(item => item.toLowerCase()),
  avatarUrl: profile.avatar_url ?? null, coverUrl: profile.cover_image_url ?? null,
});
const initialsOf = (name: string) => name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]!.toUpperCase()).join('') || '?';

type ImageSlot = 'avatar' | 'cover';
const SLOT_PURPOSE: Record<ImageSlot, MediaPurpose> = {avatar: 'avatar', cover: 'misc'};
const SLOT_FIELD = {avatar: 'avatarUrl', cover: 'coverUrl'} as const;
type SlotState = {uploading: boolean; error: string | null};
const IDLE: Record<ImageSlot, SlotState> = {avatar: {uploading: false, error: null}, cover: {uploading: false, error: null}};

const Field = ({label, hint, ...props}: {label: string; hint?: string} & React.ComponentProps<typeof TextInput>) =>
  <View className="mb-4">
    <View className="mb-2 flex-row items-center justify-between px-1">
      <Text className="text-[13px] font-semibold text-muted">{label}</Text>
      {!!hint && <Text className="text-xs text-muted">{hint}</Text>}
    </View>
    <TextInput {...props} accessibilityLabel={label} placeholderTextColor={Colors.muted} textAlignVertical={props.multiline ? 'top' : 'center'}
      className={`rounded-xl border border-border bg-card px-4 text-[15px] text-foreground ${props.multiline ? 'min-h-[88px] pt-3' : 'min-h-12'}`} />
  </View>;

export const EditProfileSheet = ({profile, visible, onClose, onSave}: {
  profile: UserProfile | null; visible: boolean; onClose: () => void; onSave: (update: ProfileUpdate) => Promise<void>;
}) => {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [media, setMedia] = useState(IDLE);
  // Bumped whenever the sheet re-opens so a late upload can't land in a fresh draft.
  const session = useRef(0);
  useEffect(() => {if (visible && profile) {session.current++; setDraft(draftOf(profile)); setError(null); setMedia(IDLE);}}, [visible, profile]);
  const set = (patch: Partial<Draft>) => setDraft(current => current ? {...current, ...patch} : current);
  const toggleInterest = (interest: string) => draft && set({interests: draft.interests.includes(interest)
    ? draft.interests.filter(item => item !== interest)
    : draft.interests.length < MAX_INTERESTS ? [...draft.interests, interest] : draft.interests});

  const uploading = media.avatar.uploading || media.cover.uploading;
  const setSlot = (slot: ImageSlot, state: SlotState) => setMedia(current => ({...current, [slot]: state}));

  const pickFor = async (slot: ImageSlot) => {
    if (!imagePicker.available || media[slot].uploading || saving) return;
    const started = session.current;
    setSlot(slot, {uploading: false, error: null});
    try {
      const file = await imagePicker.pickImage();
      if (!file || started !== session.current) return;
      setSlot(slot, {uploading: true, error: null});
      const {fileUrl} = await uploadMedia(file, SLOT_PURPOSE[slot]);
      if (started !== session.current) return;
      set({[SLOT_FIELD[slot]]: fileUrl});
      setSlot(slot, {uploading: false, error: null});
    } catch (cause) {
      if (started === session.current) setSlot(slot, {uploading: false, error: uploadErrorMessage(cause)});
    }
  };
  const removeFor = (slot: ImageSlot) => {set({[SLOT_FIELD[slot]]: null}); setSlot(slot, {uploading: false, error: null});};

  const save = async () => {
    if (!draft || !profile || saving || uploading) return;
    const name = draft.name.trim();
    const handle = draft.handle.trim().toLowerCase();
    if (name.length < 2 || name.length > 80) {setError('Name must be 2–80 characters.'); return;}
    if ((handle || profile.handle) && !/^[a-z0-9_]{3,30}$/.test(handle)) {setError('Handle must be 3–30 letters, numbers, or underscores.'); return;}
    setSaving(true); setError(null);
    try {
      await onSave({
        name, ...(handle ? {handle} : {}), bio: draft.bio.trim() || null, city: draft.city.trim() || null, interests: draft.interests,
        // Only send images that changed; null clears them on the server.
        ...(draft.avatarUrl !== (profile.avatar_url ?? null) ? {avatarUrl: draft.avatarUrl} : {}),
        ...(draft.coverUrl !== (profile.cover_image_url ?? null) ? {coverImageUrl: draft.coverUrl} : {}),
      });
      onClose();
    } catch (cause) {
      const status = (cause as {status?: number})?.status;
      setError(status === 409 ? 'That handle is already taken. Try another.' : messageOf(cause));
    } finally {setSaving(false);}
  };

  const canPick = imagePicker.available && !saving;
  return <BottomSheet visible={visible} onClose={onClose} dismissible={!saving} maxHeight={0.92} title="Edit profile"
    footer={<SheetButton label={saving ? 'Saving…' : uploading ? 'Uploading photo…' : 'Save changes'} busy={saving} disabled={uploading} onPress={save} />}>
    {!!error && <View className="mb-3 rounded-xl bg-coral/10 px-3 py-2"><Text accessibilityRole="alert" className="text-[13px] text-coral">{error}</Text></View>}
    {draft && <>
      <View className="mb-4 items-center">
        <Pressable accessibilityRole="button" accessibilityLabel={draft.avatarUrl ? 'Change photo' : 'Add photo'} accessibilityState={{disabled: !canPick || media.avatar.uploading, busy: media.avatar.uploading}}
          disabled={!canPick || media.avatar.uploading} onPress={() => pickFor('avatar')} className="active:opacity-80">
          <View className="h-[88px] w-[88px] items-center justify-center overflow-hidden rounded-full border-2 border-gold bg-[#4A3A8C]">
            {draft.avatarUrl ? <Image accessibilityLabel="Profile photo" source={{uri: draft.avatarUrl}} className="h-full w-full" />
              : <Text className="text-[26px] font-extrabold text-[#F0ECFF]">{initialsOf(draft.name)}</Text>}
            {media.avatar.uploading && <View className="absolute inset-0 items-center justify-center bg-black/55"><ActivityIndicator color={Colors.gold} /></View>}
          </View>
          <View className="absolute bottom-0 right-0 h-7 w-7 items-center justify-center rounded-full border-2 border-sheet bg-gold">
            <IconCamera size={15} color={Colors.goldInk} />
          </View>
        </Pressable>
        <View className="mt-2 flex-row items-center gap-4">
          <Text className="text-[13px] font-semibold text-gold">{media.avatar.uploading ? 'Uploading…' : draft.avatarUrl ? 'Change photo' : 'Add photo'}</Text>
          {!!draft.avatarUrl && !media.avatar.uploading && <Pressable accessibilityRole="button" accessibilityLabel="Remove photo" disabled={saving} onPress={() => removeFor('avatar')} hitSlop={8} className="active:opacity-70">
            <Text className="text-[13px] font-semibold text-muted">Remove</Text>
          </Pressable>}
        </View>
        {!!media.avatar.error && <Text accessibilityRole="alert" className="mt-1 text-center text-xs text-coral">{media.avatar.error}</Text>}
      </View>
      <View className="mb-4">
        <Text className="mb-2 px-1 text-[13px] font-semibold text-muted">Cover</Text>
        <View className="flex-row items-center gap-3 rounded-xl border border-border bg-card p-2">
          <View className="h-14 w-24 items-center justify-center overflow-hidden rounded-lg bg-gold-bg">
            {draft.coverUrl ? <Image accessibilityLabel="Cover image" source={{uri: draft.coverUrl}} className="h-full w-full" />
              : <Text className="text-xs text-muted">No cover</Text>}
            {media.cover.uploading && <View className="absolute inset-0 items-center justify-center bg-black/55"><ActivityIndicator color={Colors.gold} /></View>}
          </View>
          <View className="flex-1 flex-row flex-wrap items-center gap-2">
            <Pressable accessibilityRole="button" accessibilityLabel={draft.coverUrl ? 'Change cover' : 'Add cover'} accessibilityState={{disabled: !canPick || media.cover.uploading, busy: media.cover.uploading}}
              disabled={!canPick || media.cover.uploading} onPress={() => pickFor('cover')}
              className={`min-h-9 justify-center rounded-full bg-gold px-3.5 ${!canPick || media.cover.uploading ? 'opacity-50' : 'active:opacity-70'}`}>
              <Text className="text-[13px] font-bold text-gold-ink">{media.cover.uploading ? 'Uploading…' : draft.coverUrl ? 'Change cover' : 'Add cover'}</Text>
            </Pressable>
            {!!draft.coverUrl && !media.cover.uploading && <Pressable accessibilityRole="button" accessibilityLabel="Remove cover" disabled={saving} onPress={() => removeFor('cover')} hitSlop={8} className="min-h-9 justify-center px-1 active:opacity-70">
              <Text className="text-[13px] font-semibold text-muted">Remove</Text>
            </Pressable>}
          </View>
        </View>
        {!!media.cover.error && <Text accessibilityRole="alert" className="mt-1 px-1 text-xs text-coral">{media.cover.error}</Text>}
        {!imagePicker.available && <Text className="mt-1 px-1 text-xs text-muted">Photo upload isn't available in this version.</Text>}
      </View>
      <Field label="Name" value={draft.name} onChangeText={name => set({name})} maxLength={80} />
      <Field label="Handle" hint="3–30 letters, numbers or _" value={draft.handle} onChangeText={handle => set({handle: handle.toLowerCase()})} autoCapitalize="none" autoCorrect={false} maxLength={30} />
      <Field label="Bio" hint={`${draft.bio.length}/240`} value={draft.bio} onChangeText={bio => set({bio})} multiline maxLength={240} placeholder="A line about you" />
      <Field label="City" value={draft.city} onChangeText={city => set({city})} maxLength={80} placeholder="Where are you based?" />
      <View className="mb-2 flex-row items-center justify-between px-1">
        <Text className="text-[13px] font-semibold text-muted">Interests</Text>
        <Text className="text-xs text-muted">{draft.interests.length}/{MAX_INTERESTS}</Text>
      </View>
      <View className="mb-2 flex-row flex-wrap gap-2">
        {/* Keep interests saved elsewhere (e.g. onboarding) visible so they can be removed. */}
        {[...INTERESTS, ...(profile?.interests ?? []).map(item => item.toLowerCase()).filter(item => !INTERESTS.includes(item))].map(interest => {
          const selected = draft.interests.includes(interest);
          const disabled = !selected && draft.interests.length >= MAX_INTERESTS;
          return <Pressable key={interest} accessibilityRole="checkbox" accessibilityState={{checked: selected, disabled}} disabled={disabled} onPress={() => toggleInterest(interest)}
            className={`min-h-9 justify-center rounded-full border px-3.5 active:opacity-70 ${selected ? 'border-primary bg-primary-dark' : 'border-border bg-card'} ${disabled ? 'opacity-40' : ''}`}>
            <Text className={`text-[13px] font-semibold capitalize ${selected ? 'text-primary' : 'text-text-body'}`}>{interest}</Text>
          </Pressable>;
        })}
      </View>
    </>}
  </BottomSheet>;
};

