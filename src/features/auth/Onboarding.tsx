import React, {useCallback, useEffect, useRef, useState} from 'react';
import {ActivityIndicator, BackHandler, KeyboardAvoidingView, Platform, Pressable, ScrollView, StatusBar, StyleSheet, Text, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useAppDispatch} from '../../core/store/hooks';
import {imagePicker, uploadErrorMessage, uploadMedia} from '../../core/media';
import {Colors} from '../../Constants/Colors';
import {completeOnboarding} from './authSlice';
import {getOnboardingProfile, saveOnboardingProfile} from './onboarding/onboardingService';
import {IdentityStep, InterestsStep, PhotoStep, ProgressDots} from './onboarding/OnboardingSteps';
import {mapSaveError, MAX_INTERESTS, normalizeHandle, stepForField, suggestHandle, validateDetails, validateIdentity, validateInterests} from './onboarding/validation';
import type {OnboardingDraft, OnboardingField, OnboardingFieldErrors, OnboardingProfileUpdate, OnboardingStep} from './onboarding/types';

const TOTAL_STEPS = 3;
const styles = StyleSheet.create({safe: {flex: 1, backgroundColor: Colors.background}, flex: {flex: 1}});

const initialsOf = (name: string) =>
  name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]!.toUpperCase()).join('') || '?';

