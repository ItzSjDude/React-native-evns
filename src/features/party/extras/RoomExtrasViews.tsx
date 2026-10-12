import React, {useEffect, useState} from 'react';
import {ActivityIndicator, Pressable, Text, TextInput, View} from 'react-native';
import IconChartBar from '@tabler/icons-react-native/IconChartBar';
import IconDice from '@tabler/icons-react-native/IconDice5';
import IconGift from '@tabler/icons-react-native/IconGift';
import IconCheck from '@tabler/icons-react-native/IconCheck';
import IconPlus from '@tabler/icons-react-native/IconPlus';
import IconX from '@tabler/icons-react-native/IconX';
import {SheetSection} from '../../../components/BottomSheet';
import {PartyColors} from '../partyPresentation';
import type {PartyParticipant} from '../partyService';
import {isBillingError, loadOneTimePrices, purchaseOneTime, restoreOneTime, type OneTimeProduct} from '../../plus';
import {
  advancePartyGame, cancelPartyGiftReservation, createPartyPoll, endPartyGame, errorMessage, errorStatus,
  listPartyGiftCatalog, pollTotal, purchasePartyGift, reservePartyGift, spinPartyGame, startPartyGame, votePartyPoll,
  type PartyGame, type PartyGameType, type PartyGiftProduct, type PartyGiftReservation, type PartyPoll,
} from './extrasService';
import {clearPendingGiftPurchase, getPendingGiftPurchase, savePendingGiftPurchase} from './pendingGiftPurchase';
import type {RoomExtras} from './useRoomExtras';

type ViewProps = {partyId: string; manager: boolean; identity: string; participants: PartyParticipant[]; extras: RoomExtras};

export const GoldButton = ({label, onPress, busy, disabled, ghost}: {label: string; onPress: () => void; busy?: boolean; disabled?: boolean; ghost?: boolean}) => {
  const off = busy || disabled;
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{disabled: !!off, busy: !!busy}} disabled={off} onPress={onPress}
    className={`my-1 min-h-[48px] items-center justify-center rounded-full px-5 active:opacity-80 ${ghost ? 'bg-card' : 'bg-gold'} ${off ? 'opacity-50' : ''}`}>
    <Text className={`text-[15px] font-bold ${ghost ? 'text-foreground' : 'text-gold-ink'}`}>{busy ? 'Working…' : label}</Text>
  </Pressable>;
};

const ErrorNote = ({message}: {message: string | null}) => message
  ? <View className="mb-3 rounded-xl bg-coral/10 px-3 py-2"><Text accessibilityRole="alert" className="text-[13px] text-coral">{message}</Text></View> : null;

const Empty = ({icon: Icon, title, body}: {icon: typeof IconGift; title: string; body: string}) =>
  <View className="items-center py-8">
    <View className="mb-3 h-16 w-16 items-center justify-center rounded-full bg-primary-dark"><Icon size={28} color={PartyColors.accent} /></View>
    <Text className="text-[16px] font-semibold text-foreground">{title}</Text>
    <Text className="mt-1 text-center text-[13px] leading-5 text-muted">{body}</Text>
  </View>;

/** Runs an async action with shared busy/error state; 409/404 trigger a refresh so stale UI corrects itself. */
function useAction(refresh: () => Promise<void>) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (fn: () => Promise<void>, fallback: string) => {
    if (busy) return;
    setBusy(true); setError(null);
    try {await fn();} catch (e) {
      setError(errorMessage(e, fallback));
      if ([404, 409].includes(errorStatus(e))) refresh().catch(() => {});
    } finally {setBusy(false);}
  };
  return {busy, error, run};
}

/* ---------------------------------- Polls ---------------------------------- */

