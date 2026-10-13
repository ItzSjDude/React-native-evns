import React, {useMemo, useState} from 'react';
import {SLIDE_MODAL_ANIMATION} from '../../../Constants/NavigationTransitions';
import {ActivityIndicator, FlatList, Image, Modal, Pressable, StyleSheet, Text, TextInput, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {Colors} from '../../../Constants/Colors';
import {AppIcon} from '../../../Constants/Icons';
import {COUNTRIES, flagOf, GENDER_OPTIONS, INTENT_OPTIONS, OTHER_PROFESSION, PROFESSION_OPTIONS} from './options';
import {INTEREST_OPTIONS, MAX_INTERESTS} from './validation';
import type {OnboardingFieldErrors} from './types';

const modalStyles = StyleSheet.create({safe: {flex: 1, backgroundColor: Colors.background}});

export const ProgressBar = ({step, total}: {step: number; total: number}) => (
  <View accessibilityRole="progressbar" accessibilityLabel={`Step ${step + 1} of ${total}`} className="h-1.5 w-full overflow-hidden rounded-full bg-border">
    <View className="h-full rounded-full bg-gold" style={{width: `${((step + 1) / total) * 100}%`}} />
  </View>
);

type HeaderProps = {step: number; total: number; canGoBack: boolean; disabled: boolean; onBack: () => void};

/** Full-width progress bar on top; back (left) and the step count (centre) beneath it. */
export const OnboardingHeader = ({step, total, canGoBack, disabled, onBack}: HeaderProps) => (
  <View className="px-5 pb-2 pt-4">
    <ProgressBar step={step} total={total} />
    <View className="mt-2 flex-row items-center">
      <View className="w-11">
        {canGoBack ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Back" disabled={disabled} onPress={onBack}
            className={`h-11 w-11 items-center justify-center rounded-full ${disabled ? 'opacity-40' : 'active:opacity-70'}`}>
            <View style={{transform: [{rotate: '180deg'}]}}><AppIcon name="chevron" size={22} color={Colors.text} filled={false} /></View>
          </Pressable>
        ) : null}
      </View>
      <Text className="flex-1 text-center text-xs font-semibold text-muted">Step {step + 1} of {total}</Text>
      <View className="w-11" />
    </View>
  </View>
);

const Chip = ({label, selected, disabled, onPress}: {label: string; selected: boolean; disabled: boolean; onPress: () => void}) => (
  <Pressable accessibilityRole="radio" accessibilityLabel={label} accessibilityState={{selected, disabled}} disabled={disabled} onPress={onPress}
    className={`min-h-11 justify-center rounded-full border px-4 py-2 ${selected ? 'border-primary bg-gold' : 'border-border bg-card'} ${disabled ? 'opacity-40' : 'active:opacity-70'}`}>
    <Text className={selected ? 'text-sm font-semibold text-text-dark' : 'text-sm font-semibold text-muted'}>{label}</Text>
  </Pressable>
);

const FieldError = ({message}: {message?: string}) =>
  message ? <Text accessibilityRole="alert" className="mt-1.5 text-xs text-coral">{message}</Text> : null;

const StepHeader = ({title, subtitle}: {title: string; subtitle: string}) => (
  <View className="mb-6">
    <Text accessibilityRole="header" className="text-[26px] font-bold text-foreground">{title}</Text>
    <Text className="mt-2 text-[15px] leading-[22px] text-muted">{subtitle}</Text>
  </View>
);

type FieldProps = {label: string; error?: string; prefix?: string} & React.ComponentProps<typeof TextInput>;

const Field = ({label, error, prefix, ...props}: FieldProps) => (
  <View className="mb-4">
    <Text className="mb-2 text-sm font-semibold text-foreground">{label}</Text>
    <View className={`h-12 flex-row items-center rounded-[14px] border bg-card px-4 ${error ? 'border-coral' : 'border-border'}`}>
      {prefix ? <Text className="mr-1 text-[15px] text-muted">{prefix}</Text> : null}
      <TextInput {...props} accessibilityLabel={label} placeholderTextColor={Colors.muted} className="h-12 flex-1 text-[15px] text-foreground" />
    </View>
    {error ? <Text accessibilityRole="alert" className="mt-1.5 text-xs text-coral">{error}</Text> : null}
  </View>
);

type CountryPickerProps = {value: string; error?: string; disabled: boolean; onChange: (country: string) => void};

