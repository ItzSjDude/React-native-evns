import React, {useState} from 'react';
import {Pressable, Text, TextInput, View} from 'react-native';
import IconLock from '@tabler/icons-react-native/IconLock';
import BottomSheet, {SheetButton} from '../../components/BottomSheet';
import {Colors} from '../../Constants/Colors';
import {openPaywall, refreshSubscription, usePlus} from '../plus';
import {getDeviceLocation} from './deviceLocation';
import {nearbyErrorMessage} from './nearbyErrors';
import {createVibeNote} from './vibeNoteService';

export const VIBE_NOTE_MAX_LENGTH = 280;
const DURATIONS = [
  {minutes: 30, label: '30m'},
  {minutes: 60, label: '1h'},
  {minutes: 240, label: '4h'},
  {minutes: 720, label: '12h'},
  {minutes: 1440, label: '24h'},
];
/** The server's ceiling when Plus is off and no limits are reported. */
const NO_LIMIT_MINUTES = 1440;

type Props = {visible: boolean; onClose: () => void; onPosted: () => void};

export default function VibeNoteComposer({visible, onClose, onPosted}: Props) {
  const {subscription, enabled, isPlus} = usePlus();
  const [text, setText] = useState('');
  const [selected, setSelected] = useState(60);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const limits = subscription?.limits;
  const usage = subscription?.usage;
  const maxMinutes = limits?.vibeNoteMaxMinutes ?? NO_LIMIT_MINUTES;
  // Longer chips stay visible, locked, only when Plus would actually unlock them.
  const showLocked = enabled && !isPlus;
  const minutes = Math.min(selected, maxMinutes);
  const body = text.trim();

  const submit = async () => {
    if (busy || !body) return;
    setBusy(true);
    setError(null);
    try {
      const coordinates = await getDeviceLocation(true);
      if (!coordinates) { setError('Allow location access to post a vibe note.'); return; }
      await createVibeNote({body, lat: coordinates.lat, lng: coordinates.lng, expiresInMinutes: minutes});
      setText('');
      onPosted();
      refreshSubscription().catch(() => {});
      onClose();
    } catch (cause) {
      // A LIMIT_REACHED has already opened the paywall (PlusProvider); keep the draft and say why.
      setError(nearbyErrorMessage(cause));
      refreshSubscription().catch(() => {});
    } finally {
      setBusy(false);
    }
  };

  return <BottomSheet visible={visible} onClose={onClose} dismissible={!busy} title="Post a vibe" subtitle="Anyone close to where you post can read it."
    footer={<SheetButton label={busy ? 'Posting…' : 'Post'} busy={busy} disabled={!body} onPress={submit} />}>
    <TextInput accessibilityLabel="Vibe note" value={text} onChangeText={setText} maxLength={VIBE_NOTE_MAX_LENGTH} multiline editable={!busy}
      placeholder="What's the vibe here?" placeholderTextColor={Colors.muted} textAlignVertical="top"
      className="min-h-[110px] rounded-[14px] border border-border bg-card px-4 py-3 text-[15px] text-foreground" />
    <Text className="mt-1 text-right text-xs text-muted">{text.length}/{VIBE_NOTE_MAX_LENGTH}</Text>

    <Text className="mb-2 mt-3 text-sm font-semibold text-foreground">Stays up for</Text>
    <View accessibilityRole="radiogroup" className="flex-row flex-wrap gap-2">
      {DURATIONS.filter(option => option.minutes <= maxMinutes || showLocked).map(option => {
        const locked = option.minutes > maxMinutes;
        const active = !locked && option.minutes === minutes;
        return <Pressable key={option.minutes} accessibilityRole="radio" accessibilityLabel={locked ? `${option.label}, Plus only` : option.label}
          accessibilityState={{checked: active}} disabled={busy}
          onPress={() => (locked ? openPaywall('vibeNoteLifetime') : setSelected(option.minutes))}
          className={`h-9 min-w-[64px] flex-row items-center justify-center gap-1 rounded-full px-4 active:opacity-70 ${active ? 'bg-gold' : 'bg-card'}`}>
          {locked && <IconLock size={13} color={Colors.muted} />}
          <Text className={`text-[13px] font-semibold ${active ? 'text-text-dark' : 'text-muted'}`}>{option.label}</Text>
        </Pressable>;
      })}
    </View>

    {!!limits && !!usage && <Text className="mt-4 text-[13px] text-muted">{usage.vibeNotesToday} of {limits.vibeNotesPerDay} posted today</Text>}
    {!!error && <Text accessibilityRole="alert" className="mt-3 text-[13px] font-semibold text-coral">{error}</Text>}
  </BottomSheet>;
}
