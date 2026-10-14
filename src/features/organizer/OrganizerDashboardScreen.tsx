import React, {useCallback, useEffect, useRef, useState} from 'react';
import {SLIDE_MODAL_ANIMATION} from '../../Constants/NavigationTransitions';
import {ActivityIndicator, AppState, Modal, Pressable, ScrollView, Text, TextInput, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import IconChevronLeft from '@tabler/icons-react-native/IconChevronLeft';
import IconChevronRight from '@tabler/icons-react-native/IconChevronRight';
import IconRefresh from '@tabler/icons-react-native/IconRefresh';
import {Colors} from '../../Constants/Colors';
import {checkInOrganizerTicket, getOrganizerDashboard, getOrganizerEventSummary, getOrganizerPayouts, listMyWorkspaces, listOrganizerAttendees, listOrganizerEvents} from './organizerService';
import {money, messageOf} from './organizerPresentation';
import type {OrganizerAttendeePage, OrganizerDashboardSummary, OrganizerEvent, OrganizerEventSummary, OrganizerPayouts, Workspace} from './types';

type Section = 'Overview' | 'Events' | 'Event detail' | 'Attendees' | 'Check-in' | 'Payouts';
const sections: Section[] = ['Overview', 'Events', 'Event detail', 'Attendees', 'Check-in', 'Payouts'];
const eventFilters = [{label: 'Upcoming', value: 'UPCOMING'}, {label: 'Past', value: 'PAST'}, {label: 'Drafts', value: 'DRAFT'}] as const;
const compactHorizontalScroll = {flexGrow: 0};
const newIdempotencyKey = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, token => {
  const value = Math.floor(Math.random() * 16);
  return (token === 'x' ? value : (value % 4) + 8).toString(16);
});
const Card = ({children}: {children: React.ReactNode}) => <View className="rounded-[20px] border border-border bg-card p-4">{children}</View>;
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
  const [eventSummary, setEventSummary] = useState<OrganizerEventSummary | null>(null);
  const [attendees, setAttendees] = useState<OrganizerAttendeePage | null>(null);
  const [payouts, setPayouts] = useState<OrganizerPayouts | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [ticketCode, setTicketCode] = useState('');
  const [checkInBusy, setCheckInBusy] = useState(false);
  const [checkInNotice, setCheckInNotice] = useState<string | null>(null);
  const [checkInKey, setCheckInKey] = useState('');
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
        setEventSummary(await getOrganizerEventSummary(id, selectedEventId));
      }
      else if (section === 'Attendees' || section === 'Check-in') {
        const targetEvent = selectedEventId;
        if (!targetEvent) {
          const result = await listOrganizerEvents(id, 'UPCOMING');
          setEvents(result.items);
          if (result.items[0]) setSelectedEventId(result.items[0].id);
          return;
        }
        if (section === 'Attendees') setAttendees(await listOrganizerAttendees(id, targetEvent, {search: query}));
        else setEventSummary(await getOrganizerEventSummary(id, targetEvent));
      } else if (section === 'Payouts') setPayouts(await getOrganizerPayouts(id));
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
  const switchEvent = (eventId: string) => {setSelectedEventId(eventId); setCheckInKey(''); setCheckInNotice(null);};
  const runCheckIn = async () => {
    if (!selectedId || !selectedEventId || !ticketCode.trim() || checkInBusy) return;
    const key = checkInKey || newIdempotencyKey();
    setCheckInKey(key); setCheckInBusy(true); setCheckInNotice(null);
    try {
      const result = await checkInOrganizerTicket(selectedId, selectedEventId, ticketCode.trim(), key);
      setCheckInNotice(`${result.attendeeName} · ${result.ticketLabel} checked in`);
      setTicketCode(''); setCheckInKey('');
      await load(selectedId);
    } catch (cause) {setCheckInNotice(messageOf(cause));}
    finally {setCheckInBusy(false);}
  };

  const verificationMessage = selectedWorkspace?.verificationStatus === 'APPROVED' ? 'Organisation verified' : selectedWorkspace?.verificationStatus === 'PENDING' ? 'Verification in review' : selectedWorkspace?.verificationStatus === 'REJECTED' ? 'Verification needs attention' : 'Finish organiser verification';
  const eventForActions = selectedEventId ?? events[0]?.id ?? null;

  return <Modal visible={visible} animationType={SLIDE_MODAL_ANIMATION} presentationStyle="fullScreen" onRequestClose={onClose}>
    <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-background">
      <View className="flex-row items-center gap-3 border-b border-border/60 px-4 pb-3 pt-2">
        <Pressable accessibilityRole="button" accessibilityLabel="Back to profile" onPress={onClose} className="h-11 w-11 items-center justify-center rounded-[14px] border border-border bg-card active:opacity-70"><IconChevronLeft size={20} color={Colors.text} /></Pressable>
        <View className="flex-1"><Text accessibilityRole="header" className="font-display text-[22px] text-foreground">Dashboard</Text><Text numberOfLines={1} className="text-[12px] text-muted">{selectedWorkspace?.name ?? 'Organiser tools'}</Text></View>
        <Pressable accessibilityRole="button" accessibilityLabel="Refresh dashboard" onPress={() => {if (section === 'Overview') loadWorkspaces(); load();}} className="h-11 w-11 items-center justify-center rounded-[14px] border border-border bg-card active:opacity-70"><IconRefresh size={18} color={Colors.text} /></Pressable>
      </View>
      {workspaces.length > 1 && <ScrollView horizontal style={compactHorizontalScroll} showsHorizontalScrollIndicator={false} contentContainerClassName="items-center gap-2 px-4 py-2">{workspaces.map(workspace => <Pressable key={workspace.id} accessibilityRole="button" accessibilityState={{selected: workspace.id === selectedId}} onPress={() => {setSelectedId(workspace.id); setSelectedEventId(null); setEvents([]); setCheckInKey(''); setCheckInNotice(null);}} hitSlop={6} className={`h-8 justify-center rounded-full px-3 ${workspace.id === selectedId ? 'bg-gold' : 'border border-border bg-card'}`}><Text className={`text-[12px] font-bold ${workspace.id === selectedId ? 'text-gold-ink' : 'text-foreground'}`}>{workspace.name}</Text></Pressable>)}</ScrollView>}
      <ScrollView horizontal style={compactHorizontalScroll} showsHorizontalScrollIndicator={false} contentContainerClassName="items-center gap-2 border-b border-border/60 px-4 py-2">{sections.map(item => {const disabled = item === 'Event detail' && !selectedEventId; return <Pressable key={item} accessibilityRole="tab" accessibilityState={{selected: section === item, disabled}} disabled={disabled} onPress={() => openSection(item)} hitSlop={6} className={`h-8 justify-center rounded-full px-3 ${section === item ? 'bg-primary-dark/30' : 'bg-card'} ${disabled ? 'opacity-40' : ''}`}><Text className={`text-[12px] font-semibold ${section === item ? 'text-primary' : 'text-muted'}`}>{item}</Text></Pressable>;})}</ScrollView>

      {loading && <View className="py-8"><ActivityIndicator accessibilityLabel={`Loading ${section.toLowerCase()}`} color={Colors.gold} /></View>}
      {!!error && !loading && <View className="mx-4 mt-4 rounded-[18px] border border-border bg-card p-4"><Text accessibilityRole="alert" className="text-[14px] leading-5 text-coral">{error}</Text><Pressable accessibilityRole="button" onPress={() => section === 'Overview' ? loadWorkspaces() : load()} className="mt-3 self-start rounded-full bg-gold px-4 py-2"><Text className="text-[13px] font-bold text-gold-ink">Try again</Text></Pressable></View>}

      {!loading && !error && section === 'Overview' && dashboard && <ScrollView contentContainerClassName="gap-3 px-4 py-4 pb-10">
        <Card><Text className="text-[12px] font-semibold text-muted">Organisation status</Text><Text className="mt-1 text-[16px] font-extrabold text-foreground">{verificationMessage}</Text><Text className="mt-1 text-[12px] leading-5 text-muted">{dashboard.verificationStatus === 'APPROVED' ? 'Your organiser tools and event controls are available.' : 'You can manage your workspace here. Paid event publishing remains locked until approval.'}</Text></Card>
        <View className="flex-row gap-3"><Card><Label>Tickets sold</Label><Text className="mt-1 text-[20px] font-extrabold text-foreground">{dashboard.ticketsSold.toLocaleString()}</Text></Card><Card><Label>Checked in</Label><Text className="mt-1 text-[20px] font-extrabold text-foreground">{dashboard.checkedIn.toLocaleString()}</Text></Card></View>
        <Card><Label>Gross revenue</Label><Text className="mt-1 text-[22px] font-extrabold text-foreground">{money(dashboard.grossRevenueMinor, dashboard.currency)}</Text><Text className="mt-1 text-[12px] text-muted">Settled ticket sales</Text></Card>
        <Card><Label>Next payout</Label><Text className="mt-1 text-[20px] font-extrabold text-foreground">{dashboard.nextPayoutMinor == null ? '—' : money(dashboard.nextPayoutMinor, dashboard.currency)}</Text><Text className="mt-1 text-[12px] text-muted">{dashboard.nextPayoutAt ? new Date(dashboard.nextPayoutAt).toLocaleDateString() : 'No payout scheduled'}</Text></Card>
        <Pressable accessibilityRole="button" accessibilityState={{disabled: !canHostEvent}} disabled={!canHostEvent} onPress={() => onHostEvent(workspaces)} className={`h-12 items-center justify-center rounded-full ${canHostEvent ? 'bg-gold' : 'bg-card'}`}><Text className={`text-[14px] font-extrabold ${canHostEvent ? 'text-gold-ink' : 'text-muted'}`}>{canHostEvent ? 'Create event' : 'Event hosting unlocks after verification'}</Text></Pressable>
        <Text className="mt-1 text-[15px] font-bold text-foreground">Upcoming events</Text>
        {dashboard.events.length ? dashboard.events.map(event => <EventRow key={event.id} event={event} onPress={() => {switchEvent(event.id); setSection('Event detail');}} />) : <Empty>No events yet. Create your first event to start building your dashboard.</Empty>}
        {!!dashboard.actionItems.length && <><Text className="mt-2 text-[15px] font-bold text-foreground">Action needed</Text>{dashboard.actionItems.map((item, index) => <Card key={`${item.type}-${index}`}><Text className="text-[14px] font-semibold text-foreground">{item.type === 'VERIFICATION' ? verificationMessage : item.type === 'REFUND_REQUEST' ? `${item.count ?? 0} refund requests waiting` : 'Add a check-in staff member'}</Text>{!!item.eventTitle && <Text className="mt-1 text-[12px] text-muted">{item.eventTitle}</Text>}</Card>)}</>}
      </ScrollView>}

      {!loading && !error && section === 'Events' && <ScrollView contentContainerClassName="gap-3 px-4 py-4 pb-10"><Pressable accessibilityRole="button" accessibilityState={{disabled: !canHostEvent}} disabled={!canHostEvent} onPress={() => onHostEvent(workspaces)} className={`h-11 items-center justify-center rounded-full ${canHostEvent ? 'bg-gold' : 'bg-card'}`}><Text className={`text-[14px] font-extrabold ${canHostEvent ? 'text-gold-ink' : 'text-muted'}`}>{canHostEvent ? '＋ Create event' : 'Event hosting unlocks after verification'}</Text></Pressable><View className="flex-row rounded-[14px] border border-border bg-card p-1">{eventFilters.map(filter => <Pressable key={filter.value} accessibilityRole="tab" accessibilityState={{selected: eventFilter === filter.value}} onPress={() => setEventFilter(filter.value)} hitSlop={{top: 6, bottom: 6}} className={`h-8 flex-1 items-center justify-center rounded-[11px] ${eventFilter === filter.value ? 'bg-background' : ''}`}><Text className={`text-[12px] font-semibold ${eventFilter === filter.value ? 'text-foreground' : 'text-muted'}`}>{filter.label}</Text></Pressable>)}</View>{events.map(event => <EventRow key={event.id} event={event} onPress={() => {switchEvent(event.id); setSection('Event detail');}} />)}{!events.length && <Empty>No {eventFilter.toLowerCase()} events.</Empty>}</ScrollView>}

      {!loading && !error && section === 'Event detail' && eventSummary && <ScrollView contentContainerClassName="gap-3 px-4 py-4 pb-10">
        <Card><Text className="text-[19px] font-extrabold text-foreground">{eventSummary.event.title}</Text><Text className="mt-1 text-[12px] leading-5 text-muted">{new Date(eventSummary.event.startsAt).toLocaleString()} · {eventSummary.event.venue}</Text><Text className="mt-3 text-[12px] font-bold text-primary">{eventSummary.event.status}</Text></Card>
        <View className="flex-row gap-2"><Card><Label>Tickets sold</Label><Text className="mt-1 text-[19px] font-extrabold text-foreground">{eventSummary.ticketsSold}</Text></Card><Card><Label>Remaining</Label><Text className="mt-1 text-[19px] font-extrabold text-foreground">{Math.max(0, eventSummary.event.capacity - eventSummary.ticketsSold)}</Text></Card></View>
        <Card><Label>Revenue</Label><Text className="mt-1 text-[21px] font-extrabold text-foreground">{money(eventSummary.grossRevenueMinor, eventSummary.currency)}</Text></Card>
        <Text className="mt-2 text-[15px] font-bold text-foreground">Ticket types</Text>{eventSummary.ticketTypes.map((type, index) => <Card key={`${type.label}-${index}`}><View className="flex-row items-center"><View className="flex-1"><Text className="text-[14px] font-bold text-foreground">{type.label}</Text><Text className="mt-1 text-[12px] text-muted">{type.sold} / {type.capacity} sold</Text></View><Text className="text-[14px] font-bold text-foreground">{money(type.priceMinor, type.currency)}</Text></View></Card>)}
        <View className="flex-row gap-2"><Pressable accessibilityRole="button" onPress={() => setSection('Attendees')} className="h-11 flex-1 items-center justify-center rounded-full bg-gold"><Text className="font-bold text-gold-ink">Attendees</Text></Pressable><Pressable accessibilityRole="button" onPress={() => setSection('Check-in')} className="h-11 flex-1 items-center justify-center rounded-full border border-primary"><Text className="font-bold text-primary">Check-in</Text></Pressable></View>
      </ScrollView>}

      {!loading && !error && (section === 'Attendees' || section === 'Check-in') && !eventForActions && <View className="px-4 py-4"><Empty>Create or select an event to manage attendees and check-in.</Empty><Pressable accessibilityRole="button" onPress={() => openSection('Events')} className="mt-3 h-11 items-center justify-center rounded-full bg-gold"><Text className="font-bold text-gold-ink">Choose event</Text></Pressable></View>}
      {!loading && !error && section === 'Attendees' && eventForActions && <ScrollView keyboardShouldPersistTaps="handled" contentContainerClassName="gap-3 px-4 py-4 pb-10">
        {events.length > 1 && events.map(event => <Pressable key={event.id} accessibilityRole="button" accessibilityState={{selected: eventForActions === event.id}} onPress={() => switchEvent(event.id)} className={`rounded-xl border p-3 ${eventForActions === event.id ? 'border-primary bg-primary-dark/20' : 'border-border bg-card'}`}><Text numberOfLines={1} className="text-[13px] font-bold text-foreground">{event.title}</Text></Pressable>)}
        <TextInput accessibilityLabel="Search attendees" value={query} onChangeText={setQuery} onSubmitEditing={() => load()} placeholder="Search name or ticket number" placeholderTextColor={Colors.muted} className="h-11 rounded-[14px] border border-border bg-card px-3 text-[14px] text-foreground" />
        {attendees?.items.map(person => <Card key={person.id}><View className="flex-row items-center"><View className="flex-1"><Text className="text-[14px] font-bold text-foreground">{person.displayName}</Text><Text className="mt-0.5 text-[12px] text-muted">{person.ticketLabel} · {person.orderReference}</Text></View><View className="items-end"><Text className="text-[13px] font-bold text-foreground">{money(person.amountMinor, person.currency)}</Text><Text className={`mt-1 text-[11px] font-bold ${person.ticketStatus === 'REFUNDED' || person.ticketStatus === 'CANCELLED' ? 'text-coral' : person.checkedInAt ? 'text-success' : 'text-muted'}`}>{person.checkedInAt ? 'Checked in' : person.ticketStatus}</Text></View></View></Card>)}
        {attendees && !attendees.items.length && <Empty>No ticket holders match this search.</Empty>}
      </ScrollView>}

      {!loading && !error && section === 'Check-in' && eventForActions && <ScrollView keyboardShouldPersistTaps="handled" contentContainerClassName="gap-3 px-4 py-4 pb-10">
        {events.length > 1 && events.map(event => <Pressable key={event.id} accessibilityRole="button" accessibilityState={{selected: eventForActions === event.id}} onPress={() => switchEvent(event.id)} className={`rounded-xl border p-3 ${eventForActions === event.id ? 'border-primary bg-primary-dark/20' : 'border-border bg-card'}`}><Text numberOfLines={1} className="text-[13px] font-bold text-foreground">{event.title}</Text></Pressable>)}
        <Card><Label>Checked in</Label><Text className="mt-1 text-[24px] font-extrabold text-foreground">{eventSummary?.checkedIn ?? '—'} <Text className="text-[14px] font-semibold text-muted">/ {eventSummary?.event.capacity ?? '—'}</Text></Text><View className="mt-3 h-2 overflow-hidden rounded-full bg-background"><View className="h-full rounded-full bg-gold" style={{width: `${Math.min(100, eventSummary?.event.capacity ? eventSummary.checkedIn / eventSummary.event.capacity * 100 : 0)}%`}} /></View></Card>
        <Card><Text className="text-[15px] font-bold text-foreground">Enter ticket code</Text><Text className="mt-1 text-[12px] leading-5 text-muted">Scan support can be added with the backend/native scanner integration. Manual entry is available now.</Text><TextInput accessibilityLabel="Ticket QR code or ticket code" value={ticketCode} onChangeText={value => {setTicketCode(value); setCheckInKey(''); setCheckInNotice(null);}} autoCapitalize="characters" placeholder="Ticket code" placeholderTextColor={Colors.muted} className="mt-3 h-12 rounded-[14px] border border-border bg-background px-3 text-[15px] text-foreground" /><Pressable accessibilityRole="button" accessibilityState={{disabled: !ticketCode.trim() || checkInBusy, busy: checkInBusy}} disabled={!ticketCode.trim() || checkInBusy} onPress={runCheckIn} className="mt-3 h-11 items-center justify-center rounded-full bg-gold">{checkInBusy ? <ActivityIndicator size="small" color={Colors.goldInk} /> : <Text className="font-extrabold text-gold-ink">Check in ticket</Text>}</Pressable>{!!checkInNotice && <Text accessibilityRole="alert" className="mt-3 text-[13px] text-foreground">{checkInNotice}</Text>}</Card>
      </ScrollView>}

      {!loading && !error && section === 'Payouts' && payouts && <ScrollView contentContainerClassName="gap-3 px-4 py-4 pb-10">
        <Card><Label>Next payout</Label><Text className="mt-1 text-[25px] font-extrabold text-foreground">{payouts.next ? money(payouts.next.amountMinor, payouts.next.currency) : 'No payout scheduled'}</Text>{payouts.next && <Text className="mt-1 text-[12px] text-muted">Releases {new Date(payouts.next.releaseAt).toLocaleDateString()} · {payouts.next.maskedAccount}</Text>}</Card>
        <Text className="mt-2 text-[15px] font-bold text-foreground">Payout history</Text>{payouts.history.map(item => <Card key={item.id}><View className="flex-row items-center"><View className="flex-1"><Text className="text-[14px] font-bold text-foreground">{item.eventTitle}</Text><Text className="mt-1 text-[12px] text-muted">{item.status === 'PAID' && item.paidAt ? `Paid ${new Date(item.paidAt).toLocaleDateString()}` : `${item.status} · releases ${new Date(item.releaseAt).toLocaleDateString()}`}</Text></View><Text className="text-[14px] font-bold text-foreground">{money(item.amountMinor, item.currency)}</Text></View></Card>)}{!payouts.history.length && <Empty>No payout history yet.</Empty>}
      </ScrollView>}
    </SafeAreaView>
  </Modal>;
}

