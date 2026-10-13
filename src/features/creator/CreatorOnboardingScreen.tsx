import React, {useEffect, useState} from 'react';
import {SLIDE_MODAL_ANIMATION} from '../../Constants/NavigationTransitions';
import {ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, TextInput, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import IconArrowLeft from '@tabler/icons-react-native/IconArrowLeft';
import IconCheck from '@tabler/icons-react-native/IconCheck';
import {Colors} from '../../Constants/Colors';
import {getMyCreatorOnboarding, submitMyCreatorOnboarding, type CreatorCategory, type CreatorOnboarding} from './creatorService';

const ACCENT = '#8B7CF6';
const CATEGORIES: {label: string; value: CreatorCategory}[] = [
  {label: 'Music', value: 'MUSIC'}, {label: 'Podcasts', value: 'PODCASTS'},
  {label: 'Art', value: 'ART'}, {label: 'Comedy', value: 'COMEDY'},
  {label: 'Gaming', value: 'GAMING'}, {label: 'Education', value: 'EDUCATION'}, {label: 'Other', value: 'OTHER'},
];
const messageOf = (error: unknown) => (error as {message?: string})?.message ?? 'Please try again.';
const validAccount = (value: string) => /^\d{9,18}$/.test(value);
const validIfsc = (value: string) => /^[A-Z]{4}0[A-Z0-9]{6}$/.test(value.trim().toUpperCase());

type Props = {visible: boolean; onClose: () => void};
export default function CreatorOnboardingScreen({visible, onClose}: Props) {
  const [state, setState] = useState<CreatorOnboarding | null>(null);
  const [about, setAbout] = useState('');
  const [categories, setCategories] = useState<CreatorCategory[]>([]);
  const [accountHolder, setAccountHolder] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [ifsc, setIfsc] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) {setAccountNumber(''); setIfsc(''); return;}
    let active = true;
    setLoading(true); setError(null);
    getMyCreatorOnboarding().then(value => {if (active) {setState(value); setAbout(value.about || ''); setCategories(value.categories || []);}})
      .catch(cause => {if (active) setError(messageOf(cause));})
      .finally(() => {if (active) setLoading(false);});
    return () => {active = false;};
  }, [visible]);

  const ready = about.trim().length >= 10 && categories.length > 0 && accountHolder.trim().length >= 2 && validAccount(accountNumber) && validIfsc(ifsc);
  const submit = async () => {
    if (!ready || saving) return;
    setSaving(true); setError(null);
    try {
      const next = await submitMyCreatorOnboarding({about: about.trim(), categories, accountHolder: accountHolder.trim(), accountNumber, ifsc: ifsc.trim().toUpperCase()});
      setState(next);
      setAccountNumber(''); setIfsc('');
    } catch (cause) {setError(messageOf(cause));}
    finally {setSaving(false);}
  };

  const statusCopy = state?.status === 'APPROVED' && state.payoutEligible
    ? 'Your creator account is ready to receive eligible gift earnings.'
    : state?.status === 'APPROVED'
      ? 'Your creator profile is approved, but payout access is not active yet. Gift earnings remain recorded while payout eligibility is checked.'
    : state?.status === 'PENDING' || state?.payoutStatus === 'PENDING'
      ? 'Your details are under review. Gifts can still be received; withdrawals unlock after approval.' : null;

  return <Modal visible={visible} animationType={SLIDE_MODAL_ANIMATION} onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
    <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-background">
      <View className="h-14 flex-row items-center gap-3 px-4">
        <Pressable accessibilityRole="button" accessibilityLabel="Close creator setup" onPress={onClose} className="h-11 w-11 items-center justify-center rounded-full bg-card"><IconArrowLeft size={20} color={Colors.text} /></Pressable>
        <Text accessibilityRole="header" className="text-[19px] font-bold text-foreground">Become a creator</Text>
      </View>
      {loading ? <View className="flex-1 items-center justify-center"><ActivityIndicator color={ACCENT} /></View> : statusCopy ? <View className="flex-1 justify-center px-6">
        <View className="mb-4 h-14 w-14 items-center justify-center rounded-full bg-primary-dark"><IconCheck size={26} color={ACCENT} /></View>
        <Text className="text-[22px] font-bold text-foreground">{state?.status === 'APPROVED' && state.payoutEligible ? 'You’re ready to earn' : state?.status === 'APPROVED' ? 'Payout setup in progress' : 'Application in review'}</Text>
        <Text className="mt-2 text-[14px] leading-5 text-muted">{statusCopy}</Text>
        {!!state?.maskedAccount && <Text className="mt-4 rounded-2xl bg-card p-4 text-[14px] font-semibold text-foreground">Payout account · {state.maskedAccount}</Text>}
        <Pressable accessibilityRole="button" onPress={onClose} className="mt-6 min-h-12 items-center justify-center rounded-full bg-[#8B7CF6]"><Text className="text-[15px] font-bold text-[#160F2E]">Done</Text></Pressable>
      </View> : <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerClassName="gap-4 px-5 pb-8 pt-2">
          <Text className="text-[14px] leading-5 text-muted">Tell us about your work and where to send earnings from gifts. Gift earnings stay on your account while payout details are reviewed.</Text>
          {(state?.status === 'REJECTED' || state?.payoutStatus === 'REJECTED') && <Text className="rounded-xl bg-coral/10 p-3 text-[13px] leading-5 text-coral">{state.rejectionReason || 'Please review your details and submit them again.'}</Text>}
          <Field label="About you" value={about} onChangeText={setAbout} placeholder="What do you create?" multiline maxLength={500} />
          <View><Text className="mb-2 text-[13px] font-bold text-foreground">What kind of creator are you?</Text><View className="flex-row flex-wrap gap-2">
            {CATEGORIES.map(item => {const selected = categories.includes(item.value); return <Pressable key={item.value} accessibilityRole="checkbox" accessibilityState={{checked: selected}} onPress={() => setCategories(current => selected ? current.filter(value => value !== item.value) : [...current, item.value])} className={`min-h-10 justify-center rounded-full border px-3.5 ${selected ? 'border-[#8B7CF6] bg-[#8B7CF6]/15' : 'border-border bg-card'}`}><Text className={`text-[13px] font-semibold ${selected ? 'text-primary' : 'text-foreground'}`}>{item.label}</Text></Pressable>;})}
          </View></View>
          <View className="h-px bg-border" />
          <Text className="text-[17px] font-bold text-foreground">Payout account</Text>
          <Text className="-mt-3 text-[12px] leading-4 text-muted">Use an account you’re authorised to receive creator earnings into. Full bank details are sent securely and aren’t saved on this device.</Text>
          <Field label="Account holder name" value={accountHolder} onChangeText={setAccountHolder} placeholder="Name on bank account" autoCapitalize="words" />
          <Field label="Account number" value={accountNumber} onChangeText={value => setAccountNumber(value.replace(/\D/g, ''))} placeholder="9–18 digits" keyboardType="number-pad" maxLength={18} />
          <Field label="IFSC code" value={ifsc} onChangeText={value => setIfsc(value.toUpperCase())} placeholder="e.g. HDFC0001234" autoCapitalize="characters" maxLength={11} />
          {!!error && <Text accessibilityRole="alert" className="text-[13px] leading-5 text-coral">{error}</Text>}
          <Pressable accessibilityRole="button" accessibilityState={{disabled: !ready || saving, busy: saving}} disabled={!ready || saving} onPress={submit} className={`min-h-12 items-center justify-center rounded-full bg-[#8B7CF6] ${!ready || saving ? 'opacity-50' : ''}`}>
            {saving ? <ActivityIndicator color="#160F2E" /> : <Text className="text-[15px] font-bold text-[#160F2E]">Submit for review</Text>}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>}
    </SafeAreaView>
  </Modal>;
}

function Field({label, value, onChangeText, placeholder, keyboardType, maxLength, multiline, autoCapitalize}: {label: string; value: string; onChangeText: (value: string) => void; placeholder: string; keyboardType?: 'default' | 'number-pad'; maxLength?: number; multiline?: boolean; autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters'}) {
  return <View><Text className="mb-1.5 text-[13px] font-bold text-foreground">{label}</Text><TextInput accessibilityLabel={label} value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={Colors.muted} keyboardType={keyboardType} maxLength={maxLength} multiline={multiline} autoCapitalize={autoCapitalize} autoCorrect={false} secureTextEntry={label === 'Account number'} textContentType={label === 'Account number' ? 'none' : undefined} className={`rounded-[14px] border border-border bg-card px-3.5 text-[14px] text-foreground ${multiline ? 'min-h-24 py-3' : 'h-12'}`} /></View>;
}
