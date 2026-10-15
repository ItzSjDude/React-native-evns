import React, {memo, useCallback, useEffect, useRef, useState} from 'react';
import {SLIDE_MODAL_ANIMATION} from '../../Constants/NavigationTransitions';
import {ActivityIndicator, AppState, Modal, Pressable, ScrollView, Text, TextInput, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {FlashList} from '@shopify/flash-list';
import IconChevronLeft from '@tabler/icons-react-native/IconChevronLeft';
import IconChevronRight from '@tabler/icons-react-native/IconChevronRight';
import IconRefresh from '@tabler/icons-react-native/IconRefresh';
import {Colors} from '../../Constants/Colors';
import {checkInOrganizerTicket, getOrganizerDashboard, getOrganizerEventStats, isRouteNotDeployed, listMyWorkspaces, listOrganizerAttendees, listOrganizerEvents} from './organizerService';
import {checkInMessage, messageOf} from './organizerPresentation';
import type {OrganizerAttendee, OrganizerAttendeePage, OrganizerDashboardSummary, OrganizerEvent, OrganizerEventStats, Workspace} from './types';

type Section = 'Overview' | 'Events' | 'Event detail' | 'Attendees' | 'Check-in';
const sections: Section[] = ['Overview', 'Events', 'Event detail', 'Attendees', 'Check-in'];
const eventFilters = [{label: 'Upcoming', value: 'UPCOMING'}, {label: 'Past', value: 'PAST'}, {label: 'Drafts', value: 'DRAFT'}] as const;
const compactHorizontalScroll = {flexGrow: 0};
const Card = ({children}: {children: React.ReactNode}) => <View className="rounded-[20px] border border-border bg-card p-4">{children}</View>;
const renderAttendee = ({item}: {item: OrganizerAttendee}) => <AttendeeRow person={item} />;
// FlashList only honours padding on the content container.
const LIST_CONTENT = {paddingHorizontal: 16, paddingTop: 16, paddingBottom: 40};
const ItemGap = () => <View className="h-3" />;
const noAttendees: OrganizerAttendee[] = [];
const eventKey = (event: OrganizerEvent) => event.id;
const attendeeKey = (person: OrganizerAttendee) => person.id;
const Label = ({children}: {children: React.ReactNode}) => <Text className="text-[12px] font-semibold text-muted">{children}</Text>;

/** Workspace-scoped organiser dashboard. All displayed metrics and attendee decisions come from the API. */
export default function OrganizerDashboardScreen({visible, onClose, onHostEvent, onAccessRevoked}: {visible: boolean; onClose: () => void; onHostEvent: (workspaces: Workspace[]) => void; onAccessRevoked?: () => void}) {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [section, setSection] = useState<Section>('Overview');
  const [dashboard, setDashboard] = useState<OrganizerDashboardSummary | null>(null);
  const [events, setEvents] = useState<OrganizerEvent[]>([]);
  const [eventFilter, setEventFilter] = useState<typeof eventFilters[number]['value']>('UPCOMING');
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [eventStats, setEventStats] = useState<OrganizerEventStats | null>(null);
  const [attendeesUnavailable, setAttendeesUnavailable] = useState(false);
  const [attendees, setAttendees] = useState<OrganizerAttendeePage | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [ticketCode, setTicketCode] = useState('');
  const [checkInBusy, setCheckInBusy] = useState(false);
  const [checkInNotice, setCheckInNotice] = useState<string | null>(null);
  const [workspaceRevision, setWorkspaceRevision] = useState(0);
  const workspaceReady = useRef(false);
  const requestId = useRef(0);
  const onCloseRef = useRef(onClose);
  const onAccessRevokedRef = useRef(onAccessRevoked);
  onCloseRef.current = onClose;
  onAccessRevokedRef.current = onAccessRevoked;

  const load = useCallback(async (workspaceId?: string | null) => {
    const id = workspaceId ?? selectedId;
    if (!id) return;
    const request = ++requestId.current;
    setLoading(true); setError(null);
    try {
      if (section === 'Overview') setDashboard(await getOrganizerDashboard(id));
      else if (section === 'Events') setEvents((await listOrganizerEvents(id, eventFilter)).items);
      else if (section === 'Event detail') {
        if (!selectedEventId) throw new Error('Choose an event to view its details.');
        setEventStats(await getOrganizerEventStats(id, selectedEventId));
      }
      else if (section === 'Attendees' || section === 'Check-in') {
        const targetEvent = selectedEventId;
        if (!targetEvent) {
          const result = await listOrganizerEvents(id, 'UPCOMING');
          setEvents(result.items);
          if (result.items[0]) setSelectedEventId(result.items[0].id);
          return;
        }
        if (section === 'Attendees') {
          try {setAttendees(await listOrganizerAttendees(id, targetEvent, {search: query})); setAttendeesUnavailable(false);}
          catch (cause) {if (isRouteNotDeployed(cause)) {setAttendees(null); setAttendeesUnavailable(true);} else throw cause;}
        } else setEventStats(await getOrganizerEventStats(id, targetEvent));
      }
    } catch (cause) {
      if (request === requestId.current) {
        const failure = cause as {status?: number; code?: string};
        if (failure.status === 403 || failure.code === 'WORKSPACE_ACCESS_REVOKED') {onAccessRevokedRef.current?.(); onCloseRef.current();}
        else setError(messageOf(cause));
      }
    } finally {
      if (request === requestId.current) setLoading(false);
    }
  }, [eventFilter, query, section, selectedEventId, selectedId]);

  const loadWorkspaces = useCallback(async (): Promise<Workspace[]> => {
    const request = ++requestId.current;
    setLoading(true); setError(null);
    try {
      const rows = (await listMyWorkspaces()).filter(row => row.status === 'ACTIVE' && row.verificationStatus === 'APPROVED' && (row.role === 'OWNER' || row.role === 'ADMIN'));
      if (request !== requestId.current) return [];
      setWorkspaces(rows);
      setSelectedId(current => rows.some(row => row.id === current) ? current : rows[0]?.id ?? null);
      workspaceReady.current = true;
      setWorkspaceRevision(revision => revision + 1);
      if (!rows.length) setError('You no longer have an active organiser workspace.');
      return rows;
    } catch (cause) {if (request === requestId.current) setError(messageOf(cause)); return [];}
    finally {if (request === requestId.current) setLoading(false);}
  }, []);

  useEffect(() => {
    if (visible) {
      workspaceReady.current = false;
      setWorkspaces([]); setSelectedId(null); setEvents([]); setDashboard(null);
      setSection('Overview'); setSelectedEventId(null); loadWorkspaces();
    } else requestId.current++;
  }, [visible, loadWorkspaces]);
  useEffect(() => {if (visible && workspaceReady.current && selectedId) load(selectedId);}, [visible, selectedId, section, selectedEventId, workspaceRevision, load]);
  useEffect(() => {
    if (!visible) return;
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') loadWorkspaces();
    });
    return () => sub.remove();
  }, [visible, load, loadWorkspaces, selectedId]);

  const selectedWorkspace = workspaces.find(row => row.id === selectedId) ?? null;
  const canHostEvent = workspaces.some(row => row.verificationStatus === 'APPROVED');
  const openSection = (next: Section) => {setSection(next); setError(null);};
  const switchEvent = useCallback((eventId: string) => {setSelectedEventId(eventId); setEventStats(null); setCheckInNotice(null);}, []);
  const openEvent = useCallback((event: OrganizerEvent) => {switchEvent(event.id); setSection('Event detail');}, [switchEvent]);
  const renderEvent = useCallback(({item}: {item: OrganizerEvent}) => <EventRow event={item} onPress={openEvent} />, [openEvent]);
  const runCheckIn = async () => {
    if (!selectedId || !selectedEventId || !ticketCode.trim() || checkInBusy) return;
    setCheckInBusy(true); setCheckInNotice(null);
    try {
      const result = await checkInOrganizerTicket(selectedId, selectedEventId, ticketCode);
      setCheckInNotice(checkInMessage(result));
      if (result.ok) {setTicketCode(''); await load(selectedId);}
    } catch (cause) {setCheckInNotice(messageOf(cause));}
    finally {setCheckInBusy(false);}
  };

  const verificationMessage = selectedWorkspace?.verificationStatus === 'APPROVED' ? 'Organisation verified' : selectedWorkspace?.verificationStatus === 'PENDING' ? 'Verification in review' : selectedWorkspace?.verificationStatus === 'REJECTED' ? 'Verification needs attention' : 'Finish organiser verification';
  const eventForActions = selectedEventId ?? events[0]?.id ?? null;
  const selectedEvent = [...events, ...(dashboard?.events ?? [])].find(event => event.id === selectedEventId) ?? null;

  return <Modal visible={visible} animationType={SLIDE_MODAL_ANIMATION} presentationStyle="fullScreen" onRequestClose={onClose}>
    <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-background">
      <View className="flex-row items-center gap-3 border-b border-border/60 px-4 pb-3 pt-2">
        <Pressable accessibilityRole="button" accessibilityLabel="Back to profile" onPress={onClose} className="h-11 w-11 items-center justify-center rounded-[14px] border border-border bg-card active:opacity-70"><IconChevronLeft size={20} color={Colors.text} /></Pressable>
        <View className="flex-1"><Text accessibilityRole="header" className="font-display text-[22px] text-foreground">Dashboard</Text><Text numberOfLines={1} className="text-[12px] text-muted">{selectedWorkspace?.name ?? 'Organiser tools'}</Text></View>
        <Pressable accessibilityRole="button" accessibilityLabel="Refresh dashboard" onPress={() => {if (section === 'Overview') loadWorkspaces(); load();}} className="h-11 w-11 items-center justify-center rounded-[14px] border border-border bg-card active:opacity-70"><IconRefresh size={18} color={Colors.text} /></Pressable>
      </View>
      {workspaces.length > 1 && <ScrollView horizontal style={compactHorizontalScroll} showsHorizontalScrollIndicator={false} contentContainerClassName="items-center gap-2 px-4 py-2">{workspaces.map(workspace => <Pressable key={workspace.id} accessibilityRole="button" accessibilityState={{selected: workspace.id === selectedId}} onPress={() => {setSelectedId(workspace.id); setSelectedEventId(null); setEvents([]); setEventStats(null); setAttendeesUnavailable(false); setCheckInNotice(null);}} hitSlop={6} className={`h-8 justify-center rounded-full px-3 ${workspace.id === selectedId ? 'bg-gold' : 'border border-border bg-card'}`}><Text className={`text-[12px] font-bold ${workspace.id === selectedId ? 'text-gold-ink' : 'text-foreground'}`}>{workspace.name}</Text></Pressable>)}</ScrollView>}
      <ScrollView horizontal style={compactHorizontalScroll} showsHorizontalScrollIndicator={false} contentContainerClassName="items-center gap-2 border-b border-border/60 px-4 py-2">{sections.map(item => {const disabled = item === 'Event detail' && !selectedEventId; return <Pressable key={item} accessibilityRole="tab" accessibilityState={{selected: section === item, disabled}} disabled={disabled} onPress={() => openSection(item)} hitSlop={6} className={`h-8 justify-center rounded-full px-3 ${section === item ? 'bg-primary-dark/30' : 'bg-card'} ${disabled ? 'opacity-40' : ''}`}><Text className={`text-[12px] font-semibold ${section === item ? 'text-primary' : 'text-muted'}`}>{item}</Text></Pressable>;})}</ScrollView>

      {loading && <View className="py-8"><ActivityIndicator accessibilityLabel={`Loading ${section.toLowerCase()}`} color={Colors.gold} /></View>}
      {!!error && !loading && <View className="mx-4 mt-4 rounded-[18px] border border-border bg-card p-4"><Text accessibilityRole="alert" className="text-[14px] leading-5 text-coral">{error}</Text><Pressable accessibilityRole="button" onPress={() => section === 'Overview' ? loadWorkspaces() : load()} className="mt-3 self-start rounded-full bg-gold px-4 py-2"><Text className="text-[13px] font-bold text-gold-ink">Try again</Text></Pressable></View>}

      {!loading && !error && section === 'Overview' && dashboard && <ScrollView contentContainerClassName="gap-3 px-4 py-4 pb-10">
        <Card><Text className="text-[12px] font-semibold text-muted">Organisation status</Text><Text className="mt-1 text-[16px] font-extrabold text-foreground">{verificationMessage}</Text><Text className="mt-1 text-[12px] leading-5 text-muted">{selectedWorkspace?.verificationStatus === 'APPROVED' ? 'Your organiser tools and event controls are available.' : 'You can manage your workspace here. Paid event publishing remains locked until approval.'}</Text></Card>
        <View className="flex-row gap-3"><Card><Label>Tickets sold (next 5 events)</Label><Text className="mt-1 text-[20px] font-extrabold text-foreground">{dashboard.ticketsSold.toLocaleString()}</Text></Card><Card><Label>Checked in</Label><Text className="mt-1 text-[20px] font-extrabold text-foreground">{dashboard.checkedIn.toLocaleString()}</Text></Card></View>
        <Pressable accessibilityRole="button" accessibilityState={{disabled: !canHostEvent}} disabled={!canHostEvent} onPress={() => onHostEvent(workspaces)} className={`h-12 items-center justify-center rounded-full ${canHostEvent ? 'bg-gold' : 'bg-card'}`}><Text className={`text-[14px] font-extrabold ${canHostEvent ? 'text-gold-ink' : 'text-muted'}`}>{canHostEvent ? 'Create event' : 'Event hosting unlocks after verification'}</Text></Pressable>
        <Text className="mt-1 text-[15px] font-bold text-foreground">Upcoming events</Text>
        {dashboard.events.length ? dashboard.events.map(event => <EventRow key={event.id} event={event} onPress={openEvent} />) : <Empty>No events yet. Create your first event to start building your dashboard.</Empty>}
      </ScrollView>}

      {!loading && !error && section === 'Events' && <FlashList contentContainerStyle={LIST_CONTENT} data={events} keyExtractor={eventKey} renderItem={renderEvent} ItemSeparatorComponent={ItemGap}
        ListHeaderComponent={<View className="gap-3 pb-3"><Pressable accessibilityRole="button" accessibilityState={{disabled: !canHostEvent}} disabled={!canHostEvent} onPress={() => onHostEvent(workspaces)} className={`h-11 items-center justify-center rounded-full ${canHostEvent ? 'bg-gold' : 'bg-card'}`}><Text className={`text-[14px] font-extrabold ${canHostEvent ? 'text-gold-ink' : 'text-muted'}`}>{canHostEvent ? '＋ Create event' : 'Event hosting unlocks after verification'}</Text></Pressable><View className="flex-row rounded-[14px] border border-border bg-card p-1">{eventFilters.map(filter => <Pressable key={filter.value} accessibilityRole="tab" accessibilityState={{selected: eventFilter === filter.value}} onPress={() => setEventFilter(filter.value)} hitSlop={{top: 6, bottom: 6}} className={`h-8 flex-1 items-center justify-center rounded-[11px] ${eventFilter === filter.value ? 'bg-background' : ''}`}><Text className={`text-[12px] font-semibold ${eventFilter === filter.value ? 'text-foreground' : 'text-muted'}`}>{filter.label}</Text></Pressable>)}</View></View>}
        ListEmptyComponent={<Empty>No {eventFilter.toLowerCase()} events.</Empty>} />}

      {!loading && !error && section === 'Event detail' && selectedEvent && eventStats && <ScrollView contentContainerClassName="gap-3 px-4 py-4 pb-10">
        <Card><Text className="text-[19px] font-extrabold text-foreground">{selectedEvent.title}</Text><Text className="mt-1 text-[12px] leading-5 text-muted">{new Date(selectedEvent.startsAt).toLocaleString()} · {selectedEvent.venue}</Text><Text className="mt-3 text-[12px] font-bold text-primary">{selectedEvent.status}</Text></Card>
        <View className="flex-row gap-2"><Card><Label>Tickets sold</Label><Text className="mt-1 text-[19px] font-extrabold text-foreground">{eventStats.ticketsSold}</Text></Card><Card><Label>Checked in</Label><Text className="mt-1 text-[19px] font-extrabold text-foreground">{eventStats.checkedIn}</Text></Card>{selectedEvent.capacity != null && <Card><Label>Remaining</Label><Text className="mt-1 text-[19px] font-extrabold text-foreground">{Math.max(0, selectedEvent.capacity - eventStats.ticketsSold)}</Text></Card>}</View>
        <View className="flex-row gap-2"><Pressable accessibilityRole="button" onPress={() => setSection('Attendees')} className="h-11 flex-1 items-center justify-center rounded-full bg-gold"><Text className="font-bold text-gold-ink">Attendees</Text></Pressable><Pressable accessibilityRole="button" onPress={() => setSection('Check-in')} className="h-11 flex-1 items-center justify-center rounded-full border border-primary"><Text className="font-bold text-primary">Check-in</Text></Pressable></View>
      </ScrollView>}

      {!loading && !error && (section === 'Attendees' || section === 'Check-in') && !eventForActions && <View className="px-4 py-4"><Empty>Create or select an event to manage attendees and check-in.</Empty><Pressable accessibilityRole="button" onPress={() => openSection('Events')} className="mt-3 h-11 items-center justify-center rounded-full bg-gold"><Text className="font-bold text-gold-ink">Choose event</Text></Pressable></View>}
      {!loading && !error && section === 'Attendees' && eventForActions && attendeesUnavailable && <View className="px-4 py-4"><Empty>The attendee list is not available yet. Check-in still works.</Empty></View>}
      {!loading && !error && section === 'Attendees' && eventForActions && !attendeesUnavailable && <FlashList keyboardShouldPersistTaps="handled" contentContainerStyle={LIST_CONTENT}
        data={attendees?.items ?? noAttendees} keyExtractor={attendeeKey} renderItem={renderAttendee} ItemSeparatorComponent={ItemGap}
        ListHeaderComponent={<View className="gap-3 pb-3">
          {events.length > 1 && events.map(event => <Pressable key={event.id} accessibilityRole="button" accessibilityState={{selected: eventForActions === event.id}} onPress={() => switchEvent(event.id)} className={`rounded-xl border p-3 ${eventForActions === event.id ? 'border-primary bg-primary-dark/20' : 'border-border bg-card'}`}><Text numberOfLines={1} className="text-[13px] font-bold text-foreground">{event.title}</Text></Pressable>)}
          <TextInput accessibilityLabel="Search attendees" value={query} onChangeText={setQuery} onSubmitEditing={() => load()} placeholder="Search by name" placeholderTextColor={Colors.muted} className="h-11 rounded-[14px] border border-border bg-card px-3 text-[14px] text-foreground" />
        </View>}
        ListEmptyComponent={attendees ? <Empty>No ticket holders match this search.</Empty> : undefined} />}

      {!loading && !error && section === 'Check-in' && eventForActions && <ScrollView keyboardShouldPersistTaps="handled" contentContainerClassName="gap-3 px-4 py-4 pb-10">
        {events.length > 1 && events.map(event => <Pressable key={event.id} accessibilityRole="button" accessibilityState={{selected: eventForActions === event.id}} onPress={() => switchEvent(event.id)} className={`rounded-xl border p-3 ${eventForActions === event.id ? 'border-primary bg-primary-dark/20' : 'border-border bg-card'}`}><Text numberOfLines={1} className="text-[13px] font-bold text-foreground">{event.title}</Text></Pressable>)}
        <Card><Label>Checked in</Label><Text className="mt-1 text-[24px] font-extrabold text-foreground">{eventStats?.checkedIn ?? '—'} <Text className="text-[14px] font-semibold text-muted">/ {eventStats ? eventStats.ticketsSold : '—'}</Text></Text><View className="mt-3 h-2 overflow-hidden rounded-full bg-background"><View className="h-full rounded-full bg-gold" style={{width: `${Math.min(100, eventStats?.ticketsSold ? eventStats.checkedIn / eventStats.ticketsSold * 100 : 0)}%`}} /></View></Card>
        <Card><Text className="text-[15px] font-bold text-foreground">Enter ticket code</Text><Text className="mt-1 text-[12px] leading-5 text-muted">Scan support can be added with the backend/native scanner integration. Manual entry is available now.</Text><TextInput accessibilityLabel="Ticket QR code or ticket code" value={ticketCode} onChangeText={value => {setTicketCode(value); setCheckInNotice(null);}} autoCapitalize="characters" placeholder="Ticket code" placeholderTextColor={Colors.muted} className="mt-3 h-12 rounded-[14px] border border-border bg-background px-3 text-[15px] text-foreground" /><Pressable accessibilityRole="button" accessibilityState={{disabled: !ticketCode.trim() || checkInBusy, busy: checkInBusy}} disabled={!ticketCode.trim() || checkInBusy} onPress={runCheckIn} className="mt-3 h-11 items-center justify-center rounded-full bg-gold">{checkInBusy ? <ActivityIndicator size="small" color={Colors.goldInk} /> : <Text className="font-extrabold text-gold-ink">Check in ticket</Text>}</Pressable>{!!checkInNotice && <Text accessibilityRole="alert" className="mt-3 text-[13px] text-foreground">{checkInNotice}</Text>}</Card>
      </ScrollView>}

    </SafeAreaView>
  </Modal>;
}

