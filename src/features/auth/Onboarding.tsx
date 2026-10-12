import React, {useCallback, useEffect, useRef, useState} from 'react';
import {ActivityIndicator, BackHandler, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import ThemedStatusBar from '../../components/ThemedStatusBar';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useAppDispatch, useAppSelector} from '../../core/store/hooks';
import {imagePicker, uploadErrorMessage, uploadMedia} from '../../core/media';
import {Colors} from '../../Constants/Colors';
import {completeOnboarding} from './authSlice';
import {DateOfBirthPicker, DobConfirmSheet} from './age/DateOfBirthPicker';
import {DOB_NOTICE, EMPTY_DOB, validateDob, type DobDraft} from './age/ageValidation';
import {useSaveDateOfBirth, type ValidDob} from './age/useSaveDateOfBirth';
import {getOnboardingProfile, saveOnboardingProfile} from './onboarding/onboardingService';
import {IntentStep, InterestsStep, OnboardingHeader, ProfileStep} from './onboarding/OnboardingSteps';
import {SEND_PROFILE_EXTRAS} from './onboarding/options';
import {mapSaveError, MAX_INTERESTS, normalizeHandle, stepForField, suggestHandle, validateInterests, validateIntent, validateProfile} from './onboarding/validation';
import type {OnboardingDraft, OnboardingField, OnboardingFieldErrors, OnboardingProfileUpdate, OnboardingStep} from './onboarding/types';

const TOTAL_STEPS = 3;
const styles = StyleSheet.create({safe: {flex: 1, backgroundColor: Colors.background}, flex: {flex: 1}});

const initialsOf = (name: string) =>
  name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]!.toUpperCase()).join('') || '?';

