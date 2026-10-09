import React from 'react';
import {ActivityIndicator, Image, Pressable, Text, TextInput, View} from 'react-native';
import {Colors} from '../../../Constants/Colors';
import {INTEREST_OPTIONS, MAX_INTERESTS} from './validation';
import type {OnboardingFieldErrors} from './types';

export const ProgressDots = ({step, total}: {step: number; total: number}) => (
  <View accessibilityRole="progressbar" accessibilityLabel={`Step ${step + 1} of ${total}`} className="flex-row items-center gap-2">
    {Array.from({length: total}, (_, index) => (
      <View key={index} className={index === step ? 'h-2 w-6 rounded-full bg-gold' : index < step ? 'h-2 w-2 rounded-full bg-gold' : 'h-2 w-2 rounded-full bg-border'} />
    ))}
  </View>
);

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

type IdentityProps = {
  name: string;
  handle: string;
  errors: OnboardingFieldErrors;
  disabled: boolean;
  onChangeName: (value: string) => void;
  onChangeHandle: (value: string) => void;
  onSubmit: () => void;
};

export const IdentityStep = ({name, handle, errors, disabled, onChangeName, onChangeHandle, onSubmit}: IdentityProps) => (
  <>
    <StepHeader title="Welcome to Hiva" subtitle="Tell people who you are. You can change this later from your profile." />
    <Field label="Name" value={name} onChangeText={onChangeName} maxLength={80} editable={!disabled} placeholder="Your name" autoComplete="name" textContentType="name" returnKeyType="next" error={errors.name} />
    <Field label="Handle" prefix="@" value={handle} onChangeText={onChangeHandle} maxLength={30} editable={!disabled} placeholder="your_handle" autoCapitalize="none" autoCorrect={false} returnKeyType="done" onSubmitEditing={onSubmit} error={errors.handle} />
    {!errors.handle ? <Text className="-mt-2 text-xs text-muted">3–30 lowercase letters, numbers or underscores.</Text> : null}
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

type PhotoProps = {
  avatarUrl: string | null;
  initials: string;
  city: string;
  errors: OnboardingFieldErrors;
  pickerAvailable: boolean;
  uploading: boolean;
  disabled: boolean;
  onPickPhoto: () => void;
  onChangeCity: (value: string) => void;
};

export const PhotoStep = ({avatarUrl, initials, city, errors, pickerAvailable, uploading, disabled, onPickPhoto, onChangeCity}: PhotoProps) => {
  const canPick = pickerAvailable && !uploading && !disabled;
  return (
    <>
      <StepHeader title="Finishing touches" subtitle="Both are optional. A photo and city help friends recognise you." />
      <View className="mb-6 items-center rounded-[20px] border border-border bg-card p-5">
        <View className="h-24 w-24 items-center justify-center overflow-hidden rounded-full bg-primary-dark">
          {avatarUrl ? <Image accessibilityLabel="Profile photo" source={{uri: avatarUrl}} className="h-full w-full" /> : <Text className="text-[28px] font-bold text-primary">{initials}</Text>}
          {uploading ? <View className="absolute inset-0 items-center justify-center bg-black/50"><ActivityIndicator color={Colors.primary} /></View> : null}
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={avatarUrl ? 'Change photo' : 'Add photo'} accessibilityState={{disabled: !canPick}} disabled={!canPick} onPress={onPickPhoto}
          className={`mt-4 min-h-11 justify-center rounded-full border border-primary-border px-5 ${canPick ? 'active:opacity-70' : 'opacity-40'}`}>
          <Text className="text-sm font-semibold text-primary">{uploading ? 'Uploading…' : avatarUrl ? 'Change photo' : 'Add photo'}</Text>
        </Pressable>
        {!pickerAvailable ? <Text className="mt-3 text-center text-xs text-muted">Photo upload isn't available in this version yet. You can add one later from your profile.</Text> : null}
        {errors.avatarUrl ? <Text accessibilityRole="alert" className="mt-2 text-center text-xs text-coral">{errors.avatarUrl}</Text> : null}
      </View>
      <Field label="City" value={city} onChangeText={onChangeCity} maxLength={80} editable={!disabled} placeholder="Where are you based?" autoComplete="postal-address-locality" textContentType="addressCity" returnKeyType="done" error={errors.city} />
    </>
  );
};