function EventRow({event, onPress}: {event: OrganizerEvent; onPress: () => void}) {
  const percent = event.capacity > 0 ? Math.min(100, event.ticketsSold / event.capacity * 100) : 0;
  return <Pressable accessibilityRole="button" accessibilityLabel={`${event.title}, ${event.status}`} onPress={onPress} className="rounded-[18px] border border-border bg-card p-4 active:opacity-80"><View className="flex-row items-center"><View className="flex-1"><Text numberOfLines={1} className="text-[14px] font-bold text-foreground">{event.title}</Text><Text className="mt-1 text-[12px] text-muted">{new Date(event.startsAt).toLocaleString()} · {event.venue}</Text></View><IconChevronRight size={18} color={Colors.muted} /></View><View className="mt-3 h-2 overflow-hidden rounded-full bg-background"><View className="h-full rounded-full bg-gold" style={{width: `${percent}%`}} /></View><Text className="mt-1 text-right text-[11px] text-muted">{event.ticketsSold} / {event.capacity} · {event.status}</Text></Pressable>;
}

function Empty({children}: {children: React.ReactNode}) {return <View className="items-center rounded-[18px] border border-border bg-card px-5 py-7"><Text className="text-center text-[14px] leading-5 text-muted">{children}</Text></View>;}
