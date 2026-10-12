import React, {useState} from 'react';
import {Pressable, Text, View} from 'react-native';
import IconUsersGroup from '@tabler/icons-react-native/IconUsersGroup';
import {Colors} from '../../Constants/Colors';
import EventNetworkingSheet from './EventNetworkingSheet';
import {closedCopy, networkingEntryState} from './networkingPresentation';

export type EventNetworkingEntryProps = {
  event: {id: string; title?: string | null; status?: string; networking_enabled?: boolean; networking_ends_at?: string | null};
  /** The viewer's live (ISSUED or CHECKED_IN) ticket state, from the event detail's `viewer.ticket`. */
  hasTicket: boolean;
};

/** "Meet people at this event" card for ticket holders of events whose organiser turned networking on. Renders nothing otherwise. */
export default function EventNetworkingEntry({event, hasTicket}: EventNetworkingEntryProps) {
  const [open, setOpen] = useState(false);
  const state = networkingEntryState(event, hasTicket);
  if (!state) return null;
  return <>
    {state === 'open'
      ? <Pressable accessibilityRole="button" accessibilityLabel="Meet people at this event" onPress={() => setOpen(true)}
        className="flex-row items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 active:opacity-70">
        <IconUsersGroup size={22} color={Colors.gold} />
        <View className="min-w-0 flex-1">
          <Text className="text-[14px] font-bold text-foreground">Meet people at this event</Text>
          <Text className="mt-0.5 text-[12px] leading-4 text-muted">Optional. Only attendees who join can see each other.</Text>
        </View>
      </Pressable>
      : <View accessibilityLabel="Networking closed" className="flex-row items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3">
        <IconUsersGroup size={22} color={Colors.muted} />
        <Text className="flex-1 text-[13px] leading-5 text-muted">{closedCopy(event.status)}</Text>
      </View>}
    {state === 'open' && <EventNetworkingSheet eventId={event.id} eventTitle={event.title} visible={open} onClose={() => setOpen(false)} />}
  </>;
}
