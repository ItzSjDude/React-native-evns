import React, {useCallback, useEffect, useRef, useState} from 'react';
import {ActivityIndicator, Image, Pressable, Text, View} from 'react-native';
import IconCalendarEvent from '@tabler/icons-react-native/IconCalendarEvent';
import IconMapPin from '@tabler/icons-react-native/IconMapPin';
import IconUsers from '@tabler/icons-react-native/IconUsers';
import IconTicket from '@tabler/icons-react-native/IconTicket';
import BottomSheet from '../../components/BottomSheet';
import {Colors} from '../../Constants/Colors';
import {formatEventPrice, formatEventWhen, goingLabel, isSoldOut, messageOf, viewerStatusLabel} from './eventsPresentation';
import {getEvent} from './eventsService';
import type {ApiEvent, EventViewer} from './types';

type Props = {
  eventId: string | null;
  /** List/profile row shown instantly while the full detail loads. */
  initial?: Partial<ApiEvent> | null;
  visible: boolean;
  onClose: () => void;
};

const Row = ({icon, children}: {icon: React.ReactNode; children: React.ReactNode}) =>
  <View className="flex-row items-start gap-3">
    <View className="mt-0.5">{icon}</View>
    <View className="flex-1">{children}</View>
  </View>;

const EventDetailSheet = ({eventId, initial, visible, onClose}: Props) => {
  const [event, setEvent] = useState<Partial<ApiEvent> | null>(initial ?? null);
  const [viewer, setViewer] = useState<EventViewer | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const request = useRef(0);
  const initialRef = useRef(initial); initialRef.current = initial;

  const load = useCallback(async (id: string) => {
    const token = ++request.current;
    setLoading(true); setError(null);
    try {
      const detail = await getEvent(id);
      if (token !== request.current) return;
      setEvent(detail.event); setViewer(detail.viewer);
    } catch (e) {
      if (token === request.current) setError(messageOf(e));
    } finally {
      if (token === request.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const counter = request;
    if (!visible || !eventId) { counter.current++; return; }
    setEvent(initialRef.current ?? null); setViewer(null);
    load(eventId);
    return () => { counter.current++; };
  }, [visible, eventId, load]);

  const status = viewerStatusLabel(viewer);
  const full = event as ApiEvent | null;
  const cover = event?.cover_url && /^https?:\/\//i.test(event.cover_url) ? event.cover_url : null;

  return <BottomSheet visible={visible} onClose={onClose} title={event?.title ?? 'Event'} subtitle={event?.workspace_name ? `Hosted by ${event.workspace_name}` : null}>
    {!!cover && <Image source={{uri: cover}} accessibilityLabel="Event cover" className="mb-4 h-44 w-full rounded-[18px] bg-card" resizeMode="cover" />}
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
      {!!event.description && <Text className="text-[14px] leading-[21px] text-text-body">{event.description}</Text>}
    </View>}
  </BottomSheet>;
};

export default EventDetailSheet;