const PollCard = ({poll, busy, onVote}: {poll: PartyPoll; busy: boolean; onVote: (optionId: string) => void}) => {
  const total = pollTotal(poll);
  return <View accessibilityLabel={`Poll: ${poll.question}`} className="mb-3 rounded-2xl bg-card p-4">
    <View className="flex-row items-start gap-2">
      <Text className="flex-1 text-[16px] font-bold leading-6 text-foreground">{poll.question}</Text>
      {poll.closed && <Text className="overflow-hidden rounded-full bg-background px-2 py-0.5 text-[11px] font-semibold text-muted">Closed</Text>}
    </View>
    <View className="mt-3 gap-2">
      {poll.options.map(option => {
        const pct = total ? Math.round(option.votes / total * 100) : 0;
        const picked = poll.selectedOptionId === option.id;
        return <Pressable key={option.id} accessibilityRole="button" accessibilityLabel={`Vote ${option.label}`}
          accessibilityState={{disabled: poll.closed || busy, selected: picked}} disabled={poll.closed || busy} onPress={() => onVote(option.id)}
          className={`min-h-[46px] overflow-hidden rounded-xl border active:opacity-80 ${picked ? 'border-gold' : 'border-border'} bg-background`}>
          <View testID={`bar-${option.id}`} style={{width: `${pct}%`}} className={`absolute inset-y-0 left-0 ${picked ? 'bg-gold-bg' : 'bg-primary-dark'}`} />
          <View className="min-h-[46px] flex-row items-center gap-2 px-3">
            {picked && <IconCheck size={16} color={PartyColors.accent} />}
            <Text numberOfLines={2} className="flex-1 text-[14px] font-semibold text-foreground">{option.label}</Text>
            <Text className="text-[13px] font-bold text-muted">{pct}%</Text>
          </View>
        </Pressable>;
      })}
    </View>
    <Text className="mt-2.5 text-xs text-muted">{total} {total === 1 ? 'vote' : 'votes'}{poll.closed ? ' · Final results' : poll.selectedOptionId ? ' · Tap another option to change your vote' : ''}</Text>
  </View>;
};

const PollComposer = ({busy, onSubmit, onCancel}: {busy: boolean; onSubmit: (question: string, options: string[]) => void; onCancel: () => void}) => {
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);
  const cleaned = options.map(o => o.trim()).filter(Boolean);
  const valid = !!question.trim() && cleaned.length >= 2;
  return <View className="mb-3 rounded-2xl bg-card p-4">
    <Text className="mb-2 text-[13px] font-semibold text-muted">Question</Text>
    <TextInput accessibilityLabel="Poll question" value={question} onChangeText={setQuestion} maxLength={300} placeholder="What should we play next?" placeholderTextColor={PartyColors.muted}
      className="mb-3 min-h-12 rounded-xl border border-border bg-background px-4 text-base text-foreground" />
    <Text className="mb-2 text-[13px] font-semibold text-muted">Options (2 to 4)</Text>
    {options.map((value, i) => <View key={i} className="mb-2 flex-row items-center gap-2">
      <TextInput accessibilityLabel={`Poll option ${i + 1}`} value={value} onChangeText={text => setOptions(current => current.map((o, j) => j === i ? text : o))} maxLength={80} placeholder={`Option ${i + 1}`} placeholderTextColor={PartyColors.muted}
        className="min-h-12 flex-1 rounded-xl border border-border bg-background px-4 text-base text-foreground" />
      {options.length > 2 && <Pressable accessibilityRole="button" accessibilityLabel={`Remove option ${i + 1}`} onPress={() => setOptions(current => current.filter((_, j) => j !== i))} className="h-10 w-10 items-center justify-center rounded-full bg-background active:opacity-70"><IconX size={16} color={PartyColors.muted} /></Pressable>}
    </View>)}
    {options.length < 4 && <Pressable accessibilityRole="button" accessibilityLabel="Add option" onPress={() => setOptions(current => [...current, ''])} className="mb-2 min-h-11 flex-row items-center gap-1.5 active:opacity-70">
      <IconPlus size={16} color={PartyColors.accent} /><Text className="text-[13px] font-semibold text-primary">Add option</Text></Pressable>}
    <GoldButton label="Start poll" busy={busy} disabled={!valid} onPress={() => onSubmit(question.trim(), cleaned)} />
    <GoldButton label="Cancel" ghost onPress={onCancel} />
  </View>;
};

export function PollsView({partyId, manager, extras}: ViewProps) {
  const {busy, error, run} = useAction(extras.refresh);
  const [composing, setComposing] = useState(false);
  const polls = extras.polls.data;
  return <>
    <ErrorNote message={error} />
    {composing && manager
      ? <PollComposer busy={busy} onCancel={() => setComposing(false)}
        onSubmit={(question, options) => run(async () => {extras.setPoll(await createPartyPoll(partyId, question, options)); setComposing(false);}, 'Couldn’t start the poll.')} />
      : manager && <GoldButton label="New poll" onPress={() => setComposing(true)} />}
    {polls.map(poll => <PollCard key={poll.id} poll={poll} busy={busy}
      onVote={optionId => run(async () => {extras.setPoll(await votePartyPoll(partyId, poll.id, optionId));}, 'Couldn’t record your vote.')} />)}
    {!polls.length && !composing && <Empty icon={IconChartBar} title="No polls yet" body={manager ? 'Ask the room a question with up to four options.' : 'When the host starts a poll, you can vote here.'} />}
    {extras.error && <Text className="pb-1 text-center text-xs text-muted">{extras.error}</Text>}
  </>;
}

