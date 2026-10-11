import React, {useEffect, useState} from 'react';
import {ActivityIndicator, Pressable, Text, TextInput, View} from 'react-native';
import {Colors} from '../../Constants/Colors';
import {configurePaidRoom, getPaidRoomProduct, getPaidRoomsEnabled} from './paidRoomService';
import {PAID_ROOM_TERMS} from './terms';
import type {PaidRoomProduct} from './types';

/**
 * Host-only "Paid access" block for the room edit sheet. Hidden unless `/monetization` says paid rooms are enabled.
 * The host enters the Google Play one-time product id; the backend has no "clear" call, so this only sets or replaces it.
 */
export default function PaidAccessSection({partyId}: {partyId: string}) {
  const [enabled, setEnabled] = useState(false);
  const [product, setProduct] = useState<PaidRoomProduct | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{error: boolean; text: string} | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      if (!(await getPaidRoomsEnabled(partyId, controller.signal))) return;
      const current = await getPaidRoomProduct(partyId, controller.signal).catch(() => null);
      if (controller.signal.aborted) return;
      setProduct(current);
      setDraft(current?.productId ?? '');
      setEnabled(true);
    })();
    return () => controller.abort();
  }, [partyId]);

  if (!enabled) return null;
  const id = draft.trim();
  const save = async () => {
    if (busy || !id) return;
    setBusy(true); setNotice(null);
    try {
      const saved = await configurePaidRoom(partyId, id);
      setProduct({partyId, productId: saved.productId, currency: saved.currency, hasAccess: true});
      setDraft(saved.productId);
      setNotice({error: false, text: 'Paid access is on. New public joiners must buy it first.'});
    } catch (error) {
      setNotice({error: true, text: (error as {message?: string})?.message || 'Couldn’t save paid access. Please try again.'});
    } finally {setBusy(false);}
  };

  return <View className="mt-4 rounded-2xl bg-card p-4">
    <Text accessibilityRole="header" className="text-[15px] font-semibold text-foreground">Paid access</Text>
    <Text className="mt-1 text-[13px] leading-5 text-muted">{product ? `On · Play product ${product.productId}` : 'Off · anyone allowed can join for free.'}</Text>
    {PAID_ROOM_TERMS.map(line => <Text key={line} className="mt-2 text-[12px] leading-[18px] text-muted">{'• '}{line}</Text>)}
    <Text className="mt-2 text-[12px] leading-[18px] text-muted">• You and anyone you invited keep free access. Paid access can be changed to another product here but not removed yet.</Text>
    <TextInput accessibilityLabel="Google Play product id" value={draft} onChangeText={setDraft} autoCapitalize="none" autoCorrect={false} maxLength={200}
      placeholder="Google Play product id" placeholderTextColor={Colors.muted} className="mt-3 min-h-12 rounded-xl border border-border bg-background px-4 text-base text-foreground" />
    <Pressable accessibilityRole="button" accessibilityLabel={product ? 'Update paid access' : 'Enable paid access'} accessibilityState={{disabled: busy || !id, busy}}
      disabled={busy || !id || id === product?.productId} onPress={save} className="mt-3 h-11 items-center justify-center rounded-[18px] bg-gold active:opacity-80">
      {busy ? <ActivityIndicator /> : <Text className="text-[14px] font-bold text-text-dark">{product ? 'Update paid access' : 'Enable paid access'}</Text>}
    </Pressable>
    {!!notice && <Text accessibilityRole={notice.error ? 'alert' : undefined} className={`mt-2 text-[12px] font-semibold ${notice.error ? 'text-coral' : 'text-purple-soft'}`}>{notice.text}</Text>}
  </View>;
}
