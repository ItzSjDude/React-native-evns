import React, {useCallback, useEffect, useRef, useState} from 'react';
import {ActivityIndicator, Pressable, ScrollView, Text, TextInput, View} from 'react-native';
import {showDialog} from '../../components/Dialog';
import {Colors} from '../../Constants/Colors';
import type {ApiPaymentCard, OrganizerActionsContext} from '../messages';
import {cancelPaymentCard, confirmPaymentCard, getOrganizerEventPrice, sharePaymentDetails, shareTicket} from './organizerService';
import {money} from './organizerPresentation';
import {buildSharePaymentBody, emptyShareForm, issuableCardOf, openCardOf, PAYMENT_METHODS, salesFailure, type SalesFailure} from './sales';
import type {OrganizerEventPrice, SalesThread, SharePaymentForm} from './types';

type Props = OrganizerActionsContext & {
  workspaceId: string;
  thread: SalesThread;
  /** Opens the credits screen after a 402. */
  onBuyCredits: () => void;
};

const FORM_SCROLL = {maxHeight: 260};

const Button = ({label, onPress, disabled = false, primary = false}: {label: string; onPress: () => void; disabled?: boolean; primary?: boolean}) => (
  <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{disabled}} disabled={disabled} onPress={onPress}
    className={`h-10 flex-1 items-center justify-center rounded-full px-3 ${primary ? 'bg-gold' : 'border border-border'} ${disabled ? 'opacity-40' : 'active:opacity-70'}`}>
    <Text className={`text-[13px] font-bold ${primary ? 'text-gold-ink' : 'text-foreground'}`}>{label}</Text>
  </Pressable>
);

const Field = ({label, value, onChangeText, ...rest}: {label: string; value: string; onChangeText: (value: string) => void; autoCapitalize?: 'none' | 'characters'; keyboardType?: 'default' | 'number-pad'}) => (
  <TextInput accessibilityLabel={label} placeholder={label} placeholderTextColor={Colors.muted} value={value} onChangeText={onChangeText}
    autoCorrect={false} className="h-10 rounded-[12px] border border-border bg-background px-3 text-[14px] text-foreground" {...rest} />
);

/**
 * Organiser actions above the composer of a sales thread: share payment details, then Confirm / Cancel / Share ticket per card state.
 * Card data lives in component state only. Nothing here is logged or stored.
 */