/* ---------------------------------- Games ---------------------------------- */

const GAME_COPY: Record<PartyGameType, {title: string; body: string}> = {
  TRUTH_OR_DARE: {title: 'Truth or Dare', body: 'Each speaker takes a turn picking truth or dare.'},
  LUCKY_WHEEL: {title: 'Lucky Wheel', body: 'Spin to pick a random speaker on stage.'},
};
const seatName = (participants: PartyParticipant[], seat: number | null | undefined, identity: string) => {
  if (seat === null || seat === undefined) return null;
  const p = participants.find(x => x.active && x.seatIndex === seat);
  if (!p) return `Seat ${seat + 1}`;
  return p.userId === identity ? 'You' : p.name || `Seat ${seat + 1}`;
};

const GameBoard = ({game, participants, identity, manager, busy, onAdvance, onSpin, onEnd}: {
  game: PartyGame; participants: PartyParticipant[]; identity: string; manager: boolean; busy: boolean;
  onAdvance: (body?: {mode?: 'truth' | 'dare'}) => void; onSpin: () => void; onEnd: () => void;
}) => {
  const copy = GAME_COPY[game.type];
  const tod = game.type === 'TRUTH_OR_DARE' ? game.state : null;
  const wheel = game.type === 'LUCKY_WHEEL' ? game.state : null;
  const current = tod ? seatName(participants, tod.currentSeatIndex, identity) : null;
  const myTurn = !!tod && participants.find(p => p.userId === identity)?.seatIndex === tod.currentSeatIndex;
  const winner = wheel ? seatName(participants, wheel.result, identity) : null;
  return <View className="mb-3 rounded-2xl bg-card p-4">
    <View className="flex-row items-center gap-2">
      <View className="h-2 w-2 rounded-full bg-gold" /><Text className="text-[11px] font-semibold uppercase tracking-[0.8px] text-muted">Live game</Text>
    </View>
    <Text accessibilityRole="header" className="mt-1 text-[20px] font-bold text-foreground">{copy.title}</Text>
    {tod && <View className="mt-3 items-center rounded-xl bg-background px-3 py-4">
      <Text className="text-xs text-muted">{myTurn ? 'Your turn' : 'On the mic'}</Text>
      <Text className="mt-0.5 text-[22px] font-bold text-foreground">{current}</Text>
      {tod.mode && <Text className="mt-2 overflow-hidden rounded-full bg-gold-bg px-3 py-1 text-[13px] font-bold capitalize text-gold">{tod.mode}</Text>}
      {!!tod.prompt && <Text className="mt-2 text-center text-[14px] leading-5 text-foreground">{tod.prompt}</Text>}
      {!tod.mode && <Text className="mt-2 text-center text-[13px] text-muted">{myTurn || manager ? 'Pick truth or dare.' : 'Waiting for their pick…'}</Text>}
    </View>}
    {wheel && <View className="mt-3 items-center rounded-xl bg-background px-3 py-5">
      {wheel.spinning ? <Text accessibilityLiveRegion="polite" className="text-[18px] font-bold text-gold">Spinning…</Text>
        : winner ? <><Text className="text-xs text-muted">The wheel picked</Text><Text className="mt-0.5 text-[24px] font-bold text-foreground">{winner}</Text></>
          : <Text className="text-[13px] text-muted">{manager ? 'Spin the wheel to pick a speaker.' : 'Waiting for the host to spin…'}</Text>}
    </View>}
    <View className="mt-3">
      {tod && (myTurn || manager) && <>
        {!tod.mode && <View className="flex-row gap-2">
          <View className="flex-1"><GoldButton label="Truth" disabled={busy} onPress={() => onAdvance({mode: 'truth'})} /></View>
          <View className="flex-1"><GoldButton label="Dare" disabled={busy} onPress={() => onAdvance({mode: 'dare'})} /></View>
        </View>}
        <GoldButton label="Next player" ghost disabled={busy} onPress={() => onAdvance()} />
      </>}
      {wheel && manager && <GoldButton label={wheel.result === null ? 'Spin the wheel' : 'Spin again'} busy={busy || wheel.spinning} onPress={onSpin} />}
      {manager && <GoldButton label="End game" ghost disabled={busy} onPress={onEnd} />}
    </View>
  </View>;
};