const EventRow = memo(function EventRow({event, onPress}: {event: OrganizerEvent; onPress: (event: OrganizerEvent) => void}) {
  const percent = event.capacity && event.capacity > 0 ? Math.min(100, event.ticketsSold / event.capacity * 100) : 0;
  return <Pressable accessibilityRole="button" accessibilityLabel={`${event.title}, ${event.status}`} onPress={() => onPress(event)} className="rounded-[18px] border border-border bg-card p-4 active:opacity-80"><View className="flex-row items-center"><View className="flex-1"><Text numberOfLines={1} className="text-[14px] font-bold text-foreground">{event.title}</Text><Text className="mt-1 text-[12px] text-muted">{new Date(event.startsAt).toLocaleString()} · {event.venue}</Text></View><IconChevronRight size={18} color={Colors.muted} /></View><View className="mt-3 h-2 overflow-hidden rounded-full bg-background"><View className="h-full rounded-full bg-gold" style={{width: `${percent}%`}} /></View><Text className="mt-1 text-right text-[11px] text-muted">{event.capacity == null ? event.ticketsSold : `${event.ticketsSold} / ${event.capacity}`} · {event.status}</Text></Pressable>;
});

const AttendeeRow = memo(function AttendeeRow({person}: {person: OrganizerAttendee}) {
  const cancelled = person.status === 'CANCELLED' || person.status === 'EXPIRED';
  const label = person.checkedInAt || person.status === 'CHECKED_IN' ? 'Checked in' : cancelled ? (person.status === 'EXPIRED' ? 'Expired' : 'Cancelled') : 'Not checked in';
  return <Card><View className="flex-row items-center"><View className="flex-1"><Text className="text-[14px] font-bold text-foreground">{person.displayName}</Text>{!!person.ticketLabel && <Text className="mt-0.5 text-[12px] text-muted">{person.ticketLabel}</Text>}</View><Text className={`text-[11px] font-bold ${cancelled ? 'text-coral' : person.checkedInAt ? 'text-success' : 'text-muted'}`}>{label}</Text></View></Card>;
});

function Empty({children}: {children: React.ReactNode}) {return <View className="items-center rounded-[18px] border border-border bg-card px-5 py-7"><Text className="text-center text-[14px] leading-5 text-muted">{children}</Text></View>;}
