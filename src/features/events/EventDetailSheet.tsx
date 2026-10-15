import React, {useCallback, useEffect, useRef, useState} from 'react';
import {ActivityIndicator, Pressable, Text, View} from 'react-native';
import IconCalendarEvent from '@tabler/icons-react-native/IconCalendarEvent';
import IconMapPin from '@tabler/icons-react-native/IconMapPin';
import IconUsers from '@tabler/icons-react-native/IconUsers';
import IconTicket from '@tabler/icons-react-native/IconTicket';
import BottomSheet, {SheetButton} from '../../components/BottomSheet';
import {Colors} from '../../Constants/Colors';
import {actionMessageOf, formatEventPrice, formatEventWhen, goingLabel, isSoldOut, messageOf, viewerStatusLabel} from './eventsPresentation';
import {requestEventTicket, setEventInterest} from './eventsService';
import {claimWaitlistOffer, getMyWaitlistEntries, joinEventWaitlist, leaveEventWaitlist} from './waitlistService';
import type {EventWaitlistEntry} from './waitlistService';
import {EventNetworkingEntry} from '../eventNetworking';
import {getEvent} from './eventsService';
import type {ApiEvent, EventViewer} from './types';
import RemoteImage from '../../components/RemoteImage';

type Props = {
  eventId: string | null;
  /** List/profile row shown instantly while the full detail loads. */
  initial?: Partial<ApiEvent> | null;
  visible: boolean;
  onClose: () => void;
  onOpenEventChat?: (conversationId?: string) => void;
  onOpenTickets?: (eventId: string, ticketId?: string) => void;
};

const Row = ({icon, children}: {icon: React.ReactNode; children: React.ReactNode}) =>
  <View className="flex-row items-start gap-3">
    <View className="mt-0.5">{icon}</View>
    <View className="flex-1">{children}</View>
  </View>;

