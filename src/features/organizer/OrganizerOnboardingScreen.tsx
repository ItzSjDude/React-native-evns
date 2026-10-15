import React, {useEffect, useMemo, useRef, useState} from 'react';
import {SLIDE_MODAL_ANIMATION} from '../../Constants/NavigationTransitions';
import {ActivityIndicator, Modal, Platform, Pressable, ScrollView, Text, TextInput, View} from 'react-native';
import DateTimePicker, {DateTimePickerAndroid} from '@react-native-community/datetimepicker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import IconArrowLeft from '@tabler/icons-react-native/IconArrowLeft';
import IconCheck from '@tabler/icons-react-native/IconCheck';
import IconPlus from '@tabler/icons-react-native/IconPlus';
import IconUpload from '@tabler/icons-react-native/IconUpload';
import {SafeAreaView} from 'react-native-safe-area-context';
import {Colors} from '../../Constants/Colors';
import {loadSession} from '../auth';
import {imagePicker} from '../../core/media/imagePicker';
import {uploadMedia} from '../../core/media/uploadMedia';
import type {LocalMediaFile} from '../../core/media/types';
import type {OrganizerOnboardingDraft, OrganizerPayoutAccount, Workspace} from './types';
import {createOrganizerEvent, createOrganizerWorkspace, getPayoutAccountStatus, listMyWorkspaces, saveOrganizerPayoutAccount, submitOrganizerVerification, updateOrganizerWorkspace} from './organizerService';
import {paidTicketLockMessage} from './organizerPresentation';
import PayoutStatusBadge from './PayoutStatusBadge';
import RemoteImage from '../../components/RemoteImage';

const STORE_PREFIX = '@hiva/organizer-onboarding/';
const NO_WORKSPACES: Workspace[] = [];
const STEPS = ['Organisation', 'Verification', 'Payouts', 'First event'];
const EVENT_KINDS = ['Live shows', 'Workshops', 'Conferences', 'Meetups', 'Festivals'];
const ORGANISATION_TYPES: {label: string; value: OrganizerOnboardingDraft['organizationType']}[] = [
  {label: 'Independent organiser', value: 'INDEPENDENT_ORGANISER'},
  {label: 'Registered business', value: 'REGISTERED_BUSINESS'},
  {label: 'Non-profit', value: 'NON_PROFIT'},
];
const DOCUMENTS: {label: string; value: OrganizerOnboardingDraft['verificationType']}[] = [
  {label: 'GST registration certificate', value: 'GST_CERTIFICATE'},
  {label: 'Business PAN card', value: 'BUSINESS_PAN'},
  {label: 'Personal PAN and Aadhaar', value: 'PERSONAL_PAN_AADHAAR'},
];

const emptyDraft = (): OrganizerOnboardingDraft => ({
  organizationName: '', organizationType: 'INDEPENDENT_ORGANISER', city: '', eventKinds: [],
  verificationType: 'GST_CERTIFICATE', accountHolder: '', accountNumber: '', ifsc: '', payoutSchedule: 'AFTER_EACH_EVENT',
  eventName: '', eventDescription: '', eventDate: '', eventTime: '', venue: '', ticketType: 'FREE', capacity: '100',
});
const hasValidFutureStart = (date: string, time: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return false;
  const [year, month, day] = date.split('-').map(Number);
  const calendarDate = new Date(year!, month! - 1, day!);
  return calendarDate.getFullYear() === year && calendarDate.getMonth() === month! - 1 && calendarDate.getDate() === day && new Date(`${date}T${time}`).getTime() > Date.now();
};