const Onboarding = () => {
  const dispatch = useAppDispatch();
  const [step, setStep] = useState<OnboardingStep>(0);
  const [draft, setDraft] = useState<OnboardingDraft>({name: '', handle: '', interests: [], city: '', avatarUrl: null});
  const [existingAvatar, setExistingAvatar] = useState<string | null>(null);
  const [errors, setErrors] = useState<OnboardingFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const touched = useRef(new Set<keyof OnboardingDraft>());
  const mounted = useRef(true);

  useEffect(() => () => { mounted.current = false; }, []);

  // Prefill from the account created by Google sign-in; never overwrite what the user typed.
  useEffect(() => {
    getOnboardingProfile().then(profile => {
      if (!mounted.current) return;
      setExistingAvatar(profile.avatar_url ?? null);
      setDraft(current => {
        const has = (field: keyof OnboardingDraft) => touched.current.has(field);
        const name = has('name') ? current.name : profile.name?.trim() || current.name;
        return {
          ...current,
          name,
          handle: has('handle') ? current.handle : profile.handle || suggestHandle(name) || current.handle,
          interests: has('interests') || !profile.interests?.length ? current.interests : profile.interests.slice(0, MAX_INTERESTS),
          city: has('city') ? current.city : profile.city || current.city,
        };
      });
    }).catch(() => { /* Prefill is best-effort; the user can type everything. */ });
  }, []);

  const update = <K extends keyof OnboardingDraft>(field: K, value: OnboardingDraft[K]) => {
    touched.current.add(field);
    setDraft(current => ({...current, [field]: value}));
    setErrors(current => (current[field as OnboardingField] ? {...current, [field]: undefined} : current));
    setFormError(null);
  };

  const toggleInterest = (interest: string) => {
    const selected = draft.interests.includes(interest);
    if (!selected && draft.interests.length >= MAX_INTERESTS) return;
    update('interests', selected ? draft.interests.filter(item => item !== interest) : [...draft.interests, interest]);
  };

  const goBack = useCallback(() => {
    if (saving || step === 0) return false;
    setFormError(null);
    setStep(current => (current - 1) as OnboardingStep);
    return true;
  }, [saving, step]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', goBack);
    return () => subscription.remove();
  }, [goBack]);

  const pickPhoto = async () => {
    if (!imagePicker.available || uploading) return;
    setErrors(current => ({...current, avatarUrl: undefined}));
    try {
      const file = await imagePicker.pickImage();
      if (!file) return;
      setUploading(true);
      const {fileUrl} = await uploadMedia(file, 'avatar');
      if (mounted.current) update('avatarUrl', fileUrl);
    } catch (error) {
      if (mounted.current) setErrors(current => ({...current, avatarUrl: uploadErrorMessage(error)}));
    } finally {
      if (mounted.current) setUploading(false);
    }
  };

  const save = async (includeOptional: boolean) => {
    if (saving || uploading) return;
    const identityErrors = validateIdentity(draft);
    const interestErrors = validateInterests(draft.interests);
    const detailErrors = includeOptional ? validateDetails(draft) : {};
    const all = {...identityErrors, ...interestErrors, ...detailErrors};
    const firstInvalid = (Object.keys(all) as OnboardingField[])[0];
    if (firstInvalid) {
      setErrors(all);
      setStep(stepForField[firstInvalid]);
      return;
    }
    const city = draft.city.trim();
    const payload: OnboardingProfileUpdate = {
      name: draft.name.trim(),
      handle: normalizeHandle(draft.handle),
      interests: draft.interests,
      ...(includeOptional && city ? {city} : {}),
      ...(includeOptional && draft.avatarUrl ? {avatarUrl: draft.avatarUrl} : {}),
    };
    setSaving(true);
    setFormError(null);
    try {
      await saveOnboardingProfile(payload);
      dispatch(completeOnboarding());
    } catch (error) {
      if (!mounted.current) return;
      const mapped = mapSaveError(error);
      setErrors(mapped.fields);
      setFormError(mapped.message);
      const fieldWithError = (Object.keys(mapped.fields) as OnboardingField[])[0];
      if (fieldWithError) setStep(stepForField[fieldWithError]);
    } finally {
      if (mounted.current) setSaving(false);
    }
  };

  const next = () => {
    if (saving) return;
    const stepErrors = step === 0 ? validateIdentity(draft) : step === 1 ? validateInterests(draft.interests) : validateDetails(draft);
    if (Object.keys(stepErrors).length > 0) {
      setErrors(current => ({...current, ...stepErrors}));
      return;
    }
    if (step === 2) { save(true); return; }
    setFormError(null);
    setStep(current => (current + 1) as OnboardingStep);
  };

  const busy = saving || uploading;
  const isLast = step === TOTAL_STEPS - 1;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <StatusBar barStyle="light-content" />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View className="flex-row items-center justify-between px-5 pb-2 pt-4">
          <ProgressDots step={step} total={TOTAL_STEPS} />
          <Text className="text-xs font-semibold text-muted">Step {step + 1} of {TOTAL_STEPS}</Text>
        </View>
        <ScrollView style={styles.flex} keyboardShouldPersistTaps="handled" contentContainerClassName="px-5 pb-6 pt-6">
          {step === 0 ? <IdentityStep name={draft.name} handle={draft.handle} errors={errors} disabled={saving}
            onChangeName={value => update('name', value)} onChangeHandle={value => update('handle', value.replace(/^@/, '').toLowerCase())} onSubmit={next} /> : null}
          {step === 1 ? <InterestsStep selected={draft.interests} error={errors.interests} disabled={saving} onToggle={toggleInterest} /> : null}
          {step === 2 ? <PhotoStep avatarUrl={draft.avatarUrl ?? existingAvatar} initials={initialsOf(draft.name)} city={draft.city} errors={errors}
            pickerAvailable={imagePicker.available} uploading={uploading} disabled={saving} onPickPhoto={pickPhoto} onChangeCity={value => update('city', value)} /> : null}
          {formError ? <View className="mt-5 rounded-[14px] border border-coral bg-card p-4"><Text accessibilityRole="alert" className="text-sm text-coral">{formError}</Text></View> : null}
        </ScrollView>
        <View className="gap-3 border-t border-border px-5 pb-3 pt-3">
          <View className="flex-row gap-3">
            {step > 0 ? <Pressable accessibilityRole="button" accessibilityLabel="Back" disabled={saving} onPress={goBack}
              className={`h-12 flex-1 items-center justify-center rounded-full border border-border bg-card ${saving ? 'opacity-40' : 'active:opacity-70'}`}>
              <Text className="text-[15px] font-semibold text-foreground">Back</Text>
            </Pressable> : null}
            <Pressable accessibilityRole="button" accessibilityLabel={isLast ? 'Finish' : 'Next'} accessibilityState={{disabled: busy, busy: saving}} disabled={busy} onPress={next}
              className={`h-12 flex-[2] items-center justify-center rounded-full bg-gold ${busy ? 'opacity-40' : 'active:opacity-70'}`}>
              {saving ? <ActivityIndicator color={Colors.textDark} /> : <Text className="text-[15px] font-bold text-text-dark">{isLast ? 'Finish' : 'Next'}</Text>}
            </Pressable>
          </View>
          {isLast ? <Pressable accessibilityRole="button" accessibilityLabel="Skip for now" disabled={busy} onPress={() => save(false)} className="min-h-11 items-center justify-center">
            <Text className={`text-sm font-semibold ${busy ? 'text-muted-light' : 'text-muted'}`}>Skip for now</Text>
          </Pressable> : null}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

export default Onboarding;