export default function SalesActionBar({workspaceId, thread, cards, eventId, onCard, refresh, onBuyCredits}: Props) {
  const [price, setPrice] = useState<OrganizerEventPrice | null | undefined>(undefined);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<SharePaymentForm>(emptyShareForm);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<SalesFailure | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const busyRef = useRef(false);

  const headline = eventId ?? thread.eventId;
  const mismatch = !!eventId && !!thread.eventId && eventId !== thread.eventId;

  useEffect(() => {
    let live = true;
    setPrice(undefined);
    if (!headline || mismatch) return;
    getOrganizerEventPrice(workspaceId, headline).then(result => { if (live) setPrice(result); }).catch(() => { if (live) setPrice(null); });
    return () => { live = false; };
  }, [headline, mismatch, workspaceId]);

  const open = openCardOf(cards);
  const issuable = issuableCardOf(cards);
  const free = price?.isPaid === false;
  const canIssue = !mismatch && (!!issuable || free);

  const run = useCallback(async (action: () => Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setFailure(null); setNotice(null);
    try { await action(); }
    catch (cause) {
      const mapped = salesFailure(cause);
      setFailure(mapped);
      if ((cause as {status?: number} | null)?.status === 409) refresh();
    } finally { busyRef.current = false; setBusy(false); }
  }, [refresh]);

  const submitShare = () => run(async () => {
    if (!price) throw new Error('The ticket price is still loading.');
    const card = await sharePaymentDetails(thread.id, buildSharePaymentBody(form, price));
    if (card?.id) onCard(card); else refresh();
    setForm(emptyShareForm()); setFormOpen(false); setNotice('Payment details shared.');
  });

  const confirm = (card: ApiPaymentCard) => run(async () => { onCard(await confirmPaymentCard(card.id)); setNotice('Payment confirmed.'); });

  const cancel = (card: ApiPaymentCard) => showDialog('Cancel this payment request?', 'The buyer will no longer be able to pay against it.', [
    {text: 'Keep', style: 'cancel'},
    {text: 'Cancel request', style: 'destructive', onPress: () => { run(async () => { onCard(await cancelPaymentCard(card.id)); setNotice('Payment request cancelled.'); }); }},
  ]);

  const issue = () => showDialog(`Issue a ticket for ${thread.eventTitle}?`, `${thread.buyerName} will receive a ticket for this event. This uses one ticket credit.`, [
    {text: 'Not yet', style: 'cancel'},
    {text: 'Issue ticket', onPress: () => { run(async () => { await shareTicket(thread.id, issuable ? {paymentCardId: issuable.id} : {}); refresh(); setNotice('Ticket shared.'); }); }},
  ]);

  const set = (patch: Partial<SharePaymentForm>) => setForm(current => ({...current, ...patch}));

  return <View testID="sales-action-bar" className="border-t border-border bg-card px-4 py-3">
    <Text numberOfLines={1} className="text-[12px] text-muted">Selling for <Text className="font-bold text-foreground">{thread.eventTitle}</Text>{price ? ` · ${price.isPaid ? money(price.priceMinor, price.currency) : 'Free'}` : ''}</Text>
    {mismatch && <Text accessibilityRole="alert" className="mt-1 text-[12px] text-coral">This conversation now covers a different event. Go back and reopen it before sharing or issuing.</Text>}
    {price === null && !mismatch && <Text className="mt-1 text-[12px] text-muted">The ticket price could not be loaded, so payment requests are unavailable.</Text>}

    {formOpen && <ScrollView style={FORM_SCROLL} keyboardShouldPersistTaps="handled" className="mt-2" contentContainerClassName="gap-2 pb-1">
      <View className="flex-row gap-2">{PAYMENT_METHODS.map(item => <Pressable key={item.value} accessibilityRole="tab" accessibilityState={{selected: form.method === item.value}} onPress={() => set({method: item.value})}
        className={`h-9 flex-1 items-center justify-center rounded-full ${form.method === item.value ? 'bg-gold' : 'border border-border'}`}><Text className={`text-[12px] font-bold ${form.method === item.value ? 'text-gold-ink' : 'text-foreground'}`}>{item.label}</Text></Pressable>)}</View>
      {price && <Text className="text-[13px] text-foreground">Amount: <Text className="font-bold">{money(price.priceMinor, price.currency)}</Text> (from the event price)</Text>}
      <Field label="Payee name (optional)" value={form.payeeName} onChangeText={payeeName => set({payeeName})} />
      {form.method === 'UPI' && <Field label="UPI ID" value={form.upiId} onChangeText={upiId => set({upiId})} autoCapitalize="none" />}
      {form.method === 'BANK' && <>
        <Field label="Account number" value={form.accountNumber} onChangeText={accountNumber => set({accountNumber})} keyboardType="number-pad" />
        <Field label="IFSC" value={form.ifsc} onChangeText={ifsc => set({ifsc})} autoCapitalize="characters" />
      </>}
      {form.method === 'LINK' && <Field label="Payment link (https)" value={form.paymentLink} onChangeText={paymentLink => set({paymentLink})} autoCapitalize="none" />}
      <Field label="Note (optional)" value={form.note} onChangeText={note => set({note})} />
      <View className="flex-row gap-2"><Button label="Close" onPress={() => { setFormOpen(false); setForm(emptyShareForm()); }} /><Button primary label="Send payment details" disabled={busy || !price || !price.isPaid} onPress={submitShare} /></View>
    </ScrollView>}

    {!formOpen && <View className="mt-2 flex-row gap-2">
      {!open && <Button label="Share payment details" disabled={busy || mismatch || !price || !price.isPaid} onPress={() => { setFormOpen(true); setNotice(null); }} />}
      {!!open && <Button label="Confirm payment" primary disabled={busy || mismatch} onPress={() => { confirm(open); }} />}
      {!!open && <Button label="Cancel request" disabled={busy || mismatch} onPress={() => cancel(open)} />}
      <Button label="Share ticket" primary={!open} disabled={busy || !canIssue} onPress={issue} />
    </View>}

    {busy && <ActivityIndicator accessibilityLabel="Working" className="mt-2" color={Colors.gold} />}
    {!!failure && <View className="mt-2"><Text accessibilityRole="alert" className="text-[13px] text-coral">{failure.message}</Text>
      {failure.needsCredits && <Pressable accessibilityRole="button" accessibilityLabel="Buy ticket credits" onPress={onBuyCredits} className="mt-1 self-start rounded-full bg-gold px-3 py-1.5"><Text className="text-[12px] font-bold text-gold-ink">Buy ticket credits</Text></Pressable>}</View>}
    {!!notice && !failure && <Text accessibilityRole="alert" className="mt-2 text-[13px] text-foreground">{notice}</Text>}
  </View>;
}