export function GamesView({partyId, manager, identity, participants, extras}: ViewProps) {
  const {busy, error, run} = useAction(extras.refresh);
  const game = extras.game.data;
  const speakers = participants.filter(p => p.active && p.seatIndex !== null).length;
  return <>
    <ErrorNote message={error} />
    {game && <GameBoard game={game} participants={participants} identity={identity} manager={manager} busy={busy}
      onAdvance={body => run(async () => {extras.setGame(await advancePartyGame(partyId, game.id, body));}, 'Couldn’t update the game.')}
      onSpin={() => run(async () => {extras.setGame(await spinPartyGame(partyId, game.id));}, 'Couldn’t spin the wheel.')}
      onEnd={() => run(async () => {await endPartyGame(partyId, game.id); extras.setGame(null);}, 'Couldn’t end the game.')} />}
    {!game && !manager && <Empty icon={IconDice} title="No game running" body="When the host starts a mic game, it shows up here for everyone." />}
    {manager && <SheetSection label={game ? 'Switch game' : 'Start a game'}>
      {(Object.keys(GAME_COPY) as PartyGameType[]).map(type => <Pressable key={type} accessibilityRole="button" accessibilityLabel={`Start ${GAME_COPY[type].title}`}
        accessibilityState={{disabled: busy || !speakers}} disabled={busy || !speakers} onPress={() => run(async () => {extras.setGame(await startPartyGame(partyId, type));}, 'Couldn’t start the game.')}
        className={`min-h-[56px] justify-center border-b border-sheet px-4 py-2.5 active:bg-background/60 ${busy || !speakers ? 'opacity-50' : ''}`}>
        <Text className="text-[15px] font-semibold text-foreground">{GAME_COPY[type].title}</Text>
        <Text className="mt-0.5 text-xs text-muted">{GAME_COPY[type].body}</Text>
      </Pressable>)}
    </SheetSection>}
    {manager && !speakers && <Text className="pb-1 text-center text-xs text-muted">Games need at least one speaker on stage.</Text>}
    {extras.error && <Text className="pb-1 text-center text-xs text-muted">{extras.error}</Text>}
  </>;
}

/* ---------------------------------- Gifts ---------------------------------- */

const money = (minor: number, currency: string) => {
  try {return new Intl.NumberFormat(undefined, {style: 'currency', currency}).format(minor / 100);} catch {return `${currency} ${(minor / 100).toFixed(2)}`;}
};

const GIFT_BILLING_MESSAGES = {
  alreadyOwned: 'Google Play still has a gift purchase to finish. Please wait a moment and try again.',
  pending: 'Your payment is pending. The gift will appear after Google Play confirms it.',
  tokenInUse: 'This Google Play purchase is already linked to another Hiva account.',
  disabled: 'Creator gifts aren’t available right now.',
  notFound: 'No pending creator gift was found on this Google account.',
};