const CountryPicker = ({value, error, disabled, onChange}: CountryPickerProps) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const matches = useMemo(() => COUNTRIES.filter(([name]) => name.toLowerCase().includes(query.trim().toLowerCase())), [query]);
  const selected = COUNTRIES.find(([name]) => name === value);
  const close = () => { setOpen(false); setQuery(''); };
  return (
    <View className="mb-4">
      <Text className="mb-2 text-sm font-semibold text-foreground">Country</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Country" disabled={disabled} onPress={() => setOpen(true)}
        className={`h-12 flex-row items-center justify-between rounded-[14px] border bg-card px-4 ${error ? 'border-coral' : 'border-border'}`}>
        <Text className={value ? 'text-[15px] text-foreground' : 'text-[15px] text-muted'}>{selected ? `${flagOf(selected[1])}  ${selected[0]}` : 'Select your country'}</Text>
        <View style={{transform: [{rotate: '90deg'}]}}><AppIcon name="chevron" size={18} color={Colors.muted} filled={false} /></View>
      </Pressable>
      <FieldError message={error} />
      <Modal visible={open} animationType={SLIDE_MODAL_ANIMATION} onRequestClose={close}>
        <SafeAreaView style={modalStyles.safe}>
          <View className="flex-row items-center gap-3 px-5 pb-3 pt-3">
            <View className="h-12 flex-1 flex-row items-center rounded-[14px] border border-border bg-card px-4">
              <TextInput accessibilityLabel="Search country" value={query} onChangeText={setQuery} placeholder="Search country" placeholderTextColor={Colors.muted} autoCorrect={false} className="h-12 flex-1 text-[15px] text-foreground" />
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Close country list" onPress={close} className="min-h-11 justify-center"><Text className="text-sm font-semibold text-primary">Close</Text></Pressable>
          </View>
          <FlatList data={matches} keyExtractor={([name]) => name} keyboardShouldPersistTaps="handled" contentContainerClassName="px-5 pb-6"
            ListEmptyComponent={<Text className="mt-6 text-center text-sm text-muted">No matching country.</Text>}
            renderItem={({item: [name, code]}) => (
              <Pressable accessibilityRole="button" accessibilityLabel={`Country ${name}`} onPress={() => { onChange(name); close(); }}
                className="min-h-12 flex-row items-center justify-between border-b border-border active:opacity-70">
                <Text className={name === value ? 'text-[15px] font-semibold text-primary' : 'text-[15px] text-foreground'}>{flagOf(code)}  {name}</Text>
                {name === value ? <AppIcon name="check" size={18} color={Colors.gold} filled={false} /> : null}
              </Pressable>
            )} />
        </SafeAreaView>
      </Modal>
    </View>
  );
};

type ProfileProps = {
  name: string;
  handle: string;
  gender: string;
  country: string;
  profession: string;
  avatarUrl: string | null;
  initials: string;
  errors: OnboardingFieldErrors;
  pickerAvailable: boolean;
  uploading: boolean;
  disabled: boolean;
  onPickPhoto: () => void;
  onChangeName: (value: string) => void;
  onChangeHandle: (value: string) => void;
  onChangeGender: (value: string) => void;
  onChangeCountry: (value: string) => void;
  onChangeProfession: (value: string) => void;
};

