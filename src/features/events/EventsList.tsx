import React, {Fragment, memo, useCallback, useEffect, useRef, useState} from 'react';
import {ActivityIndicator, AppState, Pressable, RefreshControl, Text, View} from 'react-native';
import {FlashList} from '@shopify/flash-list';
import IconCalendarEvent from '@tabler/icons-react-native/IconCalendarEvent';
import IconMapPin from '@tabler/icons-react-native/IconMapPin';
import IconUsers from '@tabler/icons-react-native/IconUsers';
import IconBuildingStore from '@tabler/icons-react-native/IconBuildingStore';
import {Colors} from '../../Constants/Colors';
import EventDetailSheet from './EventDetailSheet';
import {formatEventPrice, formatEventWhen, goingLabel, messageOf} from './eventsPresentation';
import {getEvents} from './eventsService';
import type {ApiEvent} from './types';
import {listMyWorkspaces, OrganizerOnboardingScreen, type Workspace} from '../organizer';
import {NativeAdCard} from '../ads';
import RemoteImage from '../../components/RemoteImage';
import GradientBanner from '../../components/GradientBanner';

// Bottom padding clears the floating tab bar, matching the Home feed it replaces.
const LIST_CONTENT = {paddingHorizontal: 20, paddingTop: 12, paddingBottom: 130};
const eventKey = (item: ApiEvent) => item.id;
/** Every 4th row carries a native ad under the event, so it gets its own recycling pool. */
const eventType = (_item: ApiEvent, index: number) => index % 4 === 3 ? 'eventWithAd' : 'event';
const Separator = () => <View className="h-3" />;

const EventRow = memo(({event, onPress}: {event: ApiEvent; onPress: (event: ApiEvent) => void}) => {
  const cover = event.cover_url && /^https?:\/\//i.test(event.cover_url) ? event.cover_url : null;
  return <Pressable accessibilityRole="button" accessibilityLabel={`Open event ${event.title}`} onPress={() => onPress(event)}
    className="overflow-hidden rounded-[22px] border border-border bg-card">
    {!!cover && <RemoteImage uri={cover} fadeDuration={0} className="h-36 w-full bg-background" resizeMode="cover" />}
    <View className="p-4">
      <View className="flex-row items-start justify-between gap-3">
        <Text numberOfLines={2} className="flex-1 text-[16px] font-extrabold text-foreground">{event.title}</Text>
        <Text className="text-[12px] font-bold text-gold">{formatEventPrice(event)}</Text>
      </View>
      {!!event.workspace_name && <Text className="mt-0.5 text-[12px] text-muted">by {event.workspace_name}</Text>}
      <View className="mt-2 gap-1">
        <View className="flex-row items-center gap-1.5"><IconCalendarEvent size={15} color={Colors.muted} /><Text className="text-[12px] font-semibold text-muted">{formatEventWhen(event.starts_at)}</Text></View>
        {!!event.venue && <View className="flex-row items-center gap-1.5"><IconMapPin size={15} color={Colors.muted} /><Text numberOfLines={1} className="flex-1 text-[12px] font-semibold text-muted">{event.venue}</Text></View>}
        <View className="flex-row items-center gap-1.5"><IconUsers size={15} color={Colors.muted} /><Text className="text-[12px] font-semibold text-muted">{goingLabel(event)}</Text></View>
      </View>
    </View>
  </Pressable>;
});

/** The events list, embedded under Home's tab row. Loads its first page when mounted. */
type EventsListProps = {onOpenEventChat?: (conversationId?: string) => void; onOpenTickets?: (eventId?: string, ticketId?: string) => void};