export function GiftsView({partyId, identity, participants, extras}: ViewProps) {
  const paid = extras.gifts.data.filter(gift => gift.status === 'PAID');
  const refreshExtras = extras.refresh;
  const [recipient, setRecipient] = useState<PartyParticipant | null>(null);
  const [catalog, setCatalog] = useState<PartyGiftProduct[]>([]);
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [loadingCatalog, setLoadingCatalog] = useState(false);
  const [busyProduct, setBusyProduct] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [held, setHeld] = useState<(PartyGiftReservation & {creatorId: string; productId: string; pending?: boolean}) | null>(null);
  const [pendingGift, setPendingGift] = useState<{creatorId: string; productId: string} | null>(null);
  const [recoverableGift, setRecoverableGift] = useState<{creatorId: string; productId: string; reservationId: string | null; expiresAt: string | null} | null>(null);
  const others = participants.filter(person => person.active && person.userId !== identity);
  const giftBilling: OneTimeProduct = {
    messages: GIFT_BILLING_MESSAGES,
    onVerified: async () => {
      await clearPendingGiftPurchase();
      setPendingGift(null); setHeld(null);
      setRecoverableGift(null);
      setNotice(`Gift sent to ${recipient?.name || 'creator'}.`);
      await refreshExtras();
    },
    verify: async (productId, purchaseToken) => {
      if (!recipient) throw new Error('Choose a creator again before confirming the gift.');
      const reservationId = held?.creatorId === recipient.userId && held.productId === productId ? held.reservationId : undefined;
      await purchasePartyGift(partyId, {creatorId: recipient.userId, productId, purchaseToken, ...(reservationId ? {reservationId} : {})});
    },
  };
  useEffect(() => {
    let live = true;
    getPendingGiftPurchase(partyId, identity).then(saved => {
      if (!live || !saved) return;
      setRecoverableGift({creatorId: saved.creatorId, productId: saved.productId, reservationId: saved.reservationId, expiresAt: saved.expiresAt});
      setPendingGift({creatorId: saved.creatorId, productId: saved.productId});
      const recoveryProduct: OneTimeProduct = {
        messages: GIFT_BILLING_MESSAGES,
        verify: async (id, purchaseToken) => {
          await purchasePartyGift(partyId, {creatorId: saved.creatorId, productId: id, purchaseToken, ...(saved.reservationId ? {reservationId: saved.reservationId} : {})});
        },
        onVerified: async () => {
          await clearPendingGiftPurchase();
          if (!live) return;
          setPendingGift(null); setHeld(null); setRecoverableGift(null);
          setNotice('Gift sent to creator.');
          await refreshExtras();
        },
      };
      // Register the purchase handler before reconnecting to Play: a delayed callback can arrive
      // as soon as billing reconnects after process death.
      loadOneTimePrices([saved.productId], recoveryProduct).catch(() => {});
    });
    return () => {live = false;};
  }, [partyId, identity, refreshExtras]);

  const chooseRecipient = async (person: PartyParticipant) => {
    setRecipient(person); setCatalog([]); setPrices({}); setError(null); setNotice(null); setLoadingCatalog(true);
    try {
      const products = await listPartyGiftCatalog(partyId, person.userId);
      setCatalog(products);
      if (!products.length) {setError('No gifts are available for this person in this room right now.'); return;}
      try {setPrices(await loadOneTimePrices(products.map(item => item.productId), giftBilling));}
      catch (e) {setError(errorMessage(e, 'Google Play prices couldn’t be loaded. Check your connection and try again.'));}
    } catch (e) {
      setError(errorStatus(e) === 404 || errorStatus(e) === 400
        ? 'Gifts aren’t available for this person in this room.'
        : errorMessage(e, 'Couldn’t load the gift catalog. Please try again.'));
    } finally {setLoadingCatalog(false);}
  };

  const sendGift = async (product: PartyGiftProduct) => {
    if (!recipient || busyProduct) return;
    setBusyProduct(product.productId); setError(null); setNotice(null);
    let reservation: (PartyGiftReservation & {creatorId: string; productId: string; pending?: boolean}) | null =
      held?.creatorId === recipient.userId && held.productId === product.productId ? held : null;
    try {
      if (product.reservationRequired && !reservation) {
        const reserved = await reservePartyGift(partyId, {
          creatorId: recipient.userId, productId: product.productId,
          idempotencyKey: `gift:${Date.now()}:${Math.random().toString(36).slice(2, 14)}`,
        });
        reservation = {...reserved, creatorId: recipient.userId, productId: product.productId};
        setHeld(reservation);
      }
      const pendingContext = {
        partyId, senderId: identity, creatorId: recipient.userId, productId: product.productId,
        reservationId: reservation?.reservationId ?? null, expiresAt: reservation?.expiresAt ?? null,
      };
      await savePendingGiftPurchase(pendingContext);
      setRecoverableGift({creatorId: pendingContext.creatorId, productId: pendingContext.productId, reservationId: pendingContext.reservationId, expiresAt: pendingContext.expiresAt});
      const outcome = await purchaseOneTime(product.productId, {
        ...giftBilling,
        verify: async (productId, purchaseToken) => {
          await purchasePartyGift(partyId, {
            creatorId: recipient.userId, productId, purchaseToken,
            ...(reservation ? {reservationId: reservation.reservationId} : {}),
          });
        },
      });
      if (outcome.status === 'pending') {
        setPendingGift({creatorId: recipient.userId, productId: product.productId});
        if (reservation) setHeld({...reservation, pending: true});
        setNotice('Payment is pending in Google Play. We’ll show the gift once it’s confirmed.');
        return;
      }
      await clearPendingGiftPurchase();
      setRecoverableGift(null);
      setHeld(null); setCatalog([]); setRecipient(null);
      setNotice(`Gift sent to ${recipient.name || 'creator'}.`);
      await refreshExtras();
    } catch (e) {
      if (isBillingError(e) && ['cancelled', 'unavailable'].includes(e.kind)) {
        try {
          if (reservation) await cancelPartyGiftReservation(partyId, reservation.reservationId);
          await clearPendingGiftPurchase();
          setRecoverableGift(null);
          setPendingGift(null);
          setHeld(null);
        } catch {
          if (reservation) setHeld(reservation);
          setError('Purchase did not start, but the gift limit hold could not be released yet. Please retry shortly.');
          return;
        }
      }
      setError(errorMessage(e, isBillingError(e) ? e.message : 'Couldn’t send the gift. If Google Play opened, retry the same gift so your reservation is reused.'));
    } finally {setBusyProduct(null);}
  };

  const recoverGift = async () => {
    if (!recoverableGift || busyProduct) return;
    const {creatorId, productId, reservationId, expiresAt} = recoverableGift;
    const savedRecipient = participants.find(person => person.userId === creatorId);
    setBusyProduct(productId); setError(null); setNotice(null);
    const recoveryProduct: OneTimeProduct = {
      ...giftBilling,
      verify: async (id, purchaseToken) => {
        await purchasePartyGift(partyId, {creatorId, productId: id, purchaseToken, ...(reservationId ? {reservationId} : {})});
      },
      onVerified: async () => {
        await clearPendingGiftPurchase();
        setPendingGift(null); setHeld(null); setRecoverableGift(null);
        setNotice(`Gift sent to ${savedRecipient?.name || 'creator'}.`);
        await refreshExtras();
      },
    };
    try {
      await restoreOneTime(productId, recoveryProduct);
    } catch (e) {
      setError(expiresAt && Date.parse(expiresAt) <= Date.now()
        ? 'The gift reservation may have expired. Contact support before trying another purchase.'
        : errorMessage(e, isBillingError(e) ? e.message : 'Couldn’t recover the gift yet. Check your connection and retry.'));
    } finally {setBusyProduct(null);}
  };

  return <>
    {paid.length ? <SheetSection label="Gifts in this room">
      {paid.map(gift => <View key={gift.id} className="min-h-[56px] flex-row items-center gap-3 border-b border-sheet px-4 py-2.5">
        <View className="h-9 w-9 items-center justify-center rounded-full bg-gold-bg"><IconGift size={18} color={PartyColors.accent} /></View>
        <View className="min-w-0 flex-1">
          <Text numberOfLines={1} className="text-[15px] font-semibold capitalize text-foreground">{gift.quantity > 1 ? `${gift.quantity} × ` : ''}{gift.giftType}</Text>
          <Text numberOfLines={1} className="mt-0.5 text-xs text-muted">To {gift.creator.displayName || (gift.creator.handle ? `@${gift.creator.handle}` : 'a creator')}</Text>
        </View>
        <Text className="text-[13px] font-bold text-muted">{money(gift.amountMinor, gift.currency)}</Text>
      </View>)}
    </SheetSection> : <Empty icon={IconGift} title="No gifts yet" body="Gifts sent to creators in this room will show up here." />}
    {extras.gifts.enabled && <SheetSection label="Send a gift">
      {(held?.pending || (pendingGift && !recoverableGift)) && <View className="border-b border-sheet px-4 py-3"><Text className="text-[13px] leading-5 text-muted">Google Play is still processing this gift. It will appear after confirmation; don’t start another gift until then.</Text></View>}
      {!!recoverableGift && <View className="border-b border-sheet px-4 py-3">
        <Text className="text-[13px] leading-5 text-muted">An earlier gift checkout hasn’t been reconciled yet. Check Google Play and Hiva before starting another gift.</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Recover interrupted gift purchase" accessibilityState={{disabled: !!busyProduct, busy: busyProduct === recoverableGift.productId}}
          disabled={!!busyProduct} onPress={recoverGift} className="mt-2 min-h-11 flex-row items-center justify-center rounded-full bg-gold px-4 active:opacity-80">
          {busyProduct === recoverableGift.productId ? <ActivityIndicator size="small" color={PartyColors.ink} /> : <Text className="text-[13px] font-bold text-gold-ink">Check purchase</Text>}
        </Pressable>
      </View>}
      {!recipient && <>
        <View className="px-4 pb-2 pt-3"><Text className="text-[13px] leading-5 text-muted">Choose a creator who’s in this room.</Text></View>
        {others.map(person => <Pressable key={person.userId} accessibilityRole="button" accessibilityLabel={`Choose ${person.name || 'creator'} to gift`} onPress={() => chooseRecipient(person)} disabled={!!held?.pending || !!pendingGift || !!recoverableGift}
          className="min-h-[52px] flex-row items-center gap-3 border-b border-sheet px-4 py-2.5 active:bg-background/60">
          <View className="h-8 w-8 items-center justify-center rounded-full bg-primary-dark"><IconGift size={16} color={PartyColors.accent} /></View>
          <Text numberOfLines={1} className="min-w-0 flex-1 text-[15px] font-semibold text-foreground">{person.name || 'Guest'}</Text>
          {loadingCatalog && <ActivityIndicator size="small" color={PartyColors.accent} />}
          {!loadingCatalog && <Text className="text-[13px] font-semibold text-primary">Choose</Text>}
        </Pressable>)}
        {!others.length && <Text className="px-4 pb-3 text-[13px] text-muted">Invite a creator into the room to send a gift.</Text>}
      </>}
      {!!recipient && <>
        <View className="flex-row items-center justify-between border-b border-sheet px-4 py-2.5">
          <Text className="text-[14px] font-semibold text-foreground">To {recipient.name || 'creator'}</Text>
          {!held?.pending && !pendingGift && <Pressable accessibilityRole="button" accessibilityLabel="Choose a different person" onPress={() => {setRecipient(null); setCatalog([]); setPrices({}); setError(null);}} className="min-h-11 justify-center px-2 active:opacity-70"><Text className="text-[13px] font-semibold text-primary">Change</Text></Pressable>}
        </View>
        {loadingCatalog && <View className="items-center py-5"><ActivityIndicator color={PartyColors.accent} /></View>}
        {catalog.map(product => {
          const price = prices[product.productId];
          const pendingThis = held?.pending && held.productId === product.productId && held.creatorId === recipient.userId;
          return <View key={product.productId} className="min-h-[64px] flex-row items-center gap-3 border-b border-sheet px-4 py-2.5">
            <View className="h-10 w-10 items-center justify-center rounded-2xl bg-primary-dark"><IconGift size={19} color={PartyColors.accent} /></View>
            <View className="min-w-0 flex-1"><Text numberOfLines={1} className="text-[15px] font-semibold text-foreground">{product.name}</Text>
              <Text className="mt-0.5 text-xs text-muted">{price || 'Price unavailable'}</Text></View>
            <Pressable accessibilityRole="button" accessibilityLabel={`Send ${product.name}${price ? ` for ${price}` : ''}`} accessibilityState={{disabled: !price || !!busyProduct || !!held?.pending || !!pendingGift, busy: busyProduct === product.productId}}
              disabled={!price || !!busyProduct || !!held?.pending || !!pendingGift} onPress={() => sendGift(product)} className={`min-h-9 min-w-16 items-center justify-center rounded-full px-3 ${price ? 'bg-gold' : 'bg-background'} ${!price || busyProduct || held?.pending || pendingGift ? 'opacity-50' : ''}`}>
              {busyProduct === product.productId ? <ActivityIndicator size="small" color={PartyColors.ink} /> : <Text className="text-[13px] font-bold text-gold-ink">{pendingThis ? 'Pending' : price ? 'Send' : 'Unavailable'}</Text>}
            </Pressable>
          </View>;
        })}
      </>}
      {!!error && <View className="px-4 py-2"><Text accessibilityRole="alert" className="text-[13px] leading-5 text-coral">{error}</Text></View>}
      {!!notice && <View className="px-4 py-2"><Text className="text-[13px] leading-5 text-muted">{notice}</Text></View>}
    </SheetSection>}
    {extras.error && <Text className="pb-1 text-center text-xs text-muted">{extras.error}</Text>}
  </>;
}