const Onboarding = () => {
  const dispatch = useAppDispatch();
  const [step, setStep] = useState<OnboardingStep>(0);
  const [draft, setDraft] = useState<OnboardingDraft>({name: '', handle: '', interests: [], gender: '', country: '', profession: '', intent: '', avatarUrl: null});
  const [existingAvatar, setExistingAvatar] = useState<string | null>(null);
  const [errors, setErrors] = useState<OnboardingFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  // Ask for a date of birth only when the server runs the age gate (it reported `unknown`);
  // servers without it drop the field, so asking there would be pointless.
  const initialAgeGate = useAppSelector(state => state.auth.ageGate);
  const [needsDob, setNeedsDob] = useState(initialAgeGate === 'confirm');
  const [dob, setDob] = useState<DobDraft>(EMPTY_DOB);
  const [dobError, setDobError] = useState<string | null>(null);
  const [pendingDob, setPendingDob] = useState<ValidDob | null>(null);
  const {save: saveDob, saving: savingDob, error: dobSaveError, clearError: clearDobSaveError} = useSaveDateOfBirth();
  const touched = useRef(new Set<keyof OnboardingDraft>());
  const mounted = useRef(true);

  useEffect(() => () => { mounted.current = false; }, []);

  // Prefill from the account created by Google sign-in; never overwrite what the user typed.
  useEffect(() => {
    getOnboardingProfile().then(profile => {
      if (!mounted.current) return;
      setExistingAvatar(profile.avatar_url ?? null);
      if (profile.ageStatus) setNeedsDob(profile.ageStatus === 'unknown' && profile.dateOfBirthSet !== true);
      setDraft(current => {
        const has = (field: keyof OnboardingDraft) => touched.current.has(field);
        const name = has('name') ? current.name : profile.name?.trim() || current.name;
        return {
          ...current,
          name,
          handle: has('handle') ? current.handle : profile.handle || suggestHandle(name) || current.handle,
          interests: has('interests') || !profile.interests?.length ? current.interests : profile.interests.slice(0, MAX_INTERESTS),
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

  const changeDob = (next: DobDraft) => {
    setDob(next);
    setDobError(null);
    clearDobSaveError();
  };

  const confirmDob = async () => {
    if (!pendingDob || savingDob) return;
    const gate = await saveDob(pendingDob);
    if (!mounted.current) return;
    setPendingDob(null);
    // 'minor' swaps this screen for the 18+ screen; anything else carries on.
    if (gate && gate !== 'minor') {
      setNeedsDob(false);
      setStep(1);
    }
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

  const avatar = draft.avatarUrl ?? existingAvatar;
  // Without the native picker a photo can't be added, so don't block on one.
  const photoMissing = imagePicker.available && !avatar;

  const save = async () => {
    if (saving || uploading) return;
    const all = {...validateProfile(draft, photoMissing), ...validateIntent(draft.intent), ...validateInterests(draft.interests)};
    const firstInvalid = (Object.keys(all) as OnboardingField[])[0];
    if (firstInvalid) {
      setErrors(all);
      setStep(stepForField[firstInvalid]);
      return;
    }
    const payload: OnboardingProfileUpdate = {
      name: draft.name.trim(),
      handle: normalizeHandle(draft.handle),
      interests: draft.interests,
      ...(draft.avatarUrl ? {avatarUrl: draft.avatarUrl} : {}),
      ...(SEND_PROFILE_EXTRAS ? {gender: draft.gender, country: draft.country, profession: draft.profession.trim(), intent: draft.intent} : {}),
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
    if (savingDob) return;
    const stepErrors = step === 0 ? validateProfile(draft, photoMissing) : step === 1 ? validateIntent(draft.intent) : validateInterests(draft.interests);
    const dobResult = step === 0 && needsDob ? validateDob(dob) : null;
    if (dobResult && !dobResult.ok) setDobError(dobResult.error);
    if (Object.keys(stepErrors).length > 0) {
      setErrors(current => ({...current, ...stepErrors}));
      return;
    }
    if (dobResult) {
      if (dobResult.ok) setPendingDob(dobResult);
      return;
    }
    if (step === 2) { save(); return; }
    setFormError(null);
    setStep(current => (current + 1) as OnboardingStep);
  };

  const busy = saving || uploading || savingDob;
  const isLast = step === TOTAL_STEPS - 1;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ThemedStatusBar />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <OnboardingHeader step={step} total={TOTAL_STEPS} canGoBack={step > 0} disabled={saving} onBack={goBack} />
        <ScrollView style={styles.flex} keyboardShouldPersistTaps="handled" contentContainerClassName="px-5 pb-6 pt-6">
          {step === 0 ? <ProfileStep name={draft.name} handle={draft.handle} gender={draft.gender} country={draft.country} profession={draft.profession}
            avatarUrl={avatar} initials={initialsOf(draft.name)} errors={errors} pickerAvailable={imagePicker.available} uploading={uploading} disabled={saving}
            onPickPhoto={pickPhoto} onChangeName={value => update('name', value)} onChangeHandle={value => update('handle', value.replace(/^@/, '').toLowerCase())}
            onChangeGender={value => update('gender', value)} onChangeCountry={value => update('country', value)} onChangeProfession={value => update('profession', value)} /> : null}
          {step === 0 && needsDob ? <View className="mt-2">
            <DateOfBirthPicker value={dob} onChange={changeDob} error={dobError} disabled={saving || savingDob} />
            <Text className="mt-2 text-xs leading-[18px] text-muted">{DOB_NOTICE}</Text>
          </View> : null}
          {step === 1 ? <IntentStep selected={draft.intent} error={errors.intent} disabled={saving} onSelect={value => update('intent', value)} /> : null}
          {step === 2 ? <InterestsStep selected={draft.interests} error={errors.interests} disabled={saving} onToggle={toggleInterest} /> : null}
          {step === 0 && dobSaveError ? <View className="mt-5 rounded-[14px] border border-coral bg-card p-4"><Text accessibilityRole="alert" className="text-sm text-coral">{dobSaveError}</Text></View> : null}
          {formError ? <View className="mt-5 rounded-[14px] border border-coral bg-card p-4"><Text accessibilityRole="alert" className="text-sm text-coral">{formError}</Text></View> : null}
        </ScrollView>
        <View className="border-t border-border px-5 pb-3 pt-3">
          <Pressable accessibilityRole="button" accessibilityLabel={isLast ? 'Finish' : 'Next'} accessibilityState={{disabled: busy, busy: saving || savingDob}} disabled={busy} onPress={next}
            className={`h-12 items-center justify-center rounded-full bg-gold ${busy ? 'opacity-40' : 'active:opacity-70'}`}>
            {saving || savingDob ? <ActivityIndicator color={Colors.textDark} /> : <Text className="text-[15px] font-bold text-text-dark">{isLast ? 'Finish' : 'Next'}</Text>}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
      <DobConfirmSheet label={pendingDob?.label ?? null} busy={savingDob} onConfirm={confirmDob} onCancel={() => setPendingDob(null)} />
    </SafeAreaView>
  );
};

export default Onboarding;
