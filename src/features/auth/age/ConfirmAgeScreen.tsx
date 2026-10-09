import React, {useState} from 'react';
import {ActivityIndicator, Pressable, ScrollView, StatusBar, Text, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import IconCake from '@tabler/icons-react-native/IconCake';
import {useAppDispatch} from '../../../core/store/hooks';
import {Colors} from '../../../Constants/Colors';
import {logoutFromApi} from '../authService';
import {clearSession} from '../authSlice';
import {DateOfBirthPicker, DobConfirmSheet} from './DateOfBirthPicker';
import {DOB_NOTICE, EMPTY_DOB, validateDob, type DobDraft} from './ageValidation';
import {useSaveDateOfBirth, type ValidDob} from './useSaveDateOfBirth';

/** Blocking screen for existing accounts the server reports as `ageStatus: 'unknown'`. */
const ConfirmAgeScreen = () => {
  const dispatch = useAppDispatch();
  const [dob, setDob] = useState<DobDraft>(EMPTY_DOB);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [pending, setPending] = useState<ValidDob | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const {save, saving, error, clearError} = useSaveDateOfBirth();

  const change = (next: DobDraft) => { setDob(next); setFieldError(null); clearError(); };

  const submit = () => {
    const result = validateDob(dob);
    if (!result.ok) { setFieldError(result.error); return; }
    setPending(result);
  };

  const confirm = async () => {
    if (!pending || saving) return;
    await save(pending);
    // On success the navigator swaps this screen out; on failure the error shows below the picker.
    setPending(null);
  };

  const logout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try { await logoutFromApi(); } catch { /* Local sign-out still happens. */ } finally { dispatch(clearSession()); }
  };

  const busy = saving || loggingOut;
  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']}>
      <StatusBar barStyle="light-content" />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerClassName="flex-grow px-5 pb-6 pt-10">
        <View className="mb-6 h-14 w-14 items-center justify-center rounded-full bg-primary-dark"><IconCake size={28} color={Colors.primary} /></View>
        <Text accessibilityRole="header" className="text-[26px] font-bold text-foreground">Confirm your age</Text>
        <Text className="mb-6 mt-2 text-[15px] leading-[22px] text-muted">{DOB_NOTICE}</Text>
        <DateOfBirthPicker value={dob} onChange={change} error={fieldError} disabled={busy} />
        {error ? <View className="mt-5 rounded-[14px] border border-coral bg-card p-4"><Text accessibilityRole="alert" className="text-sm text-coral">{error}</Text></View> : null}
      </ScrollView>
      <View className="gap-1 border-t border-border px-5 pb-3 pt-3">
        <Pressable accessibilityRole="button" accessibilityLabel="Continue" accessibilityState={{disabled: busy, busy: saving}} disabled={busy} onPress={submit}
          className={`h-12 items-center justify-center rounded-full bg-gold ${busy ? 'opacity-40' : 'active:opacity-70'}`}>
          {saving ? <ActivityIndicator color={Colors.textDark} /> : <Text className="text-[15px] font-bold text-text-dark">Continue</Text>}
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Log out" disabled={busy} onPress={logout} className="min-h-11 items-center justify-center">
          <Text className={`text-sm font-semibold ${busy ? 'text-muted-light' : 'text-muted'}`}>{loggingOut ? 'Logging out…' : 'Log out'}</Text>
        </Pressable>
      </View>
      <DobConfirmSheet label={pending?.label ?? null} busy={saving} onConfirm={confirm} onCancel={() => setPending(null)} />
    </SafeAreaView>
  );
};

export default ConfirmAgeScreen;
