import React, {useEffect, useMemo, useRef, useState} from 'react';
import {ActivityIndicator, Pressable, ScrollView, Text, View} from 'react-native';
import {isBillingError, loadOneTimePrice, purchaseOneTime, restoreOneTime, type OneTimeProduct} from '../plus';
import {getPaidRoomProduct, verifyPaidRoomPurchase} from './paidRoomService';
import {PAID_ROOM_MESSAGES, PAID_ROOM_TERMS} from './terms';
import type {PaidRoomProduct} from './types';

type Notice = {error: boolean; text: string};

const errorText = (error: unknown) => isBillingError(error) ? error.message : (error as {message?: string})?.message || 'Something went wrong. Please try again.';

/**
 * Purchase gate for a room whose join was refused with "purchase access". Entitlement is server state: the local Play
 * callback never unlocks anything. After the backend confirms the token the product is refetched and only then
 * `onEntitled` (which re-runs the normal join) fires. A shared link never reaches here by itself: the join 403 does.
 */
export default function PaidRoomGate({partyId, onEntitled, onClose}: {partyId: string; onEntitled: () => void; onClose: () => void}) {
  const [product, setProduct] = useState<PaidRoomProduct | null>(null);
  const [loading, setLoading] = useState(true);
  const [price, setPrice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const entitled = useRef(onEntitled); entitled.current = onEntitled;

  const productId = product?.productId;
  const oneTime = useMemo<OneTimeProduct>(() => ({
    messages: PAID_ROOM_MESSAGES,
    verify: async (id, token) => {
      const result = await verifyPaidRoomPurchase(partyId, id, token);
      if (!result.hasAccess) throw {status: 400, message: PAID_ROOM_MESSAGES.invalid};
    },
  }), [partyId]);

  useEffect(() => {
    let mounted = true;
    getPaidRoomProduct(partyId).then(next => {
      if (!mounted) return;
      setProduct(next);
      if (next?.hasAccess) entitled.current();
    }).catch(error => {if (mounted) setNotice({error: true, text: errorText(error)});}).finally(() => {if (mounted) setLoading(false);});
    return () => {mounted = false;};
  }, [partyId]);

  useEffect(() => {
    if (!productId) return;
    let mounted = true;
    loadOneTimePrice(productId, oneTime).then(next => {if (mounted) setPrice(next);})
      .catch(error => {if (mounted) setNotice({error: true, text: errorText(error)});});
    return () => {mounted = false;};
  }, [productId, oneTime]);

  /** After the backend accepted the purchase: ask it again who has access; never trust the local result. */
  const confirm = async () => {
    const fresh = await getPaidRoomProduct(partyId);
    setProduct(fresh);
    if (fresh?.hasAccess) entitled.current();
    else setNotice({error: true, text: 'Your access isn’t active yet. Please try again in a moment.'});
  };

  const run = async (task: () => Promise<void>) => {
    if (busy) return;
    setBusy(true); setNotice(null);
    try {await task();}
    catch (error) {setNotice({error: true, text: errorText(error)});}
    finally {setBusy(false);}
  };

  const buy = () => run(async () => {
    const outcome = await purchaseOneTime(productId!, oneTime);
    if (outcome.status === 'pending') {setNotice({error: false, text: PAID_ROOM_MESSAGES.pending}); return;}
    await confirm();
  });
  const restore = () => run(async () => {
    await restoreOneTime(productId!, oneTime);
    await confirm();
  });

  const ready = !!product && !product.hasAccess;
  return <View className="absolute bottom-0 left-0 right-0 top-0 bg-background">
    <ScrollView contentContainerClassName="px-5 pb-10 pt-6">
      <Text accessibilityRole="header" className="text-[24px] font-bold text-foreground">This is a paid room</Text>
      <Text className="mt-2 text-[15px] leading-6 text-muted">Buy access once to join. Hosts and people the host invited don’t need to buy.</Text>
      {loading ? <ActivityIndicator className="mt-6" /> : !product && !notice && <Text className="mt-6 text-[14px] text-muted">{PAID_ROOM_MESSAGES.disabled}</Text>}
      <View className="mt-5 rounded-[20px] bg-card p-4">
        <Text className="text-[13px] font-semibold text-foreground">Before you buy</Text>
        {PAID_ROOM_TERMS.map(line => <Text key={line} className="mt-2 text-[13px] leading-5 text-muted">{'• '}{line}</Text>)}
      </View>
      {!!notice && <Text accessibilityRole={notice.error ? 'alert' : undefined} accessibilityLiveRegion="polite"
        className={`mt-4 text-center text-[14px] leading-5 ${notice.error ? 'text-coral' : 'text-foreground'}`}>{notice.text}</Text>}
      <Pressable accessibilityRole="button" accessibilityLabel={price ? `Buy access, ${price}` : 'Buy access'} accessibilityState={{disabled: !ready || !price || busy, busy}}
        disabled={!ready || !price || busy} onPress={buy}
        className={`mt-5 h-12 items-center justify-center rounded-[18px] ${ready && price ? 'bg-gold active:opacity-80' : 'bg-card'}`}>
        {busy ? <ActivityIndicator /> : <Text className={`text-[15px] font-bold ${ready && price ? 'text-text-dark' : 'text-muted'}`}>{price ? `Buy access · ${price}` : ready ? 'Price unavailable' : 'Buy access'}</Text>}
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Restore purchase" disabled={!ready || busy} onPress={restore} className="mt-2 h-11 items-center justify-center active:opacity-70">
        <Text className="text-[14px] font-semibold text-purple-soft">Restore purchase</Text>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} className="h-11 items-center justify-center active:opacity-70">
        <Text className="text-[14px] text-muted">Not now</Text>
      </Pressable>
    </ScrollView>
  </View>;
}
