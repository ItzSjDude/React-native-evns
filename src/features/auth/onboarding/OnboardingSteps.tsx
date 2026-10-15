import React, {useEffect, useMemo, useState} from 'react';
import {SLIDE_MODAL_ANIMATION} from '../../../Constants/NavigationTransitions';
import {ActivityIndicator, FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import {SafeAreaView} from 'react-native-safe-area-context';
import {Colors} from '../../../Constants/Colors';
import {AppIcon} from '../../../Constants/Icons';
import {COUNTRIES, flagOf, GENDER_OPTIONS, INTENT_OPTIONS, OTHER_PROFESSION, PROFESSION_OPTIONS} from './options';
import {INTEREST_OPTIONS, MAX_INTERESTS} from './validation';
import type {OnboardingFieldErrors} from './types';
import RemoteImage from '../../../components/RemoteImage';

const modalStyles = StyleSheet.create({safe: {flex: 1, backgroundColor: Colors.background}});
const headerStyles = StyleSheet.create({card: {minHeight: 178, borderRadius: 26, overflow: 'hidden'}});

type HeaderProps = {step: number; total: number; canGoBack: boolean; disabled: boolean; onBack: () => void};

export const OnboardingHeader = ({step, total, canGoBack, disabled, onBack}: HeaderProps) => (
  <View className="bg-background px-6 pb-4 pt-3">
    <View className="h-11 flex-row items-center justify-between">
      <Pressable accessibilityRole="button" accessibilityLabel="Back" disabled={!canGoBack || disabled} onPress={onBack}
        className={`h-11 w-11 items-center justify-center rounded-full border border-border ${!canGoBack ? 'opacity-0' : 'active:opacity-70'}`}>
        <View style={{transform: [{rotate: '180deg'}]}}><AppIcon name="chevron" size={19} color={Colors.text} filled={false} /></View>
      </Pressable>
      <Text className="font-display-bold text-[21px] tracking-[-1px] text-foreground">hiva<Text className="text-primary">.</Text></Text>
      <Text className="w-11 text-right font-body-semibold text-[12px] text-muted">{String(step + 1).padStart(2, '0')}/{String(total).padStart(2, '0')}</Text>
    </View>
    <View accessibilityRole="progressbar" accessibilityLabel={`Step ${step + 1} of ${total}`} className="mt-5 flex-row gap-1.5">
      {Array.from({length: total}, (_, index) => <View key={index} className={`h-1 flex-1 rounded-full ${index <= step ? 'bg-primary' : 'bg-border'}`} />)}
    </View>
  </View>
);

const Prompt = ({eyebrow, title, subtitle}: {eyebrow: string; title: string; subtitle: string}) => <View className="mb-7">
  <Text className="font-body-semibold text-[11px] uppercase tracking-[1.8px] text-primary">{eyebrow}</Text>
  <Text accessibilityRole="header" className="mt-3 font-display-bold text-[35px] leading-[40px] tracking-[-1.4px] text-foreground">{title}</Text>
  <Text className="mt-2 font-body text-[15px] leading-[22px] text-muted">{subtitle}</Text>
</View>;

const FieldError = ({message}: {message?: string}) =>
  message ? <Text accessibilityRole="alert" className="mt-1.5 text-xs text-coral">{message}</Text> : null;

type FieldProps = {label: string; error?: string; prefix?: string} & React.ComponentProps<typeof TextInput>;

const Field = ({label, error, prefix, ...props}: FieldProps) => {
  const [focused, setFocused] = useState(false);
  return <View className="mb-5">
    <Text className="mb-1 font-body-semibold text-[12px] uppercase tracking-[1px] text-muted">{label}</Text>
    <View className={`h-14 flex-row items-center border-b ${error ? 'border-coral' : focused ? 'border-primary' : 'border-border'}`}>
      {prefix ? <Text className="mr-1 font-body-medium text-[15px] text-muted">{prefix}</Text> : null}
      <TextInput {...props} onFocus={event => {setFocused(true); props.onFocus?.(event);}} onBlur={event => {setFocused(false); props.onBlur?.(event);}}
        accessibilityLabel={label} placeholderTextColor={Colors.muted} selectionColor={Colors.primary} className="h-14 flex-1 font-body-medium text-[19px] text-foreground" />
    </View>
    {error ? <Text accessibilityRole="alert" className="mt-1.5 text-xs text-coral">{error}</Text> : null}
  </View>;
};

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
            initialNumToRender={16} maxToRenderPerBatch={20} windowSize={7}
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

type IdentityProps = {
  name: string;
  handle: string;
  avatarUrl: string | null;
  initials: string;
  errors: OnboardingFieldErrors;
  pickerAvailable: boolean;
  uploading: boolean;
  disabled: boolean;
  onPickPhoto: () => void;
  onChangeName: (value: string) => void;
  onChangeHandle: (value: string) => void;
};

export const IdentityStep = ({name, handle, avatarUrl, initials, errors, pickerAvailable, uploading, disabled, onPickPhoto, onChangeName, onChangeHandle}: IdentityProps) => {
  const canPick = pickerAvailable && !uploading && !disabled;
  return (
    <>
      <Prompt eyebrow="01  ·  YOUR IDENTITY" title="Let’s make this yours." subtitle="This is how people will recognise you on Hiva." />
      <LinearGradient colors={['#211445', '#5034A4', '#8D72E8']} start={{x: 0, y: 0}} end={{x: 1, y: 1}} style={headerStyles.card}>
        <View className="flex-1 justify-between p-5">
          <View className="flex-row items-start justify-between">
            <Text className="font-display-semibold text-[15px] tracking-[-0.4px] text-white/85">hiva<Text className="text-[#D1C2FF]">.</Text></Text>
            <Text className="font-body-semibold text-[10px] uppercase tracking-[1.4px] text-white/60">YOUR PROFILE</Text>
          </View>
          <View className="flex-row items-end justify-between">
            <View className="flex-1 pr-3">
              <Text numberOfLines={1} className="font-display-bold text-[24px] tracking-[-0.8px] text-white">{name.trim() || 'Your name'}</Text>
              <Text numberOfLines={1} className="mt-1 font-body-medium text-[13px] text-white/70">@{handle.trim() || 'your_handle'}</Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Profile photo picker" accessibilityState={{disabled: !canPick}} disabled={!canPick} onPress={onPickPhoto} className="h-[68px] w-[68px] items-center justify-center overflow-hidden rounded-full border-2 border-white/70 bg-white/20">
              {avatarUrl ? <RemoteImage accessibilityLabel="Profile photo" uri={avatarUrl} className="h-full w-full" /> : <Text className="font-display-bold text-[25px] text-white">{initials}</Text>}
              {uploading ? <View className="absolute inset-0 items-center justify-center bg-black/50"><ActivityIndicator color="#FFFFFF" /></View> : null}
            </Pressable>
          </View>
        </View>
      </LinearGradient>
      <Pressable accessibilityRole="button" accessibilityLabel={avatarUrl ? 'Change photo' : 'Add photo'} accessibilityState={{disabled: !canPick}} disabled={!canPick} onPress={onPickPhoto} className="mb-7 mt-3 min-h-11 self-end justify-center">
        <Text className="font-body-semibold text-[13px] text-primary">{avatarUrl ? 'Change photo' : 'Add a photo  +'} </Text>
      </Pressable>
      <FieldError message={errors.avatarUrl} />
      <Field label="Name" value={name} onChangeText={onChangeName} maxLength={80} editable={!disabled} placeholder="e.g. Aisha Khan" autoComplete="name" textContentType="name" returnKeyType="next" error={errors.name} />
      <Field label="Handle" prefix="@" value={handle} onChangeText={onChangeHandle} maxLength={30} editable={!disabled} placeholder="your_handle" autoCapitalize="none" autoCorrect={false} returnKeyType="done" error={errors.handle} />
      <Text className="font-body text-xs leading-[18px] text-muted">Your handle is how friends find you. You can edit it later.</Text>
    </>
  );
};

type AboutProps = {gender: string; country: string; errors: OnboardingFieldErrors; disabled: boolean; dobSlot?: React.ReactNode; onChangeGender: (value: string) => void; onChangeCountry: (value: string) => void};

export const AboutStep = ({gender, country, errors, disabled, dobSlot, onChangeGender, onChangeCountry}: AboutProps) => (
  <>
      <Prompt eyebrow="02  ·  THE BASICS" title="A little about you." subtitle="A few details help us make Hiva feel right for you." />
      {dobSlot ? <View className="mb-8">{dobSlot}</View> : null}
      <View className="mb-5">
        <Text className="mb-3 font-body-semibold text-[13px] text-foreground">Gender</Text>
        <View accessibilityRole="radiogroup" className="flex-row flex-wrap gap-2.5">
          {GENDER_OPTIONS.map(option => <Pressable key={option.value} accessibilityRole="radio" accessibilityLabel={option.label} accessibilityState={{selected: gender === option.value, disabled}} disabled={disabled} onPress={() => onChangeGender(option.value)}
            className={`min-h-12 flex-row items-center justify-between rounded-full border px-4 ${gender === option.value ? 'border-primary bg-primary-dark' : 'border-border bg-card'}`}>
            <Text className={`font-body-semibold text-[13px] ${gender === option.value ? 'text-primary' : 'text-foreground'}`}>{option.label}</Text>
          </Pressable>)}
        </View>
        <FieldError message={errors.gender} />
      </View>
      <CountryPicker value={country} error={errors.country} disabled={disabled} onChange={onChangeCountry} />
  </>
);

type ProfessionProps = {profession: string; error?: string; disabled: boolean; onChangeProfession: (value: string) => void};

export const ProfessionStep = ({profession, error, disabled, onChangeProfession}: ProfessionProps) => {
  const isPreset = (PROFESSION_OPTIONS as readonly string[]).includes(profession) && profession !== OTHER_PROFESSION;
  const [otherMode, setOtherMode] = useState(profession !== '' && !isPreset);
  useEffect(() => { if (profession && !isPreset) setOtherMode(true); }, [profession, isPreset]);
  return <>
    <Prompt eyebrow="03  ·  YOUR WORLD" title="What do you do?" subtitle="Pick the role that feels most like you. This helps you meet people with shared interests." />
    <View accessibilityRole="radiogroup" className="gap-2">
      {PROFESSION_OPTIONS.map((option, index) => {
        const selected = option === OTHER_PROFESSION ? otherMode : !otherMode && profession === option;
        return <Pressable key={option} accessibilityRole="radio" accessibilityLabel={option} accessibilityState={{selected, disabled}} disabled={disabled}
          onPress={() => { if (option === OTHER_PROFESSION) { setOtherMode(true); onChangeProfession(''); } else { setOtherMode(false); onChangeProfession(option); } }}
          className={`h-[68px] flex-row items-center rounded-[17px] border px-5 ${selected ? 'border-primary bg-primary-dark' : 'border-border bg-card'}`}>
          <Text className={`mr-5 font-body-semibold text-[12px] ${selected ? 'text-primary' : 'text-muted'}`}>{String(index + 1).padStart(2, '0')}</Text>
          <Text className={`flex-1 font-display-semibold text-[19px] ${selected ? 'text-primary' : 'text-foreground'}`}>{option}</Text>
          {selected ? <AppIcon name="check" size={19} color={Colors.primary} filled={false} /> : null}
        </Pressable>;
      })}
    </View>
    {otherMode ? <View className="mt-5"><Field label="Your profession" value={profession} onChangeText={onChangeProfession} maxLength={60} editable={!disabled} placeholder="e.g. Photographer" returnKeyType="done" /></View> : null}
    <FieldError message={error} />
  </>;
};

type IntentProps = {intent: string; error?: string; disabled: boolean; onSelectIntent: (value: string) => void};

export const IntentStep = ({intent, error, disabled, onSelectIntent}: IntentProps) => <>
    <Prompt eyebrow="04  ·  YOUR VIBE" title="What brings you here?" subtitle="Choose the first thing you want to explore. You can do it all later." />
    <View accessibilityRole="radiogroup" className="flex-row flex-wrap justify-between gap-y-3">
      {INTENT_OPTIONS.map((option, index) => {
        const selected = intent === option.value;
        return <Pressable key={option.value} accessibilityRole="radio" accessibilityLabel={option.label} accessibilityState={{selected, disabled}} disabled={disabled} onPress={() => onSelectIntent(option.value)}
          className={`min-h-[100px] w-[48.5%] justify-between rounded-[20px] border p-4 ${selected ? 'border-primary bg-primary-dark' : 'border-border bg-card'}`}>
          <Text className={`font-body-semibold text-[12px] ${selected ? 'text-primary' : 'text-muted'}`}>{String(index + 1).padStart(2, '0')}{selected ? '  ✓' : ''}</Text>
          <Text className={`font-display-semibold text-[16px] leading-[20px] ${selected ? 'text-primary' : 'text-foreground'}`}>{option.label}</Text>
        </Pressable>;
      })}
    </View>
    <FieldError message={error} />
  </>;

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
      <Prompt eyebrow="05  ·  YOUR PEOPLE" title="What are you into?" subtitle="Pick a few things you love. We’ll help you find your crowd." />
      <View className="mb-4 flex-row items-center justify-between">
        <Text className="font-body-semibold text-[12px] uppercase tracking-[1px] text-muted">PICK UP TO {MAX_INTERESTS}</Text>
        <Text className="font-body-semibold text-[12px] text-primary">{selected.length} SELECTED</Text>
      </View>
      <View className="flex-row flex-wrap gap-2.5">
        {INTEREST_OPTIONS.map(interest => {
          const isSelected = selected.includes(interest);
          const blocked = disabled || (atLimit && !isSelected);
          return (
            <Pressable key={interest} accessibilityRole="checkbox" accessibilityLabel={`Interest ${interest}`} accessibilityState={{checked: isSelected, disabled: blocked}} disabled={blocked} onPress={() => onToggle(interest)}
              className={`min-h-[54px] flex-row items-center rounded-full border px-5 ${isSelected ? 'border-primary bg-primary' : 'border-border bg-card'} ${blocked ? 'opacity-40' : 'active:opacity-70'}`}>
              <View className={`mr-2.5 h-2 w-2 rounded-full ${isSelected ? 'bg-white' : 'bg-primary/40'}`} />
              <Text className={`font-body-semibold text-[15px] capitalize ${isSelected ? 'text-white' : 'text-foreground'}`}>{interest}</Text>
            </Pressable>
          );
        })}
      </View>
      {selected.length > 0 ? <View className="mt-8 rounded-[22px] bg-primary-dark p-5">
        <Text className="font-body-semibold text-[11px] uppercase tracking-[1.3px] text-primary">YOUR MIX</Text>
        <Text className="mt-2 font-display-semibold text-[18px] capitalize leading-[25px] text-foreground">{selected.join('  ·  ')}</Text>
      </View> : null}
      {error ? <Text accessibilityRole="alert" className="mt-2 text-sm text-coral">{error}</Text> : null}
    </>
  );
};
