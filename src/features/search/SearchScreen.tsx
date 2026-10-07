import React, {useEffect, useRef, useState} from 'react';
import {Keyboard, Modal, Pressable, ScrollView, StatusBar, Text, TextInput, type TextInputInstance, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {cssInterop} from 'nativewind';
import IconClock from '@tabler/icons-react-native/IconClock';
import IconSearch from '@tabler/icons-react-native/IconSearch';
import IconX from '@tabler/icons-react-native/IconX';
import {Colors} from '../../Constants/Colors';
import {UserProfileModal} from '../users';
import {useRecentSearches} from './recentSearches';
import {SEARCH_MAX_LENGTH} from './searchService';
import {PersonRow, RoomRow, SectionHeader, SectionMessage} from './SearchRows';
import {useSearch} from './useSearch';
import type {PersonResult, RoomResult, SearchSection, SearchTab} from './types';

cssInterop(SafeAreaView, {className: 'style'});

export type SearchScreenProps = {
  visible: boolean;
  onClose: () => void;
  /** Tapped a room result. The room row is passed too so the caller can show a preview without refetching. */
  onOpenParty?: (partyId: string, room: RoomResult) => void;
};

const TABS: {key: SearchTab; label: string}[] = [{key: 'top', label: 'Top'}, {key: 'people', label: 'People'}, {key: 'rooms', label: 'Rooms'}];
const TOP_PEOPLE = 3;
const TOP_ROOMS = 5;

export default function SearchScreen({visible, onClose, onOpenParty}: SearchScreenProps) {
  const [input, setInput] = useState('');
  const [tab, setTab] = useState<SearchTab>('top');
  const [profile, setProfile] = useState<PersonResult | null>(null);
  const inputRef = useRef<TextInputInstance>(null);
  const search = useSearch(input, {enabled: visible});
  const {recent, remember, remove, clear} = useRecentSearches();

  useEffect(() => {
    if (visible) return;
    setInput('');
    setTab('top');
    setProfile(null);
  }, [visible]);

  const commit = () => {if (search.typedQuery) remember(search.typedQuery);};
  const openPerson = (person: PersonResult) => {commit(); Keyboard.dismiss(); setProfile(person);};
  const openRoom = (room: RoomResult) => {commit(); Keyboard.dismiss(); onOpenParty?.(room.id, room);};
  const close = () => {Keyboard.dismiss(); onClose();};

  const people = <SectionBody section={search.people} query={search.query} kind="people" onRetry={search.retry}
    render={items => items.map(person => <PersonRow key={person.id} person={person} onPress={openPerson} />)} />;
  const rooms = <SectionBody section={search.rooms} query={search.query} kind="rooms" onRetry={search.retry}
    render={items => items.map(room => <RoomRow key={room.id} room={room} onPress={openRoom} />)} />;

  const body = !search.typedQuery ? (
    <RecentSearches recent={recent} onPick={term => {setInput(term); remember(term);}} onRemove={remove} onClear={clear} />
  ) : search.query !== search.typedQuery ? (
    <SectionMessage busy title="Searching" />
  ) : tab === 'people' ? people
    : tab === 'rooms' ? rooms
    : <TopResults people={search.people} rooms={search.rooms} query={search.query} onRetry={search.retry}
      onSeeAll={setTab} onPerson={openPerson} onRoom={openRoom} />;

  return <Modal visible={visible} animationType="slide" statusBarTranslucent onRequestClose={close} onShow={() => inputRef.current?.focus()}>
    <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-background">
      <StatusBar barStyle="light-content" />
      <View className="flex-row items-center gap-3 px-5 pb-3 pt-2">
        <View className="h-12 flex-1 flex-row items-center gap-2 rounded-full border border-border bg-card px-4">
          <IconSearch size={18} color={Colors.muted} />
          <TextInput ref={inputRef} accessibilityLabel="Search" autoFocus value={input} onChangeText={setInput}
            placeholder="Search people and rooms" placeholderTextColor={Colors.muted} maxLength={SEARCH_MAX_LENGTH}
            returnKeyType="search" autoCapitalize="none" autoCorrect={false} onSubmitEditing={commit}
            selectionColor={Colors.primary} className="h-full flex-1 text-[15px] text-foreground" />
          {input ? <Pressable accessibilityRole="button" accessibilityLabel="Clear search" hitSlop={8}
            onPress={() => {setInput(''); inputRef.current?.focus();}}
            className="h-6 w-6 items-center justify-center rounded-full bg-white/10 active:opacity-60">
            <IconX size={14} color={Colors.text} />
          </Pressable> : null}
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Close search" onPress={close} hitSlop={8} className="active:opacity-60">
          <Text className="text-[15px] font-semibold text-primary">Cancel</Text>
        </Pressable>
      </View>

      {search.typedQuery ? <View accessibilityRole="tablist" className="mx-5 mb-1 flex-row rounded-full border border-border bg-card p-1">
        {TABS.map(item => {
          const active = item.key === tab;
          return <Pressable key={item.key} accessibilityRole="tab" accessibilityLabel={`${item.label} results`} accessibilityState={{selected: active}}
            onPress={() => setTab(item.key)} className={`flex-1 items-center rounded-full py-2 ${active ? 'bg-primary' : 'active:bg-white/5'}`}>
            <Text className={`text-[13px] font-bold ${active ? 'text-icon-dark' : 'text-muted'}`}>{item.label}</Text>
          </Pressable>;
        })}
      </View> : null}

      <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerClassName="pb-10">
        {body}
      </ScrollView>
    </SafeAreaView>

    {profile ? <UserProfileModal userId={profile.id} visible onClose={() => setProfile(null)}
      initial={{name: profile.name, avatarUrl: profile.avatarUrl, handle: profile.handle}}
      onBlocked={userId => {search.removePerson(userId); setProfile(null);}} /> : null}
  </Modal>;
}

type Kind = 'people' | 'rooms';

const EMPTY_COPY: Record<Kind, (query: string) => {title: string; body: string}> = {
  people: query => ({title: 'No people found', body: `Nobody matches “${query}”. Try a name or @handle.`}),
  rooms: query => ({title: 'No rooms found', body: `No live or upcoming rooms match “${query}”.`}),
};

function SectionBody<T>({section, query, kind, onRetry, render}: {
  section: SearchSection<T>; query: string; kind: Kind; onRetry: () => void; render: (items: T[]) => React.ReactNode;
}) {
  if (section.status === 'unavailable') {
    return <SectionMessage title="People search is coming soon" body="You can still find people through rooms, posts and Nearby." />;
  }
  if (section.status === 'error') {
    return <SectionMessage title={kind === 'people' ? 'Couldn’t search people' : 'Couldn’t search rooms'} body={section.error} action="Try again" onAction={onRetry} />;
  }
  if (section.status === 'loading' && !section.items.length) return <SectionMessage busy title={`Searching ${kind}`} />;
  if (section.status === 'success' && !section.items.length) {
    const copy = EMPTY_COPY[kind](query);
    return <SectionMessage title={copy.title} body={copy.body} />;
  }
  return <View className={`pt-2 ${section.status === 'loading' ? 'opacity-60' : ''}`}>{render(section.items)}</View>;
}

function TopResults({people, rooms, query, onRetry, onSeeAll, onPerson, onRoom}: {
  people: SearchSection<PersonResult>; rooms: SearchSection<RoomResult>; query: string; onRetry: () => void;
  onSeeAll: (tab: SearchTab) => void; onPerson: (person: PersonResult) => void; onRoom: (room: RoomResult) => void;
}) {
  const settled = (section: SearchSection<unknown>) => section.status === 'success' || section.status === 'unavailable';
  if (settled(people) && settled(rooms) && !people.items.length && !rooms.items.length) {
    return <SectionMessage title={`No results for “${query}”`}
      body={people.status === 'unavailable' ? 'No live or upcoming rooms match. People search is coming soon.' : 'Check the spelling or try a different name, @handle or topic.'} />;
  }
  const showPeople = people.status !== 'success' || people.items.length > 0;
  const showRooms = rooms.status !== 'success' || rooms.items.length > 0;
  return <View>
    {showPeople ? <>
      <SectionHeader title="People" onSeeAll={people.items.length > TOP_PEOPLE ? () => onSeeAll('people') : undefined} />
      <SectionBody section={{...people, items: people.items.slice(0, TOP_PEOPLE)}} query={query} kind="people" onRetry={onRetry}
        render={items => items.map(person => <PersonRow key={person.id} person={person} onPress={onPerson} />)} />
    </> : null}
    {showRooms ? <>
      <SectionHeader title="Rooms" onSeeAll={rooms.items.length > TOP_ROOMS ? () => onSeeAll('rooms') : undefined} />
      <SectionBody section={{...rooms, items: rooms.items.slice(0, TOP_ROOMS)}} query={query} kind="rooms" onRetry={onRetry}
        render={items => items.map(room => <RoomRow key={room.id} room={room} onPress={onRoom} />)} />
    </> : null}
  </View>;
}

function RecentSearches({recent, onPick, onRemove, onClear}: {
  recent: string[]; onPick: (term: string) => void; onRemove: (term: string) => void; onClear: () => void;
}) {
  if (!recent.length) {
    return <View className="items-center px-8 pt-20">
      <View className="h-16 w-16 items-center justify-center rounded-full bg-primary-dark">
        <IconSearch size={28} color={Colors.primary} />
      </View>
      <Text className="mt-4 text-center text-[17px] font-semibold text-foreground">Find people and rooms</Text>
      <Text className="mt-1.5 text-center text-[14px] leading-[20px] text-muted">Search by name, @handle, room title or topic.</Text>
    </View>;
  }
  return <View>
    <View className="flex-row items-center justify-between px-5 pb-2 pt-5">
      <Text accessibilityRole="header" className="text-[13px] font-bold uppercase tracking-[1.6px] text-muted">Recent</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Clear recent searches" onPress={onClear} hitSlop={8} className="active:opacity-60">
        <Text className="text-[13px] font-semibold text-primary">Clear all</Text>
      </Pressable>
    </View>
    {recent.map(term => <View key={term} className="flex-row items-center pl-5 pr-3">
      <Pressable accessibilityRole="button" accessibilityLabel={`Search ${term}`} onPress={() => onPick(term)}
        className="flex-1 flex-row items-center gap-3 py-3 active:opacity-60">
        <View className="h-9 w-9 items-center justify-center rounded-full bg-card"><IconClock size={16} color={Colors.muted} /></View>
        <Text numberOfLines={1} className="flex-1 text-[15px] text-text-body">{term}</Text>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${term} from recent searches`} onPress={() => onRemove(term)}
        hitSlop={8} className="h-9 w-9 items-center justify-center active:opacity-60">
        <IconX size={16} color={Colors.mutedLight} />
      </Pressable>
    </View>)}
  </View>;
}
