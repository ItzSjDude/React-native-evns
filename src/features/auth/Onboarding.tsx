import React, {useCallback, useEffect, useRef, useState} from 'react';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import {ActivityIndicator, BackHandler, KeyboardAvoidingView, Platform, Pressable, ScrollView, StatusBar, StyleSheet, Text, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useAppDispatch, useAppSelector} from '../../core/store/hooks';
import {imagePicker, uploadErrorMessage, uploadMedia} from '../../core/media';
import {Colors} from '../../Constants/Colors';
import {completeOnboarding} from './authSlice';
import {DateOfBirthPicker, DobConfirmSheet} from './age/DateOfBirthPicker';
import {DOB_NOTICE, EMPTY_DOB, validateDob, type DobDraft} from './age/ageValidation';
import {useSaveDateOfBirth, type ValidDob} from './age/useSaveDateOfBirth';
import {getOnboardingProfile, saveOnboardingProfile} from './onboarding/onboardingService';
import {AboutStep, IdentityStep, IntentStep, InterestsStep, OnboardingHeader, ProfessionStep} from './onboarding/OnboardingSteps';
import {mapSaveError, MAX_INTERESTS, normalizeHandle, stepForField, suggestHandle, validateAbout, validateIdentity, validateInterests, validateIntent, validateProfession, validateProfile} from './onboarding/validation';
import type {OnboardingDraft, OnboardingField, OnboardingFieldErrors, OnboardingProfileUpdate, OnboardingStep} from './onboarding/types';
import type {AuthStackParamList} from '../../Navigation/StackNavigation';

const TOTAL_STEPS = 5;
const styles = StyleSheet.create({safe: {flex: 1, backgroundColor: Colors.background}, flex: {flex: 1}, scroll: {flex: 1, backgroundColor: Colors.background}});

const initialsOf = (name: string) =>
  name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]!.toUpperCase()).join('') || '?';

type OnboardingProps = Partial<NativeStackScreenProps<AuthStackParamList, 'Onboarding'>> & {
  previewMode?: boolean;
  onPreviewClose?: () => void;
};