export const ProfileStep = ({name, handle, gender, country, profession, avatarUrl, initials, errors, pickerAvailable, uploading, disabled, onPickPhoto, onChangeName, onChangeHandle, onChangeGender, onChangeCountry, onChangeProfession}: ProfileProps) => {
  const canPick = pickerAvailable && !uploading && !disabled;
  const isPreset = (PROFESSION_OPTIONS as readonly string[]).includes(profession) && profession !== OTHER_PROFESSION;
  const [otherMode, setOtherMode] = useState(profession !== '' && !isPreset);
  return (
    <>
      <StepHeader title="Welcome to Hiva" subtitle="Tell people who you are. You can change this later from your profile." />
      <View className="mb-6 items-center">
        <Pressable accessibilityRole="button" accessibilityLabel={avatarUrl ? 'Change photo' : 'Add photo'} accessibilityState={{disabled: !canPick}} disabled={!canPick} onPress={onPickPhoto}
          className={`h-24 w-24 ${canPick ? 'active:opacity-70' : 'opacity-40'}`}>
          <View className="h-24 w-24 items-center justify-center overflow-hidden rounded-full bg-primary-dark">
            {avatarUrl ? <Image accessibilityLabel="Profile photo" source={{uri: avatarUrl}} className="h-full w-full" /> : <Text className="text-[28px] font-bold text-primary">{initials}</Text>}
            {uploading ? <View className="absolute inset-0 items-center justify-center bg-black/50"><ActivityIndicator color={Colors.gold} /></View> : null}
          </View>
          <View className="absolute bottom-0 right-0 h-8 w-8 items-center justify-center rounded-full border-2 border-background bg-gold">
            <AppIcon name="edit" size={15} color={Colors.textDark} filled={false} />
          </View>
        </Pressable>
        {!pickerAvailable ? <Text className="mt-3 text-center text-xs text-muted">Photo upload isn't available in this version yet. You can add one later from your profile.</Text> : null}
        <FieldError message={errors.avatarUrl} />
      </View>
      <Field label="Name" value={name} onChangeText={onChangeName} maxLength={80} editable={!disabled} placeholder="Your name" autoComplete="name" textContentType="name" returnKeyType="next" error={errors.name} />
      <Field label="Handle" prefix="@" value={handle} onChangeText={onChangeHandle} maxLength={30} editable={!disabled} placeholder="your_handle" autoCapitalize="none" autoCorrect={false} returnKeyType="done" error={errors.handle} />
      {!errors.handle ? <Text className="-mt-2 mb-4 text-xs text-muted">3–30 lowercase letters, numbers or underscores.</Text> : null}
      <View className="mb-4">
        <Text className="mb-2 text-sm font-semibold text-foreground">Gender</Text>
        <View accessibilityRole="radiogroup" className="flex-row flex-wrap gap-2">
          {GENDER_OPTIONS.map(option => <Chip key={option.value} label={option.label} selected={gender === option.value} disabled={disabled} onPress={() => onChangeGender(option.value)} />)}
        </View>
        <FieldError message={errors.gender} />
      </View>
      <CountryPicker value={country} error={errors.country} disabled={disabled} onChange={onChangeCountry} />
      <View className="mb-2">
        <Text className="mb-2 text-sm font-semibold text-foreground">Profession</Text>
        <View accessibilityRole="radiogroup" className="flex-row flex-wrap gap-2">
          {PROFESSION_OPTIONS.map(option => (
            <Chip key={option} label={option} disabled={disabled} selected={option === OTHER_PROFESSION ? otherMode : !otherMode && profession === option}
              onPress={() => { if (option === OTHER_PROFESSION) { setOtherMode(true); onChangeProfession(''); } else { setOtherMode(false); onChangeProfession(option); } }} />
          ))}
        </View>
        {otherMode ? <View className="mt-3"><Field label="Your profession" value={profession} onChangeText={onChangeProfession} maxLength={60} editable={!disabled} placeholder="e.g. Photographer" returnKeyType="done" /></View> : null}
        <FieldError message={errors.profession} />
      </View>
    </>
  );
};

type IntentProps = {selected: string; error?: string; disabled: boolean; onSelect: (intent: string) => void};

export const IntentStep = ({selected, error, disabled, onSelect}: IntentProps) => (
  <>
    <StepHeader title="Why are you here?" subtitle="Pick the one that fits best. We'll tailor Hiva to it." />
    <View accessibilityRole="radiogroup" className="gap-3">
      {INTENT_OPTIONS.map(option => {
        const isSelected = selected === option.value;
        return (
          <Pressable key={option.value} accessibilityRole="radio" accessibilityLabel={option.label} accessibilityState={{selected: isSelected, disabled}} disabled={disabled} onPress={() => onSelect(option.value)}
            className={`min-h-14 flex-row items-center justify-between rounded-[16px] border px-4 ${isSelected ? 'border-primary bg-gold-bg' : 'border-border bg-card'} ${disabled ? 'opacity-40' : 'active:opacity-70'}`}>
            <Text className={isSelected ? 'text-[15px] font-semibold text-foreground' : 'text-[15px] text-muted'}>{option.label}</Text>
            {isSelected ? <AppIcon name="check" size={18} color={Colors.gold} filled={false} /> : null}
          </Pressable>
        );
      })}
    </View>
    <FieldError message={error} />
  </>
);

type InterestsProps = {
  selected: string[];
  error?: string;
  disabled: boolean;
  onToggle: (interest: string) => void;
};

export const InterestsStep = ({selected, error, disabled, onToggle}: InterestsProps) => {
  const atLimit = selected.length >= MAX_INTERESTS;
  return (
    <>
      <StepHeader title="What are you into?" subtitle={`Pick up to ${MAX_INTERESTS}. We'll use these to suggest parties and people.`} />
      <View className="flex-row flex-wrap gap-2">
        {INTEREST_OPTIONS.map(interest => {
          const isSelected = selected.includes(interest);
          const blocked = disabled || (atLimit && !isSelected);
          return (
            <Pressable key={interest} accessibilityRole="checkbox" accessibilityLabel={`Interest ${interest}`} accessibilityState={{checked: isSelected, disabled: blocked}} disabled={blocked} onPress={() => onToggle(interest)}
              className={`min-h-11 justify-center rounded-full border px-4 py-2 ${isSelected ? 'border-primary bg-gold' : 'border-border bg-card'} ${blocked ? 'opacity-40' : 'active:opacity-70'}`}>
              <Text className={isSelected ? 'text-sm font-semibold capitalize text-text-dark' : 'text-sm font-semibold capitalize text-muted'}>{interest}</Text>
            </Pressable>
          );
        })}
      </View>
      <Text className="mt-4 text-xs text-muted">{selected.length}/{MAX_INTERESTS} selected{atLimit ? ' · limit reached' : ''}</Text>
      {error ? <Text accessibilityRole="alert" className="mt-2 text-sm text-coral">{error}</Text> : null}
    </>
  );
};
