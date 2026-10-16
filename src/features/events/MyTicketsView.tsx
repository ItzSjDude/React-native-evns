import React, {useCallback, useEffect, useState} from 'react';
import {ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import IconChevronLeft from '@tabler/icons-react-native/IconChevronLeft';
import IconTicket from '@tabler/icons-react-native/IconTicket';
import {SheetButton} from '../../components/BottomSheet';
import {showDialog} from '../../components/Dialog';
import {Colors} from '../../Constants/Colors';
import {actionMessageOf, formatEventWhen} from './eventsPresentation';
import {cancelMyTicket, getMyTicket, listMyTickets} from './ticketsService';
import type {Ticket} from './ticketsService';
import RemoteImage from '../../components/RemoteImage';

const when = (ticket: Ticket) => formatEventWhen(ticket.event_starts_at, ticket.event_ends_at);

export type MyTicketsViewProps = {
  /** Leaves the screen (header back button). */
  onBack: () => void;
  eventId?: string | null;
  /** Opens this ticket's detail (pass + QR) straight away. */
  ticketId?: string | null;
  /** Called when the user returns from a ticket detail to the list. */
  onExitTicket?: () => void;
};

/** Full-screen "My tickets": header, upcoming/past passes, ticket detail with QR and cancel. Hosted by a stack route or, inside the chat Modal, as an overlay. */
export default function MyTicketsView({onBack, eventId, ticketId, onExitTicket}: MyTicketsViewProps) {
  const [upcoming, setUpcoming] = useState(true);
  const [items, setItems] = useState<Ticket[]>([]);
  const [selected, setSelected] = useState<Ticket | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const page = await listMyTickets(0, 50, upcoming);
      setItems(eventId ? page.items.filter(ticket => ticket.event_id === eventId) : page.items);
    } catch (cause) {setError(actionMessageOf(cause));}
    finally {setLoading(false);}
  }, [eventId, upcoming]);

  useEffect(() => {
    setSelected(null); setError(null);
    if (ticketId) {
      setBusy(true);
      getMyTicket(ticketId).then(setSelected).catch(cause => setError(actionMessageOf(cause))).finally(() => setBusy(false));
    } else load();
  }, [ticketId, load]);

  const openTicket = async (ticket: Ticket) => {
    setSelected(ticket); setBusy(true); setError(null);
    try {setSelected(await getMyTicket(ticket.id));}
    catch (cause) {setError(actionMessageOf(cause));}
    finally {setBusy(false);}
  };

  const cancel = () => {
    if (!selected) return;
    showDialog('Cancel this ticket?', 'The organiser may be notified. Cancellation does not automatically refund payment made outside Hiva, and this pass cannot be used at the door.', [
      {text: 'Keep ticket', style: 'cancel'},
      {text: 'Cancel ticket', style: 'destructive', onPress: async () => {
        setBusy(true); setError(null);
        try {await cancelMyTicket(selected.id); setSelected(null); await load();}
        catch (cause) {setError(actionMessageOf(cause));}
        finally {setBusy(false);}
      }},
    ]);
  };

  const refresh = async () => {
    if (selected || ticketId) return;
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const canCancel = selected?.status === 'ISSUED' && new Date(selected.event_starts_at).getTime() > Date.now();
  return <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-background">
    <View className="min-h-[56px] flex-row items-center gap-2 px-3">
      <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={onBack} hitSlop={4} className="h-11 w-11 items-center justify-center rounded-full active:opacity-70">
        <IconChevronLeft size={24} color={Colors.text} />
      </Pressable>
      <View className="min-w-0 flex-1">
        <Text accessibilityRole="header" numberOfLines={1} className="text-[20px] font-extrabold text-foreground">My tickets</Text>
        <Text numberOfLines={1} className="text-[12px] text-muted">{selected ? `${selected.event_title} · ${selected.workspace_name}` : 'Your upcoming and past event passes'}</Text>
      </View>
    </View>
    <ScrollView className="flex-1" contentContainerClassName="px-4 pb-6 pt-2" keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={Colors.gold} enabled={!selected && !ticketId} />}>
    {selected ? <View>
      <Pressable accessibilityRole="button" accessibilityLabel="Back to my tickets" onPress={() => {setSelected(null); setError(null); onExitTicket?.();}}
        className="mb-4 h-9 flex-row items-center gap-1 self-start rounded-full bg-card px-3 active:opacity-70">
        <IconChevronLeft size={17} color={Colors.text} /><Text className="text-[13px] font-bold text-foreground">My tickets</Text>
      </Pressable>
      <View className="items-center rounded-[22px] border border-border bg-card p-4">
        <Text className="text-center text-[14px] font-semibold text-muted">{when(selected)}</Text>
        {!!selected.event_venue && <Text className="mt-1 text-center text-[13px] text-muted">{selected.event_venue}</Text>}
        <View className="my-4 h-px w-full bg-border" />
        {busy && !selected.qrImageDataUrl
          ? <ActivityIndicator accessibilityLabel="Loading ticket pass" color={Colors.gold} />
          : selected.qrImageDataUrl
            ? <RemoteImage uri={selected.qrImageDataUrl} accessibilityLabel="Ticket QR code" className="h-56 w-56 bg-white" resizeMode="contain" />
            : <View className="h-56 w-56 items-center justify-center rounded-2xl bg-background"><IconTicket size={36} color={Colors.muted} /></View>}
        <Text className="mt-3 text-[19px] font-extrabold tracking-[1px] text-foreground">{selected.code}</Text>
        <Text accessibilityLabel={`Ticket status ${selected.status}`} className="mt-1 text-[12px] font-bold text-gold">{selected.status.replace('_', ' ')}</Text>
      </View>
      <Text className="mt-3 text-center text-[12px] leading-5 text-muted">Keep this pass ready at the entrance. A successful check-in marks it as used.</Text>
      {!!error && <Text accessibilityRole="alert" className="mt-3 text-center text-[13px] text-coral">{error}</Text>}
    </View> : ticketId ? <View className="items-center py-8">
      {busy ? <ActivityIndicator accessibilityLabel="Loading ticket pass" color={Colors.gold} />
        : <><Text accessibilityRole="alert" className="text-center text-[13px] text-coral">{error || 'Could not load this ticket.'}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Retry loading ticket" onPress={() => openTicket({id: ticketId} as Ticket)} className="mt-3 h-10 justify-center rounded-full bg-card px-4">
            <Text className="text-[13px] font-bold text-foreground">Try again</Text></Pressable></>}
    </View> : <View>
      <View className="mb-3 flex-row rounded-full bg-card p-1">
        {([true, false] as const).map(value => <Pressable key={String(value)} accessibilityRole="button" accessibilityLabel={value ? 'Upcoming tickets' : 'Past tickets'}
          accessibilityState={{selected: upcoming === value}} onPress={() => setUpcoming(value)} className={`min-h-9 flex-1 items-center justify-center rounded-full ${upcoming === value ? 'bg-primary-dark' : ''}`}>
          <Text className={`text-[13px] font-bold ${upcoming === value ? 'text-purple-soft' : 'text-muted'}`}>{value ? 'Upcoming' : 'Past'}</Text>
        </Pressable>)}
      </View>
      {loading ? <View className="items-center py-8"><ActivityIndicator accessibilityLabel="Loading tickets" color={Colors.gold} /></View>
        : error ? <View className="items-center py-5"><Text accessibilityRole="alert" className="text-center text-[13px] text-coral">{error}</Text><SheetButton label="Retry" variant="ghost" onPress={load} /></View>
          : items.length ? <View className="overflow-hidden rounded-2xl bg-card">
            {items.map((ticket, index) => <Pressable key={ticket.id} accessibilityRole="button" accessibilityLabel={`Open ticket for ${ticket.event_title}`}
              onPress={() => openTicket(ticket)} className={`min-h-[64px] flex-row items-center gap-3 px-4 py-3 active:bg-background/60 ${index ? 'border-t border-sheet' : ''}`}>
              <View className="h-10 w-10 items-center justify-center rounded-full bg-primary-dark"><IconTicket size={20} color={Colors.primary} /></View>
              <View className="min-w-0 flex-1"><Text numberOfLines={1} className="text-[14px] font-bold text-foreground">{ticket.event_title}</Text>
                <Text className="mt-0.5 text-[12px] text-muted">{when(ticket)} · {ticket.code}</Text></View>
              <Text className="text-[11px] font-bold text-gold">{ticket.status.replace('_', ' ')}</Text>
            </Pressable>)}
          </View> : <View className="items-center px-4 py-8"><IconTicket size={32} color={Colors.muted} />
            <Text className="mt-2 text-[15px] font-bold text-foreground">No tickets here yet</Text>
            <Text className="mt-1 text-center text-[13px] text-muted">Tickets you receive for events will show up here.</Text></View>}
    </View>}
    </ScrollView>
    {canCancel && <View className="px-4 pb-2"><SheetButton label="Cancel ticket" variant="destructive" disabled={busy} busy={busy} onPress={cancel} /></View>}
  </SafeAreaView>;
}