const EventsList = ({onOpenEventChat, onOpenTickets}: EventsListProps) => {
  const [events, setEvents] = useState<ApiEvent[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<ApiEvent | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [organizerOnboardingOpen, setOrganizerOnboardingOpen] = useState(false);
  const [hostEventMode, setHostEventMode] = useState(false);
  const [organizerWorkspaces, setOrganizerWorkspaces] = useState<Workspace[]>([]);
  const [workspacesLoaded, setWorkspacesLoaded] = useState(false);
  const [appActive, setAppActive] = useState(AppState.currentState === 'active');
  const request = useRef(0);
  const busy = useRef(false);

  const load = useCallback(async (offset: number, mode: 'initial' | 'refresh' | 'more') => {
    const token = mode === 'more' ? request.current : ++request.current;
    if (mode === 'initial') setLoading(true); else if (mode === 'refresh') setRefreshing(true); else setLoadingMore(true);
    busy.current = true;
    setError(null);
    try {
      const page = await getEvents(offset);
      if (token !== request.current) return;
      setEvents(current => mode === 'more' ? [...current, ...page.items.filter(i => !current.some(e => e.id === i.id))] : page.items);
      setHasMore(page.hasMore);
    } catch (e) {
      if (token === request.current) setError(messageOf(e));
    } finally {
      if (token === request.current) { busy.current = false; setLoading(false); setRefreshing(false); setLoadingMore(false); }
    }
  }, []);

  useEffect(() => {
    const counter = request;
    load(0, 'initial');
    return () => { counter.current++; };
  }, [load]);

  const refreshWorkspaces = useCallback(() => {
    listMyWorkspaces().then(workspaces => {
      const organizers = workspaces.filter(workspace => workspace.status === 'ACTIVE' && (workspace.role === 'OWNER' || workspace.role === 'ADMIN'));
      setOrganizerWorkspaces(organizers);
    }).catch(() => {
      // Keep the last known review state during a transient network failure.
    }).finally(() => setWorkspacesLoaded(true));
  }, []);

  useEffect(() => { refreshWorkspaces(); }, [refreshWorkspaces]);

  const reviewPending = organizerWorkspaces.some(workspace => workspace.verificationStatus === 'PENDING');
  useEffect(() => {
    if (!reviewPending || !appActive) return;
    const interval = setInterval(refreshWorkspaces, 60_000);
    return () => clearInterval(interval);
  }, [appActive, refreshWorkspaces, reviewPending]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      setAppActive(state === 'active');
      if (state === 'active') refreshWorkspaces();
    });
    return () => subscription.remove();
  }, [refreshWorkspaces]);

  const approvedWorkspaces = organizerWorkspaces.filter(workspace => workspace.verificationStatus === 'APPROVED');

  const openOrganizerFlow = useCallback(() => {
    setHostEventMode(approvedWorkspaces.length > 0);
    setOrganizerOnboardingOpen(true);
  }, [approvedWorkspaces.length]);

  const loadMore = () => { if (hasMore && !busy.current && !error) load(events.length, 'more'); };

  const empty = loading
    ? <View className="items-center justify-center py-16"><ActivityIndicator accessibilityLabel="Loading events" color={Colors.gold} /></View>
    : error
      ? <View className="items-center justify-center px-6 py-16">
        <Text accessibilityRole="alert" className="text-center text-[14px] text-coral">{error}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Retry" onPress={() => load(0, 'initial')} className="mt-3 rounded-full bg-gold px-5 py-2.5">
          <Text className="text-[13px] font-extrabold text-gold-ink">Retry</Text>
        </Pressable>
      </View>
      : <View className="items-center justify-center px-6 py-16">
        <Text className="text-[34px]">🎟️</Text>
        <Text className="mt-2 text-[16px] font-extrabold text-foreground">No upcoming events</Text>
        <Text className="mt-1 text-center text-[13px] text-muted">Pull down to check again.</Text>
      </View>;

  const listHeader = <View className="mb-3">
    <View className="mb-3">
      <GradientBanner icon={IconBuildingStore} accessibilityLabel={approvedWorkspaces.length ? 'Host an event' : reviewPending ? 'Verification pending, refresh status' : 'Become an organiser'} accessibilityState={{disabled: !workspacesLoaded}} disabled={!workspacesLoaded} onPress={approvedWorkspaces.length ? openOrganizerFlow : reviewPending ? refreshWorkspaces : openOrganizerFlow}
        title={!workspacesLoaded ? 'Checking organiser access…' : approvedWorkspaces.length ? 'Host an event' : reviewPending ? 'Verification pending' : 'Become an organiser'}
        subtitle={!workspacesLoaded ? 'Loading your organisations' : approvedWorkspaces.length ? 'Create an event for your organisation' : reviewPending ? 'Your document is under review. Tap to refresh.' : 'Set up your organisation and create an event'} />
    </View>
  </View>;

  const openEvent = useCallback((event: ApiEvent) => { setSelected(event); setSheetOpen(true); }, []);
  const renderEvent = useCallback(({item, index}: {item: ApiEvent; index: number}) =>
    <Fragment><EventRow event={item} onPress={openEvent} />{index % 4 === 3 && <NativeAdCard />}</Fragment>, [openEvent]);

  return <>
    <FlashList
      data={events}
      keyExtractor={eventKey}
      getItemType={eventType}
      ListHeaderComponent={listHeader}
      renderItem={renderEvent}
      ItemSeparatorComponent={Separator}
      contentContainerStyle={LIST_CONTENT}
      showsVerticalScrollIndicator={false}
      ListEmptyComponent={empty}
      ListFooterComponent={loadingMore ? <ActivityIndicator accessibilityLabel="Loading more events" color={Colors.gold} className="my-4" /> : undefined}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => {load(0, 'refresh'); refreshWorkspaces();}} tintColor={Colors.gold} colors={[Colors.gold]} progressBackgroundColor={Colors.card} />}
      onEndReached={loadMore}
      onEndReachedThreshold={0.5}
    />
    <EventDetailSheet eventId={selected?.id ?? null} initial={selected} visible={sheetOpen} onClose={() => setSheetOpen(false)}
      onOpenEventChat={onOpenEventChat}
      onOpenTickets={onOpenTickets} />
    {organizerOnboardingOpen && <OrganizerOnboardingScreen mode={hostEventMode ? 'hostEvent' : 'onboarding'} workspaces={approvedWorkspaces} onEventCreated={() => {load(0, 'refresh');}} onClose={() => {setOrganizerOnboardingOpen(false); setHostEventMode(false); refreshWorkspaces();}} />}
  </>;
};

export default EventsList;