const Field = ({label, value, onChangeText, placeholder, keyboardType, maxLength, autoCapitalize, autoCorrect}: {label: string; value: string; onChangeText: (value: string) => void; placeholder?: string; keyboardType?: 'default' | 'number-pad' | 'decimal-pad' | 'email-address'; maxLength?: number; autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters'; autoCorrect?: boolean}) => <View className="mb-4">
  <Text className="mb-1.5 text-[12px] font-bold text-foreground">{label}</Text>
  <TextInput accessibilityLabel={label} value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={Colors.muted}
    keyboardType={keyboardType} maxLength={maxLength} autoCapitalize={autoCapitalize} autoCorrect={autoCorrect} className="h-[48px] rounded-[14px] border border-border bg-card px-3.5 text-[14px] text-foreground" />
</View>;

const Choice = ({label, selected, onPress}: {label: string; selected: boolean; onPress: () => void}) => <Pressable accessibilityRole="button" accessibilityState={{selected}} onPress={onPress}
  className={`mb-2 min-h-[44px] flex-row items-center rounded-[13px] border px-3 ${selected ? 'border-gold bg-gold/10' : 'border-border bg-card'}`}>
  <View className={`mr-2.5 h-[17px] w-[17px] items-center justify-center rounded-full border ${selected ? 'border-gold bg-gold' : 'border-muted'}`}>{selected && <View className="h-[6px] w-[6px] rounded-full bg-white" />}</View>
  <Text className="flex-1 text-[13px] font-semibold text-foreground">{label}</Text>
</Pressable>;

type OrganizerOnboardingScreenProps = {onClose: () => void; mode?: 'onboarding' | 'hostEvent'; workspaces?: Workspace[]; onEventCreated?: () => void};

const OrganizerOnboardingScreen = ({onClose, mode = 'onboarding', workspaces = NO_WORKSPACES, onEventCreated}: OrganizerOnboardingScreenProps) => {
  const hostMode = mode === 'hostEvent';
  const workspacesRef = useRef(workspaces);
  workspacesRef.current = workspaces;
  const [draft, setDraft] = useState(emptyDraft);
  const [step, setStep] = useState(0);
  const [storageKey, setStorageKey] = useState<string | null>(null);
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [documentFile, setDocumentFile] = useState<LocalMediaFile | null>(null);
  const [eventFile, setEventFile] = useState<LocalMediaFile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [complete, setComplete] = useState(false);
  const [picking, setPicking] = useState<'date' | 'time' | null>(null);
  const [payoutAccount, setPayoutAccount] = useState<OrganizerPayoutAccount | null>(null);

  useEffect(() => {
    let alive = true;
    setDraftLoaded(false);
    loadSession().then(async session => {
      if (!alive) return;
      const userId = session?.user?.id ?? 'guest';
      const key = hostMode ? `${STORE_PREFIX}event/${userId}` : `${STORE_PREFIX}${userId}`;
      setStorageKey(key);
      try {
        const saved = await AsyncStorage.getItem(key);
        const defaultWorkspace = workspacesRef.current[0];
        if (alive && saved) {
          const parsed = JSON.parse(saved) as Partial<OrganizerOnboardingDraft> & {step?: number};
          const {step: savedStep, ...values} = parsed;
          const hostWorkspace = hostMode ? workspacesRef.current.find(workspace => workspace.id === values.workspaceId) ?? defaultWorkspace : undefined;
          setDraft({...emptyDraft(), ...values, ...(hostMode ? {workspaceId: hostWorkspace?.id, organizationName: hostWorkspace?.name} : {}), accountNumber: '', ifsc: ''});
          setStep(hostMode ? 3 : Math.min(Math.max(savedStep ?? 0, 0), 3));
        } else if (alive && hostMode) {
          setDraft({...emptyDraft(), workspaceId: defaultWorkspace?.id, organizationName: defaultWorkspace?.name});
          setStep(3);
        }
      } catch { /* A corrupt local draft should not block onboarding. */ }
      finally { if (alive) setDraftLoaded(true); }
    }).catch(() => {if (alive) setDraftLoaded(true);});
    return () => {alive = false;};
  }, [hostMode]);

  useEffect(() => {
    if (!storageKey || !draftLoaded) return;
    AsyncStorage.setItem(storageKey, JSON.stringify({...draft, step}, (key, value) => key === 'accountNumber' || key === 'ifsc' ? undefined : value)).catch(() => {});
  }, [draft, draftLoaded, step, storageKey]);

  const update = (patch: Partial<OrganizerOnboardingDraft>) => setDraft(current => ({...current, ...patch}));

  // Payout status is only relevant once a workspace exists, on the payouts step and the event step.
  useEffect(() => {
    if (!draft.workspaceId || step < 2) return;
    let alive = true;
    setPayoutAccount(null);
    getPayoutAccountStatus(draft.workspaceId).then(account => {if (alive) setPayoutAccount(account);}).catch(() => {if (alive) setPayoutAccount(null);});
    return () => {alive = false;};
  }, [draft.workspaceId, step]);
  const paidLockMessage = paidTicketLockMessage(payoutAccount);
  // A saved PAID draft cannot stay PAID while payouts are not verified; free events are never affected.
  useEffect(() => {if (paidLockMessage && draft.ticketType === 'PAID') update({ticketType: 'FREE'});}, [paidLockMessage, draft.ticketType]);
  const openPicker = (kind: 'date' | 'time') => {
    const fallback = new Date();
    const value = kind === 'date' && /^\d{4}-\d{2}-\d{2}$/.test(draft.eventDate) ? new Date(`${draft.eventDate}T12:00:00`) : kind === 'time' && /^\d{2}:\d{2}$/.test(draft.eventTime) ? new Date(`2020-01-01T${draft.eventTime}:00`) : fallback;
    const onChange = (event: {type?: string}, date?: Date) => {
      if (event.type !== 'set' || !date) return;
      update(kind === 'date' ? {eventDate: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`} : {eventTime: `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`});
      setPicking(null);
    };
    if (Platform.OS === 'android') DateTimePickerAndroid.open({value, mode: kind, ...(kind === 'time' ? {is24Hour: true} : {}), onChange});
    else setPicking(kind);
  };
  const canContinue = useMemo(() => {
    if (step === 0) return draft.organizationName.trim().length >= 2 && draft.city.trim().length >= 2 && draft.eventKinds.length > 0;
    if (step === 1) return Boolean(draft.workspaceId && draft.verificationFileUrl);
    if (step === 2) return Boolean(draft.workspaceId) && draft.accountHolder.trim().length >= 2 && /^[0-9]{8,18}$/.test(draft.accountNumber) && /^[A-Z]{4}0[A-Z0-9]{6}$/.test(draft.ifsc.trim().toUpperCase());
    return Boolean(draft.workspaceId) && draft.eventName.trim().length >= 2 && hasValidFutureStart(draft.eventDate, draft.eventTime) && draft.venue.trim().length >= 2 && Number.isInteger(Number(draft.capacity)) && Number(draft.capacity) > 0;
  }, [draft, step]);

  const chooseImage = async (kind: 'logo' | 'document' | 'event') => {
    setError(null);
    try {
      const file = await imagePicker.pickImage();
      if (!file) return;
      if (kind === 'logo') {
        setLoading(true);
        try { const uploaded = await uploadMedia(file, 'workspace'); update({logoUrl: uploaded.fileUrl}); }
        finally { setLoading(false); }
      } else if (kind === 'event') {
        setEventFile(file);
        setLoading(true);
        try { const uploaded = await uploadMedia(file, 'event'); update({eventCoverUrl: uploaded.fileUrl}); }
        finally { setLoading(false); }
      } else {
        setDocumentFile(file);
        setLoading(true);
        try { const uploaded = await uploadMedia(file, 'organizer_verification'); update({verificationFileUrl: uploaded.fileUrl}); }
        finally { setLoading(false); }
      }
    } catch (cause) { setError((cause as {message?: string})?.message ?? 'Could not upload this file. Please try again.'); setLoading(false); }
  };

  const continueStep = async () => {
    if (!canContinue || loading) return;
    setLoading(true); setError(null);
    try {
      if (step === 0) {
        if (!draft.workspaceId) {
          // Recover a workspace created by a request whose response was interrupted or malformed.
          const existing = (await listMyWorkspaces()).find(workspace => workspace.role === 'OWNER' && workspace.name.trim() === draft.organizationName.trim());
          if (existing) {
            await updateOrganizerWorkspace(existing.id, draft);
            update({workspaceId: existing.id});
          } else {
            const result = await createOrganizerWorkspace(draft);
            update({workspaceId: result.id});
          }
        } else await updateOrganizerWorkspace(draft.workspaceId, draft);
      } else if (step === 1) {
        await submitOrganizerVerification(draft.workspaceId!, {documentType: draft.verificationType, fileUrl: draft.verificationFileUrl!});
      } else if (step === 2) {
        await saveOrganizerPayoutAccount(draft.workspaceId!, draft);
      } else {
        await createOrganizerEvent(draft.workspaceId!, draft);
        setComplete(true);
        if (storageKey) await AsyncStorage.removeItem(storageKey);
        onEventCreated?.();
      }
      if (step < 3) setStep(step + 1);
    } catch (cause) { setError((cause as {message?: string})?.message ?? 'Could not save this step. Please try again.'); }
    finally { setLoading(false); }
  };

  const finishLater = () => { onClose(); };
  const title = hostMode ? 'Create an event' : ['About your organisation', 'Verify your organisation', 'Add your bank account', 'Create your first event'][step];
  const subtitle = hostMode ? 'Add the details people need to decide if they want to come.' : ([
    'Attendees see this on every event page you run.',
    'Upload one document. Paid tickets unlock once it is approved.',
    'Ticket money is paid here. We send a small amount to confirm the account.',
    'Add the basics now. You can change anything before it goes on sale.',
  ][step]);

  return <Modal visible animationType={SLIDE_MODAL_ANIMATION} presentationStyle="fullScreen" onRequestClose={onClose}>
    <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-background">
    <View className="flex-row items-center px-5 pb-2 pt-2">
      <Pressable accessibilityRole="button" accessibilityLabel={hostMode ? 'Close' : 'Back'} onPress={() => !hostMode && step > 0 && !complete ? setStep(step - 1) : onClose()} className="h-10 w-10 items-center justify-center rounded-full border border-border bg-card"><IconArrowLeft size={18} color={Colors.text} /></Pressable>
      <Text className="flex-1 text-center text-[12px] font-semibold text-muted">{complete ? (hostMode ? 'Saved' : 'Setup complete') : hostMode ? 'New event' : `Step ${step + 1} of 4`}</Text>
      <View className="h-10 w-10" />
    </View>
    {!complete && !hostMode && <View className="mx-5 mb-4 flex-row gap-1">
      {STEPS.map((label, index) => <View key={label} className={`h-[3px] flex-1 rounded-full ${index <= step ? 'bg-primary' : 'bg-border'}`} />)}
    </View>}
    {complete ? <View className="flex-1 justify-center px-6">
      <View className="mb-4 h-14 w-14 items-center justify-center rounded-full bg-primary-dark"><IconCheck size={26} color={Colors.primary} /></View>
      <Text className="font-display-semibold text-[25px] leading-[30px] text-foreground">{hostMode ? 'Event draft created' : `${draft.organizationName || 'Your organisation'} is ready`}</Text>
      <Text className="mt-2 text-[14px] leading-5 text-muted">{hostMode ? 'Your event is saved as a draft. Add any finishing touches before publishing.' : 'Your first event was saved as a draft. Publish it when you’re ready to sell tickets.'}</Text>
      {!hostMode && <View className="mt-6 rounded-[18px] border border-border bg-card p-4">
        {[['Organisation profile', true], ['Document submitted', Boolean(draft.verificationFileUrl)], ['Bank account added', Boolean(draft.accountHolder)], ['First event created', true]].map(([label, done]) => <View key={String(label)} className="flex-row items-center border-b border-border py-3"><View className={`mr-3 h-5 w-5 items-center justify-center rounded-full ${done ? 'bg-primary' : 'border border-muted'}`}>{done && <IconCheck size={12} color={Colors.goldInk} />}</View><Text className="text-[13px] font-medium text-foreground">{label}</Text></View>)}
      </View>}
      <PrimaryButton label="Go to events" onPress={onClose} />
    </View> : <>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerClassName="px-5 pb-5">
        <Text accessibilityRole="header" className="font-display-semibold text-[22px] leading-[26px] text-foreground">{title}</Text>
        <Text className="mb-5 mt-1 text-[12px] leading-[17px] text-muted">{subtitle}</Text>
        {step === 0 && <>
          <View className="mb-4 flex-row items-center gap-3">
            <Pressable accessibilityRole="button" accessibilityLabel="Add organisation logo" onPress={() => chooseImage('logo')} className="h-[62px] w-[62px] items-center justify-center overflow-hidden rounded-[15px] border border-dashed border-border bg-card">
              {draft.logoUrl ? <RemoteImage uri={draft.logoUrl} className="h-full w-full" /> : <IconPlus size={19} color={Colors.muted} />}
            </Pressable>
            <View className="flex-1"><Text className="mb-1.5 text-[12px] font-bold text-foreground">Organisation name</Text><TextInput accessibilityLabel="Organisation name" value={draft.organizationName} onChangeText={organizationName => update({organizationName})} placeholder="e.g. Kala Collective" placeholderTextColor={Colors.muted} className="h-[46px] rounded-[13px] border border-border bg-card px-3 text-[14px] text-foreground" /></View>
          </View>
          <Text className="mb-2 text-[12px] font-bold text-foreground">Organisation type</Text>
          <View className="mb-4 flex-row flex-wrap gap-2">{ORGANISATION_TYPES.map(option => <Pressable key={option.value} accessibilityRole="radio" accessibilityState={{selected: draft.organizationType === option.value}} onPress={() => update({organizationType: option.value})} className={`rounded-full border px-3 py-2 ${draft.organizationType === option.value ? 'border-primary bg-primary-dark' : 'border-border bg-card'}`}><Text className={`text-[12px] font-semibold ${draft.organizationType === option.value ? 'text-primary' : 'text-foreground'}`}>{option.label}</Text></Pressable>)}</View>
          <Field label="City" value={draft.city} onChangeText={city => update({city})} placeholder="Mumbai" />
          <Text className="mb-2 text-[12px] font-bold text-foreground">What kinds of events?</Text>
          <View className="mb-3 flex-row flex-wrap gap-2">{EVENT_KINDS.map(kind => {const selected = draft.eventKinds.includes(kind); return <Pressable key={kind} accessibilityRole="checkbox" accessibilityState={{checked: selected}} onPress={() => update({eventKinds: selected ? draft.eventKinds.filter(item => item !== kind) : [...draft.eventKinds, kind]})} className={`rounded-full border px-3 py-2 ${selected ? 'border-primary bg-primary-dark' : 'border-border bg-card'}`}><Text className={`text-[12px] font-semibold ${selected ? 'text-primary' : 'text-foreground'}`}>{kind}</Text></Pressable>;})}</View>
        </>}
        {step === 1 && <>
          <Text className="mb-2 text-[12px] font-bold text-foreground">Document type</Text>
          {DOCUMENTS.map(document => <Choice key={document.value} label={document.label} selected={draft.verificationType === document.value} onPress={() => update({verificationType: document.value})} />)}
          <Text className="mb-2 mt-3 text-[12px] font-bold text-foreground">Your file</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Upload a photo of your document" onPress={() => chooseImage('document')} className="min-h-[74px] flex-row items-center rounded-[14px] border border-border bg-card p-3">
            <View className="mr-3 h-10 w-10 items-center justify-center rounded-xl bg-primary-dark"><IconUpload size={19} color={Colors.primary} /></View>
            <View className="flex-1"><Text className="text-[13px] font-bold text-foreground">{documentFile?.name ?? (draft.verificationFileUrl ? 'Document uploaded' : 'Choose document photo')}</Text><Text className="mt-1 text-[11px] text-muted">JPG or PNG · up to 10 MB</Text></View>
            <Text className="text-[12px] font-semibold text-primary">{draft.verificationFileUrl ? 'Replace' : 'Upload'}</Text>
          </Pressable>
          <Info text="We review documents within 2 working days. Free events can go live while you wait." />
        </>}
        {step === 2 && <>
          {!!draft.workspaceId && <View className="mb-4"><PayoutStatusBadge account={payoutAccount} /></View>}
          <Field label="Account holder name" value={draft.accountHolder} onChangeText={accountHolder => update({accountHolder})} placeholder="As shown on bank account" />
          <Field label="Account number" value={draft.accountNumber} onChangeText={accountNumber => update({accountNumber: accountNumber.replace(/\D/g, '').slice(0, 18)})} keyboardType="number-pad" placeholder="Enter account number" />
          <Field label="IFSC code" value={draft.ifsc} onChangeText={ifsc => update({ifsc})} placeholder="e.g. HDFC0001234" maxLength={11} autoCapitalize="characters" autoCorrect={false} />
          <Text className="mb-2 text-[12px] font-bold text-foreground">When should we pay you?</Text>
          <View className="mb-4 flex-row rounded-[14px] border border-border bg-card p-1">{([['AFTER_EACH_EVENT', 'After each event'], ['EVERY_MONDAY', 'Every Monday']] as const).map(([value, label]) => <Pressable key={value} accessibilityRole="radio" accessibilityState={{selected: draft.payoutSchedule === value}} onPress={() => update({payoutSchedule: value})} className={`flex-1 items-center rounded-[11px] py-3 ${draft.payoutSchedule === value ? 'bg-gold' : ''}`}><Text className={`text-[12px] font-semibold ${draft.payoutSchedule === value ? 'text-gold-ink' : 'text-foreground'}`}>{label}</Text></Pressable>)}</View>
          <Text className="text-[11px] leading-4 text-muted">Payouts start after the event ends and the payment clears.</Text>
        </>}
        {step === 3 && <>
          {hostMode && workspaces.length > 1 && <>
            <Text className="mb-2 text-[12px] font-bold text-foreground">Organisation</Text>
            {workspaces.map(workspace => <Choice key={workspace.id} label={workspace.name} selected={draft.workspaceId === workspace.id} onPress={() => update({workspaceId: workspace.id, organizationName: workspace.name})} />)}
          </>}
          <Text className="mb-2 text-[12px] font-bold text-foreground">Event photo</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Upload event cover photo" onPress={() => chooseImage('event')} className="mb-4 h-[128px] items-center justify-center overflow-hidden rounded-[16px] border border-dashed border-border bg-card">
            {draft.eventCoverUrl ? <RemoteImage uri={draft.eventCoverUrl} className="h-full w-full" resizeMode="cover" /> : <View className="items-center"><IconUpload size={22} color={Colors.primary} /><Text className="mt-2 text-[12px] font-semibold text-primary">{eventFile?.name ?? 'Add a cover photo'}</Text><Text className="mt-1 text-[11px] text-muted">A clear photo helps your event stand out</Text></View>}
          </Pressable>
          <Field label="Event name" value={draft.eventName} onChangeText={eventName => update({eventName})} placeholder="Monsoon Sessions, Bandra" />
          <View className="mb-4">
            <Text className="mb-1.5 text-[12px] font-bold text-foreground">About the event</Text>
            <TextInput accessibilityLabel="Event description" value={draft.eventDescription} onChangeText={eventDescription => update({eventDescription})} placeholder="What should attendees know?" placeholderTextColor={Colors.muted} multiline textAlignVertical="top" className="min-h-[96px] rounded-[14px] border border-border bg-card px-3.5 py-3 text-[14px] text-foreground" />
          </View>
          <View className="flex-row gap-3"><View className="mb-4 flex-1"><Text className="mb-1.5 text-[12px] font-bold text-foreground">Date</Text><Pressable accessibilityRole="button" onPress={() => openPicker('date')} className="h-[48px] justify-center rounded-[14px] border border-border bg-card px-3.5"><Text className={`text-[14px] ${draft.eventDate ? 'text-foreground' : 'text-muted'}`}>{draft.eventDate || 'Choose date'}</Text></Pressable></View><View className="mb-4 w-[112px]"><Text className="mb-1.5 text-[12px] font-bold text-foreground">Starts</Text><Pressable accessibilityRole="button" onPress={() => openPicker('time')} className="h-[48px] justify-center rounded-[14px] border border-border bg-card px-3.5"><Text className={`text-[14px] ${draft.eventTime ? 'text-foreground' : 'text-muted'}`}>{draft.eventTime || 'Choose time'}</Text></Pressable></View></View>
          {Platform.OS === 'ios' && picking && <DateTimePicker value={picking === 'date' && /^\d{4}-\d{2}-\d{2}$/.test(draft.eventDate) ? new Date(`${draft.eventDate}T12:00:00`) : picking === 'time' && /^\d{2}:\d{2}$/.test(draft.eventTime) ? new Date(`2020-01-01T${draft.eventTime}:00`) : new Date()} mode={picking} display="spinner" is24Hour onChange={(event, date) => {if (event.type === 'set' && date) update(picking === 'date' ? {eventDate: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`} : {eventTime: `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`}); if (event.type === 'dismissed') setPicking(null);}} />}
          <Field label="Venue" value={draft.venue} onChangeText={venue => update({venue})} placeholder="Bandra Studio, Bandra West" />
          <View className="mb-4 flex-row items-end gap-3"><View className="flex-1"><Text className="mb-1.5 text-[12px] font-bold text-foreground">Tickets</Text><View className="flex-row rounded-[13px] border border-border bg-card p-1">{(['FREE', 'PAID'] as const).map(value => {const locked = value === 'PAID' && !!paidLockMessage; return <Pressable key={value} accessibilityRole="radio" accessibilityState={{selected: draft.ticketType === value, disabled: locked}} disabled={locked} onPress={() => update({ticketType: value})} className={`flex-1 items-center rounded-[10px] py-3 ${draft.ticketType === value ? 'bg-gold' : ''} ${locked ? 'opacity-50' : ''}`}><Text className={`text-[12px] font-bold ${draft.ticketType === value ? 'text-gold-ink' : 'text-foreground'}`}>{value === 'FREE' ? 'Free' : 'Paid'}</Text></Pressable>;})}</View></View><View className="w-[112px]"><Field label="Capacity" value={draft.capacity} onChangeText={capacity => update({capacity: capacity.replace(/\D/g, '').slice(0, 6)})} keyboardType="number-pad" /></View></View>
          {paidLockMessage ? <Info text={paidLockMessage} /> : draft.ticketType === 'PAID' && <Info text="Paid tickets unlock after your organisation is verified. This event will be saved as a draft." />}
        </>}
        {!!error && <Text accessibilityRole="alert" className="mb-3 text-[12px] font-semibold text-coral">{error}</Text>}
      </ScrollView>
      <View className="px-5 pb-2 pt-2">
        <Pressable accessibilityRole="button" disabled={!canContinue || loading} onPress={continueStep} className={`h-[50px] items-center justify-center rounded-[13px] ${canContinue && !loading ? 'bg-gold' : 'bg-gold/45'}`}>
          {loading ? <ActivityIndicator color={Colors.goldInk} /> : <Text className="text-[13px] font-extrabold text-gold-ink">{step === 1 && !draft.verificationFileUrl ? 'Upload document to continue' : step === 3 ? 'Create event draft' : ['Continue', 'Submit for review', 'Save and continue', 'Save event'][step]}</Text>}
        </Pressable>
        <Pressable accessibilityRole="button" onPress={finishLater} className="items-center py-3"><Text className="text-[12px] font-semibold text-primary">{step < 3 ? 'Save and finish later' : 'Save progress'}</Text></Pressable>
      </View>
    </>}
    </SafeAreaView>
  </Modal>;
};

const PrimaryButton = ({label, onPress}: {label: string; onPress: () => void}) => <Pressable accessibilityRole="button" onPress={onPress} className="mt-8 h-[50px] items-center justify-center rounded-[13px] bg-gold"><Text className="text-[13px] font-extrabold text-gold-ink">{label}</Text></Pressable>;
const Info = ({text}: {text: string}) => <View className="mt-4 rounded-[13px] bg-primary-dark px-3.5 py-3"><Text className="text-[11px] leading-4 text-text-body">{text}</Text></View>;

export default OrganizerOnboardingScreen;
