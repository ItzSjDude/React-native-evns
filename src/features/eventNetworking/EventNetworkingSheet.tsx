import React, {useEffect, useState} from 'react';
import {ActivityIndicator, Pressable, Text, TextInput, View} from 'react-native';
import BottomSheet, {SheetButton} from '../../components/BottomSheet';
import {Colors} from '../../Constants/Colors';
import {UserProfileModal, useViewerId} from '../users';
import AttendeeCard from './AttendeeCard';
import {
  connectWithAttendee, disconnectFromAttendee, getNetworkingAttendees, getNetworkingConnections, optOutOfNetworking,
  saveMyNetworkingProfile,
} from './eventNetworkingService';
import {useMyNetworkingProfile, usePagedList} from './hooks';
import NetworkingProfileForm from './NetworkingProfileForm';
import {connectionStateOf, ISSUE_COPY, issueOf, networkingMessage} from './networkingPresentation';
import {NETWORKING_GOALS, type NetworkingAttendee, type NetworkingConnection, type NetworkingGoal, type NetworkingProfileInput} from './types';

export type EventNetworkingSheetProps = {
  eventId: string;
  eventTitle?: string | null;
  visible: boolean;
  onClose: () => void;
};

type View_ = 'home' | 'edit' | 'leave';
type Tab = 'people' | 'connections';
type ListView = {loading: boolean; loaded: boolean; error: unknown; hasMore: boolean; reload: () => void; loadMore: () => void};

const asAttendee = (c: NetworkingConnection): NetworkingAttendee =>
  ({id: c.userId, name: c.name, avatarUrl: c.avatarUrl, goals: c.goals, interests: c.interests, intro: c.intro});

const Notice = ({title, body, children}: {title: string; body: string; children?: React.ReactNode}) =>
  <View className="items-center rounded-2xl border border-border bg-card px-5 py-8">
    <Text accessibilityRole="header" className="text-center text-[16px] font-extrabold text-foreground">{title}</Text>
    <Text className="mt-1 text-center text-[13px] leading-5 text-muted">{body}</Text>
    {children}
  </View>;

/**
 * Consent-based "Meet people" flow for one event: join (explicit opt-in), browse attendees who also joined,
 * connect, edit, or leave. Everything shown comes from the networking endpoints; nothing is cached globally.
 */