const Onboarding = ({route, navigation, previewMode, onPreviewClose}: OnboardingProps) => {
  const preview = __DEV__ && (previewMode === true || route?.params?.preview === true);
  const closePreview = useCallback(() => {
    if (onPreviewClose) onPreviewClose();
    else navigation?.goBack();
  }, [navigation, onPreviewClose]);
  const dispatch = useAppDispatch();
  const [step, setStep] = useState<OnboardingStep>(0);
  const scrollRef = useRef<React.ElementRef<typeof ScrollView>>(null);
  const [draft, setDraft] = useState<OnboardingDraft>({name: '', handle: '', interests: [], gender: '', country: '', profession: '', intent: '', avatarUrl: null});
  const [existingAvatar, setExistingAvatar] = useState<string | null>(null);
  const [errors, setErrors] = useState<OnboardingFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  // Ask for a date of birth only when the server runs the age gate (it reported `unknown`);
  // servers without it drop the field, so asking there would be pointless.
  const initialAgeGate = useAppSelector(state => state.auth.ageGate);
  const [needsDob, setNeedsDob] = useState(preview || initialAgeGate === 'confirm');
  const [dob, setDob] = useState<DobDraft>(EMPTY_DOB);
  const [dobError, setDobError] = useState<string | null>(null);
  const [pendingDob, setPendingDob] = useState<ValidDob | null>(null);
  const {save: saveDob, saving: savingDob, error: dobSaveError, clearError: clearDobSaveError} = useSaveDateOfBirth();
  const touched = useRef(new Set<keyof OnboardingDraft>());
  const mounted = useRef(true);

  useEffect(() => () => { mounted.current = false; }, []);
  useEffect(() => { scrollRef.current?.scrollTo({y: 0, animated: false}); }, [step]);

  // Prefill from the account created by Google sign-in; never overwrite what the user typed.
  // Preview reads the account too, but all edits stay in local component state.
  useEffect(() => {
    getOnboardingProfile().then(profile => {
      if (!mounted.current) return;
      setExistingAvatar(profile.avatar_url ?? null);
      if (!preview && profile.ageStatus) setNeedsDob(profile.ageStatus === 'unknown' && profile.dateOfBirthSet !== true);
      setDraft(current => {
        const has = (field: keyof OnboardingDraft) => touched.current.has(field);
        const name = has('name') ? current.name : profile.name?.trim() || current.name;
        return {
          ...current,
          name,
          handle: has('handle') ? current.handle : profile.handle || suggestHandle(name) || current.handle,
          interests: has('interests') || !profile.interests?.length ? current.interests : profile.interests.slice(0, MAX_INTERESTS),
          gender: has('gender') ? current.gender : profile.gender || current.gender,
          country: has('country') ? current.country : profile.country || current.country,
          profession: has('profession') ? current.profession : profile.profession || current.profession,
          intent: has('intent') ? current.intent : profile.intent || current.intent,
        };
      });
    }).catch(() => { /* Prefill is best-effort; the user can type everything. */ });
  }, [preview]);

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
      setStep(2);
    }
  };

  const goBack = useCallback(() => {
    if (saving) return false;
    if (step === 0) {
      if (preview) closePreview();
      return preview;
    }
    setFormError(null);
    setStep(current => (current - 1) as OnboardingStep);
    return true;
  }, [closePreview, preview, saving, step]);

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
      if (preview) { update('avatarUrl', file.uri); return; }
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
  const photoMissing = !preview && imagePicker.available && !avatar;

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
      gender: draft.gender,
      country: draft.country,
      profession: draft.profession.trim(),
      intent: draft.intent,
      ...(draft.avatarUrl ? {avatarUrl: draft.avatarUrl} : {}),
    };
    setSaving(true);
    setFormError(null);
    try {
      const savedProfile = await saveOnboardingProfile(payload);
      if (savedProfile.gender !== payload.gender || savedProfile.country !== payload.country ||
          savedProfile.profession !== payload.profession || savedProfile.intent !== payload.intent ||
          JSON.stringify(savedProfile.interests) !== JSON.stringify(payload.interests)) {
        throw new Error('Could not save your profile details. Please try again later.');
      }
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
    if (preview) {
      if (step === 4) closePreview();
      else setStep(current => (current + 1) as OnboardingStep);
      return;
    }
    const stepErrors = step === 0 ? validateIdentity(draft, photoMissing) : step === 1 ? validateAbout(draft) : step === 2 ? validateProfession(draft.profession) : step === 3 ? validateIntent(draft.intent) : validateInterests(draft.interests);
    const dobResult = step === 1 && needsDob ? validateDob(dob) : null;
    if (dobResult && !dobResult.ok) setDobError(dobResult.error);
    if (Object.keys(stepErrors).length > 0) {
      setErrors(current => ({...current, ...stepErrors}));
      return;
    }
    if (dobResult) {
      if (dobResult.ok) setPendingDob(dobResult);
      return;
    }
    if (step === 4) { save(); return; }
    setFormError(null);
    setStep(current => (current + 1) as OnboardingStep);
  };

  const busy = saving || uploading || savingDob;
  const isLast = step === TOTAL_STEPS - 1;
  const actionLabel = isLast ? 'Create my profile' : 'Continue';

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <StatusBar barStyle="dark-content" />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <OnboardingHeader step={step} total={TOTAL_STEPS} canGoBack={step > 0 || preview} disabled={saving} onBack={goBack} />
        <ScrollView key={step} ref={scrollRef} style={styles.scroll} keyboardShouldPersistTaps="handled" contentContainerClassName="flex-grow px-6 pb-8 pt-7">
          {step === 0 ? <IdentityStep name={draft.name} handle={draft.handle}
            avatarUrl={avatar} initials={initialsOf(draft.name)} errors={errors} pickerAvailable={imagePicker.available} uploading={uploading} disabled={saving}
            onPickPhoto={pickPhoto} onChangeName={value => update('name', value)} onChangeHandle={value => update('handle', value.replace(/^@/, '').toLowerCase())} /> : null}
          {step === 1 ? <AboutStep gender={draft.gender} country={draft.country} errors={errors} disabled={saving}
            dobSlot={needsDob ? <>
              <DateOfBirthPicker value={dob} onChange={changeDob} error={dobError} disabled={saving || savingDob} />
              <Text className="mt-2 font-body text-xs leading-[18px] text-muted">{DOB_NOTICE}</Text>
            </> : undefined}
            onChangeGender={value => update('gender', value)} onChangeCountry={value => update('country', value)} /> : null}
          {step === 2 ? <ProfessionStep profession={draft.profession} error={errors.profession} disabled={saving}
            onChangeProfession={value => update('profession', value)} /> : null}
          {step === 3 ? <IntentStep intent={draft.intent} error={errors.intent} disabled={saving}
            onSelectIntent={value => update('intent', value)} /> : null}
          {step === 4 ? <InterestsStep selected={draft.interests} error={errors.interests} disabled={saving} onToggle={toggleInterest} /> : null}
          {step === 1 && dobSaveError ? <View className="mt-5 rounded-[14px] border border-coral bg-card p-4"><Text accessibilityRole="alert" className="text-sm text-coral">{dobSaveError}</Text></View> : null}
          {formError ? <View className="mt-5 rounded-[14px] border border-coral bg-card p-4"><Text accessibilityRole="alert" className="text-sm text-coral">{formError}</Text></View> : null}
        </ScrollView>
        <View className="bg-background px-6 pb-3 pt-3">
          <Pressable accessibilityRole="button" accessibilityLabel={actionLabel} accessibilityState={{disabled: busy, busy: saving || savingDob}} disabled={busy} onPress={next}
            className={`h-11 items-center justify-center rounded-full bg-gold ${busy ? 'opacity-40' : 'active:opacity-70'}`}>
            {saving || savingDob ? <ActivityIndicator color={Colors.goldInk} /> : <Text className="font-body-bold text-[15px] text-gold-ink">{actionLabel}</Text>}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
      <DobConfirmSheet label={pendingDob?.label ?? null} busy={savingDob} onConfirm={confirmDob} onCancel={() => setPendingDob(null)} />
    </SafeAreaView>
  );
};

export default Onboarding;