const EventDetailSheet = ({eventId, initial, visible, onClose, onOpenEventChat, onOpenTickets}: Props) => {
  const [event, setEvent] = useState<Partial<ApiEvent> | null>(initial ?? null);
  const [viewer, setViewer] = useState<EventViewer | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [waitlistEntry, setWaitlistEntry] = useState<EventWaitlistEntry | null>(null);
  const request = useRef(0);
  const initialRef = useRef(initial); initialRef.current = initial;

  const load = useCallback(async (id: string) => {
    const token = ++request.current;
    setLoading(true); setError(null);
    try {
      const detail = await getEvent(id);
      if (token !== request.current) return;
      setEvent(detail.event); setViewer(detail.viewer);
      if (isSoldOut(detail.event) && detail.event.status === 'PUBLISHED') {
        try {
          const entries = await getMyWaitlistEntries();
          if (token === request.current) setWaitlistEntry(entries.find(entry => entry.event_id === id && ['WAITING', 'OFFERED', 'CLAIMED'].includes(entry.status)) ?? null);
        } catch {if (token === request.current) setWaitlistEntry(null);}
      } else setWaitlistEntry(null);
    } catch (e) {
      if (token === request.current) setError(messageOf(e));
    } finally {
      if (token === request.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const counter = request;
    if (!visible || !eventId) { counter.current++; return; }
    setEvent(initialRef.current ?? null); setViewer(null); setWaitlistEntry(null); setActionError(null);
    load(eventId);
    return () => { counter.current++; };
  }, [visible, eventId, load]);

  const status = viewerStatusLabel(viewer);
  const full = event as ApiEvent | null;
  const cover = event?.cover_url && /^https?:\/\//i.test(event.cover_url) ? event.cover_url : null;

  const purchase = async () => {
    if (!full?.id || actionBusy) return;
    setActionBusy(true); setActionError(null);
    try {
      const result = await requestEventTicket(full.id);
      if (result.mode === 'CHAT_OPENED') {
        await load(full.id);
        if (onOpenEventChat) {onClose(); onOpenEventChat(result.conversationId);}
        else setActionError('Ticket request sent. Open Chat → Events to continue with the organiser.');
      } else {
        await load(full.id);
        if (onOpenTickets) {onClose(); onOpenTickets(full.id, result.ticket.id);}
      }
    } catch (cause) {setActionError(actionMessageOf(cause));}
    finally {setActionBusy(false);}
  };

  const toggleInterest = async () => {
    if (!full?.id || actionBusy) return;
    setActionBusy(true); setActionError(null);
    try {await setEventInterest(full.id, viewer?.interest === 'INTERESTED' ? 'CANCELLED' : 'INTERESTED'); await load(full.id);}
    catch (cause) {setActionError(actionMessageOf(cause));}
    finally {setActionBusy(false);}
  };

  const waitlistAction = async () => {
    if (!full?.id || actionBusy) return;
    setActionBusy(true); setActionError(null);
    try {
      if (waitlistEntry?.status === 'WAITING') {
        await leaveEventWaitlist(full.id); setWaitlistEntry(null);
      } else if (waitlistEntry?.status === 'OFFERED') {
        const claimed = await claimWaitlistOffer(waitlistEntry.id); setWaitlistEntry(claimed);
      } else {
        const joined = await joinEventWaitlist(full.id); setWaitlistEntry(joined);
      }
    } catch (cause) {setActionError(actionMessageOf(cause));}
    finally {setActionBusy(false);}
  };

  const canRequest = !!full && full.status === 'PUBLISHED' && !isSoldOut(full)
    && new Date(full.starts_at).getTime() > Date.now() && !viewer?.ticket;
  const canWaitlist = !!full && full.status === 'PUBLISHED' && isSoldOut(full)
    && new Date(full.starts_at).getTime() > Date.now() && !viewer?.ticket;
  const showWaitlistAction = canWaitlist && waitlistEntry?.status !== 'CLAIMED';
  const primaryLabel = viewer?.ticket ? 'View my ticket'
    : viewer?.interest === 'REQUESTED' ? 'Open event chat'
      : showWaitlistAction ? waitlistEntry?.status === 'WAITING' ? 'Leave waitlist' : waitlistEntry?.status === 'OFFERED' ? 'Claim ticket offer' : 'Join waitlist'
        : full?.is_paid ? `Request ticket · ${formatEventPrice(full)}` : 'Get free ticket';
  const primaryAction = viewer?.ticket ? () => onOpenTickets?.(full?.id || '', viewer.ticket?.id)
    : viewer?.interest === 'REQUESTED' ? () => {onClose(); onOpenEventChat?.();}
      : showWaitlistAction ? waitlistAction : purchase;
  const showPrimary = !!full && (canRequest || showWaitlistAction || (!!viewer?.ticket && !!onOpenTickets) || (viewer?.interest === 'REQUESTED' && !!onOpenEventChat));
  const footer = showPrimary ? <View>
    {!!actionError && <Text accessibilityRole="alert" className="mb-2 text-center text-[13px] text-coral">{actionError}</Text>}
    <SheetButton label={primaryLabel} onPress={primaryAction} busy={actionBusy} disabled={actionBusy || (!onOpenTickets && !!viewer?.ticket)} />
    {canRequest && !viewer?.ticket && viewer?.interest !== 'REQUESTED' && <Pressable accessibilityRole="button" accessibilityLabel={viewer?.interest === 'INTERESTED' ? 'Remove event interest' : 'Mark interested in event'}
      accessibilityState={{disabled: actionBusy}} disabled={actionBusy} onPress={toggleInterest} className="items-center py-2.5 active:opacity-70">
      <Text className="text-[13px] font-semibold text-muted">{viewer?.interest === 'INTERESTED' ? 'Remove interest' : 'I’m interested'}</Text>
    </Pressable>}
  </View> : undefined;

  return <BottomSheet visible={visible} onClose={onClose} title={event?.title ?? 'Event'} subtitle={event?.workspace_name ? `Hosted by ${event.workspace_name}` : null} footer={footer} dismissible={!actionBusy}>
    {!!cover && <RemoteImage uri={cover} accessibilityLabel="Event cover" className="mb-4 h-44 w-full rounded-[18px] bg-card" resizeMode="cover" />}
    {loading && !event?.description && <ActivityIndicator accessibilityLabel="Loading event" color={Colors.gold} className="my-3" />}
    {!!error && <View className="mb-3 rounded-2xl border border-border bg-card p-3">
      <Text accessibilityRole="alert" className="text-[13px] text-coral">{error}</Text>
      {!!eventId && <Pressable accessibilityRole="button" accessibilityLabel="Retry" onPress={() => load(eventId)} className="mt-2 self-start rounded-full bg-primary-dark px-4 py-2">
        <Text className="text-[13px] font-bold text-purple-soft">Retry</Text>
      </Pressable>}
    </View>}
    {!!event && <View className="gap-3.5">
      {!!event.starts_at && <Row icon={<IconCalendarEvent size={18} color={Colors.muted} />}>
        <Text className="text-[14px] font-semibold text-foreground">{formatEventWhen(event.starts_at, event.ends_at)}</Text>
      </Row>}
      {!!event.venue && <Row icon={<IconMapPin size={18} color={Colors.muted} />}>
        <Text className="text-[14px] font-semibold text-foreground">{event.venue}</Text>
        {!!event.address && <Text className="mt-0.5 text-[12px] text-muted">{event.address}</Text>}
      </Row>}
      {event.tickets_issued != null && <Row icon={<IconUsers size={18} color={Colors.muted} />}>
        <Text className="text-[14px] font-semibold text-foreground">{goingLabel(full as ApiEvent)}{isSoldOut(full as ApiEvent) ? ' - sold out' : ''}</Text>
      </Row>}
      {event.is_paid != null && <Row icon={<IconTicket size={18} color={Colors.muted} />}>
        <Text className="text-[14px] font-semibold text-foreground">{formatEventPrice(full as ApiEvent)}</Text>
      </Row>}
      {!!status && <View className="rounded-2xl border border-gold-line bg-gold-bg px-4 py-3">
        <Text accessibilityLabel="Your ticket status" className="text-[13px] font-bold text-gold">{status}</Text>
      </View>}
      {waitlistEntry?.status === 'CLAIMED' && <Text className="text-[13px] font-semibold text-gold">A place is reserved for you. The organiser will follow up with the ticket.</Text>}
      {waitlistEntry?.status === 'WAITING' && <Text className="text-[13px] text-muted">{waitlistEntry.position ? `You’re #${waitlistEntry.position} in the waitlist.` : 'You’re on the waitlist.'}</Text>}
      {waitlistEntry?.status === 'OFFERED' && <Text className="text-[13px] font-semibold text-gold">A ticket opened up. {waitlistEntry.offer_expires_at ? `Claim before ${new Date(waitlistEntry.offer_expires_at).toLocaleString()}.` : 'Claim it while it’s available.'}</Text>}
      {!!event.id && !!viewer?.ticket && <EventNetworkingEntry event={event as ApiEvent} hasTicket />}
      {!!event.description && <Text className="text-[14px] leading-[21px] text-text-body">{event.description}</Text>}
    </View>}
  </BottomSheet>;
};

export default EventDetailSheet;