export default function EventNetworkingSheet({eventId, eventTitle, visible, onClose}: EventNetworkingSheetProps) {
  const viewerId = useViewerId();
  const me = useMyNetworkingProfile(eventId, visible);
  const [view, setView] = useState<View_>('home');
  const [tab, setTab] = useState<Tab>('people');
  const [goal, setGoal] = useState<NetworkingGoal | undefined>();
  const [interestDraft, setInterestDraft] = useState('');
  const [interest, setInterest] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [leftNotice, setLeftNotice] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [profileOf, setProfileOf] = useState<NetworkingAttendee | null>(null);

  useEffect(() => {
    setView('home'); setTab('people'); setGoal(undefined); setInterestDraft(''); setInterest('');
    setFormError(null); setLeftNotice(false); setActionError(null); setProfileOf(null);
  }, [visible, eventId]);

  const joined = !!me.profile;
  const attendees = usePagedList(
    offset => getNetworkingAttendees(eventId, {goal, interest}, offset), a => a.id, visible && joined, `${eventId}|${goal ?? ''}|${interest}`);
  // ponytail: the first 50 connections are enough to label cards; page this if events routinely exceed that.
  const connections = usePagedList(offset => getNetworkingConnections(eventId, offset), c => c.userId, visible && joined, eventId);

  const submitProfile = async (input: NetworkingProfileInput) => {
    setSaving(true); setFormError(null);
    try {
      me.setProfile(await saveMyNetworkingProfile(eventId, input));
      setView('home'); setLeftNotice(false);
    } catch (error) {
      setFormError(networkingMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const leave = async () => {
    setSaving(true); setFormError(null);
    try {
      await optOutOfNetworking(eventId);
      me.setProfile(null);
      setView('home'); setLeftNotice(true);
    } catch (error) {
      setFormError(networkingMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const act = async (userId: string, run: () => Promise<unknown>) => {
    setBusyId(userId); setActionError(null);
    try {
      await run();
      connections.reload();
    } catch (error) {
      setActionError(networkingMessage(error, 'person'));
      if (issueOf(error, 'person') === 'gone') { attendees.reload(); connections.reload(); }
    } finally {
      setBusyId(null);
    }
  };

  const renderCard = (person: NetworkingAttendee) =>
    <AttendeeCard key={person.id} attendee={person} busy={busyId === person.id}
      state={connectionStateOf(person.id, viewerId, connections.items)}
      onConnect={() => act(person.id, () => connectWithAttendee(eventId, person.id))}
      onDisconnect={() => act(person.id, () => disconnectFromAttendee(eventId, person.id))}
      onOpenProfile={() => setProfileOf(person)} />;

  const renderList = (list: ListView, items: NetworkingAttendee[], empty: string) => <>
    {items.map(renderCard)}
    {list.loading && <ActivityIndicator accessibilityLabel="Loading people" color={Colors.gold} className="my-6" />}
    {!!list.error && !list.loading && <Pressable accessibilityRole="button" accessibilityLabel="Retry loading people" onPress={list.reload} className="my-3 rounded-[16px] bg-card p-4 active:opacity-70">
      <Text className="text-sm text-coral">{networkingMessage(list.error)} Tap to retry.</Text>
    </Pressable>}
    {list.loaded && !list.loading && !list.error && !items.length && <Text className="py-8 text-center text-[13px] text-muted">{empty}</Text>}
    {!list.loading && !list.error && list.hasMore && items.length > 0 && <Pressable accessibilityRole="button" accessibilityLabel="Load more people" onPress={list.loadMore} className="items-center p-[15px] active:opacity-70">
      <Text className="text-sm font-extrabold text-gold">Load more</Text>
    </Pressable>}
  </>;

  const fatal = me.error ? issueOf(me.error) : null;
  const eventIssue = fatal === 'unavailable' || fatal === 'not_ticketed';

  const body = () => {
    if (!me.loaded || (me.loading && !me.profile)) return <ActivityIndicator accessibilityLabel="Loading networking" color={Colors.gold} className="my-8" />;
    if (eventIssue) return <Notice title={fatal === 'not_ticketed' ? 'Ticket needed' : 'Networking unavailable'} body={ISSUE_COPY[fatal!]} />;
    if (me.error) return <Notice title="Could not load" body={networkingMessage(me.error)}>
      <Pressable accessibilityRole="button" accessibilityLabel="Retry" onPress={me.reload} className="mt-3 rounded-full bg-primary-dark px-4 py-2"><Text className="text-[13px] font-bold text-purple-soft">Retry</Text></Pressable>
    </Notice>;

    if (!me.profile) return <>
      {leftNotice && <Text className="mb-3 rounded-2xl bg-card p-3 text-[13px] leading-5 text-text-body">
        You left networking. Your profile and connections for this event were removed. Your ticket and the event chat are unchanged.
      </Text>}
      <NetworkingProfileForm initial={null} submitting={saving} error={formError} onSubmit={submitProfile} />
    </>;

    if (view === 'edit') return <NetworkingProfileForm initial={me.profile} submitting={saving} error={formError} onSubmit={submitProfile} onCancel={() => {setView('home'); setFormError(null);}} />;

    if (view === 'leave') return <Notice title="Leave event networking?" body="Your networking profile and your connections for this event will be removed right away. Your ticket and the event chat are not affected.">
      {!!formError && <Text accessibilityRole="alert" className="mt-2 text-center text-[13px] text-coral">{formError}</Text>}
      <View className="mt-4 w-full">
        <SheetButton label="Leave networking" variant="destructive" busy={saving} onPress={leave} />
        <SheetButton label="Stay" variant="ghost" disabled={saving} onPress={() => {setView('home'); setFormError(null);}} />
      </View>
    </Notice>;

    return <>
      <View className="mb-3 flex-row gap-2">
        {(['people', 'connections'] as Tab[]).map(value => <Pressable key={value} accessibilityRole="button" accessibilityLabel={value === 'people' ? 'People' : 'Connections'} accessibilityState={{selected: tab === value}} onPress={() => setTab(value)}
          className={`h-9 items-center justify-center rounded-full px-4 active:opacity-70 ${tab === value ? 'bg-gold' : 'bg-card'}`}>
          <Text className={`text-[13px] font-semibold ${tab === value ? 'text-text-dark' : 'text-muted'}`}>{value === 'people' ? 'People' : 'Connections'}</Text>
        </Pressable>)}
      </View>
      {!!actionError && <Text accessibilityRole="alert" className="mb-3 rounded-2xl bg-card p-3 text-[13px] leading-5 text-coral">{actionError}</Text>}
      {tab === 'people' && <>
        <View className="mb-2 flex-row flex-wrap gap-2">
          {[{value: undefined, label: 'All goals'}, ...NETWORKING_GOALS].map(({value, label}) => {
            const selected = goal === value;
            return <Pressable key={label} accessibilityRole="button" accessibilityLabel={`Filter: ${label}`} accessibilityState={{selected}} onPress={() => setGoal(value)}
              className={`h-8 items-center justify-center rounded-full px-3 active:opacity-70 ${selected ? 'bg-gold' : 'bg-card'}`}>
              <Text className={`text-[12px] font-semibold ${selected ? 'text-text-dark' : 'text-muted'}`}>{label}</Text>
            </Pressable>;
          })}
        </View>
        <TextInput accessibilityLabel="Filter by interest" value={interestDraft} onChangeText={setInterestDraft} onSubmitEditing={() => setInterest(interestDraft.trim())} onBlur={() => setInterest(interestDraft.trim())}
          maxLength={40} returnKeyType="search" placeholder="Filter by interest" placeholderTextColor={Colors.muted} autoCorrect={false}
          className="mb-3 h-10 rounded-xl border border-border bg-card px-3 text-[14px] text-foreground" />
        {renderList(attendees, attendees.items, goal || interest ? 'No one matches these filters yet.' : 'No one else has joined yet. Check back closer to the event.')}
      </>}
      {tab === 'connections' && renderList(connections, connections.items.map(asAttendee), 'No connections yet. Tap Connect on someone you would like to meet.')}
      <View className="mt-4">
        <SheetButton label="Edit my networking profile" variant="ghost" onPress={() => {setFormError(null); setView('edit');}} />
        <SheetButton label="Leave networking" variant="danger" onPress={() => {setFormError(null); setView('leave');}} />
      </View>
    </>;
  };

  return <>
    <BottomSheet visible={visible} onClose={onClose} title="Meet people" subtitle={eventTitle ?? null} maxHeight={0.9} dismissible={!saving}>
      {body()}
    </BottomSheet>
    {!!profileOf && <UserProfileModal userId={profileOf.id} initial={{name: profileOf.name, avatarUrl: profileOf.avatarUrl}} visible onClose={() => setProfileOf(null)}
      onBlocked={() => {attendees.reload(); connections.reload();}} />}
  </>;
}
