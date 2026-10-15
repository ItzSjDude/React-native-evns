import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  Text,
  TextInput,
  View,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Colors } from '../../Constants/Colors';
import ThemedStatusBar from '../../components/ThemedStatusBar';
import { useIsFocused } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import IconAlertTriangle from '@tabler/icons-react-native/IconAlertTriangle';
import IconBallFootball from '@tabler/icons-react-native/IconBallFootball';
import IconBook from '@tabler/icons-react-native/IconBook';
import IconCoffee from '@tabler/icons-react-native/IconCoffee';
import IconDeviceGamepad2 from '@tabler/icons-react-native/IconDeviceGamepad2';
import IconFlame from '@tabler/icons-react-native/IconFlame';
import IconInfoCircle from '@tabler/icons-react-native/IconInfoCircle';
import IconLayoutGridFilled from '@tabler/icons-react-native/IconLayoutGridFilled';
import IconMapPin from '@tabler/icons-react-native/IconMapPin';
import IconMessageCircle from '@tabler/icons-react-native/IconMessageCircle';
import IconMusic from '@tabler/icons-react-native/IconMusic';
import IconPlane from '@tabler/icons-react-native/IconPlane';
import IconPlus from '@tabler/icons-react-native/IconPlus';
import IconSearch from '@tabler/icons-react-native/IconSearch';
import IconShare from '@tabler/icons-react-native/IconShare';
import IconUserHeart from '@tabler/icons-react-native/IconUserHeart';
import IconX from '@tabler/icons-react-native/IconX';
import PartyRoomCard from './PartyRoomCard';
import { PartyListSkeleton, PartyRoomCardSkeleton, PartySectionHeader, PartyStateView } from './PartyBits';
import PartyCreateSheet from './PartyCreateSheet';
import PartyRoomPreview from './PartyRoomPreview';
import { usePartySession } from './PartySessionProvider';
import { partyShareMessage } from './partyLinks';
import {
  PartyColors,
  buildPartyListItems,
  partyCategories,
  roomTitle,
  type PartyCategory,
  type PartyListItem,
} from './partyPresentation';
import {
  getPartyDiscoveryPage,
  type CreatedParty,
  type PartyCursors,
  type PartyFilter,
  type PartyRoom,
} from './partyService';

// FlashList only honours padding on the content container.
const LIST_CONTENT = { paddingHorizontal: 16, paddingBottom: 110 };
const itemKey = (item: PartyListItem) => item.key;
const itemType = (item: PartyListItem) => item.type;

const categoryIcons = {
  all: IconLayoutGridFilled,
  music: IconMusic,
  chill: IconCoffee,
  gaming: IconDeviceGamepad2,
  talk: IconMessageCircle,
  study: IconBook,
  travel: IconPlane,
  sports: IconBallFootball,
};
const errorMessage = (error: unknown) =>
  (error as { status?: number })?.status === 404
    ? 'Party rooms are unavailable right now.'
    : (error as { message?: string })?.message || 'Please try again.';

const Party = () => {
  const isFocused = useIsFocused();
  const [category, setCategory] = useState<PartyCategory>('all');
  const [filter, setFilter] = useState<PartyFilter>('all');
  const [rooms, setRooms] = useState<PartyRoom[]>([]);
  const [cursors, setCursors] = useState<PartyCursors | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedRoom, setSelectedRoom] = useState<PartyRoom | null>(null);
  const {
    session: activeAudioRoom,
    open: openAudioRoom,
    expand: expandAudioRoom,
    promptActiveParty,
  } = usePartySession();
  const [menuRoom, setMenuRoom] = useState<PartyRoom | null>(null);
  const renderItem = useCallback(({ item }: { item: PartyListItem }) => item.type === 'header'
    ? <PartySectionHeader title={item.title} count={item.count} />
    : <PartyRoomCard room={item.room} onOpen={setSelectedRoom} onMore={setMenuRoom} />, []);
  const request = useRef(0);
  const moreInFlight = useRef(false);

  const load = useCallback(
    async (
      nextCategory: PartyCategory,
      append = false,
      nextCursors?: PartyCursors,
    ) => {
      const id = append ? request.current : ++request.current;
      if (append) {
        if (moreInFlight.current) return;
        moreInFlight.current = true;
        setLoadingMore(true);
      } else {
        setLoading(true);
        setLoadingMore(false);
      }
      setError(null);
      const selected = partyCategories.find(item => item.key === nextCategory)!;
      const normalizedSearch = search.trim();
      const options = {
        category: selected.category,
        interest: selected.interest,
        ...(filter !== 'all' ? { filter } : {}),
        ...(normalizedSearch ? { search: normalizedSearch } : {}),
      };
      try {
        const result = await getPartyDiscoveryPage(options, nextCursors);
        if (id !== request.current) return;
        setRooms(previous =>
          append
            ? [
                ...previous,
                ...result.rooms.filter(
                  room => !previous.some(item => item.id === room.id),
                ),
              ]
            : result.rooms,
        );
        setCursors(result.cursors);
      } catch (cause) {
        if (id === request.current) setError(errorMessage(cause));
      } finally {
        if (id === request.current) {
          setLoading(false);
          setRefreshing(false);
          setLoadingMore(false);
        }
        if (append) moreInFlight.current = false;
      }
    },
    [filter, search],
  );

  useEffect(() => {
    const requestRef = request;
    const timer = isFocused
      ? setTimeout(() => load(category), search.trim() ? 350 : 0)
      : undefined;
    return () => {
      if (timer) clearTimeout(timer);
      requestRef.current++;
    };
  }, [category, filter, isFocused, load, search]);

  const changeCategory = (next: PartyCategory) => {
    if (next === category) return;
    setCategory(next);
    setRooms([]);
    setCursors(null);
    setLoading(true);
  };
  const onCreated = (result: CreatedParty) => {
    const host = result.participants.find(person => person.role === 'HOST');
    setCreateOpen(false);
    setSelectedRoom({
      ...result.party,
      host: {
        id: host?.userId || '',
        name: host?.name || 'You',
        avatarUrl: host?.avatarUrl || null,
      },
      participantCount: result.participants.length,
    });
    load(category);
  };
  const query = search.trim().toLowerCase();
  const visibleRooms = query
    ? rooms.filter(room =>
        [room.title, room.topic, room.host.name, ...(room.interestTags || [])]
          .join(' ')
          .toLowerCase()
          .includes(query),
      )
    : rooms;
  const items = useMemo(() => buildPartyListItems(visibleRooms), [visibleRooms]);
  const activeFilters = (category !== 'all' ? 1 : 0) + (filter !== 'all' ? 1 : 0);
  const clearFilters = () => {
    setSearch('');
    setSearchOpen(false);
    setFilter('all');
    changeCategory('all');
  };

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      {isFocused && <ThemedStatusBar />}
      <View className="px-5 pt-3">
        {/* Same size and position as the Home header. */}
        <View className="min-h-11 flex-row items-center justify-between">
          <Text
            accessibilityRole="header"
            className="font-display-semibold text-[27px] tracking-[-0.8px] text-foreground"
          >
            Party
          </Text>
          <View className="flex-row items-center gap-2">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Search parties"
              onPress={() => setSearchOpen(value => !value)}
              className="h-11 w-11 items-center justify-center rounded-full bg-card active:opacity-70"
            >
              <IconSearch size={23} color={PartyColors.text} />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Open create party"
              onPress={() => setCreateOpen(true)}
              hitSlop={{top: 8, bottom: 8}}
              className="-mr-6 h-11 w-[120px] flex-row items-center justify-center gap-1.5 rounded-l-full bg-gold pl-4 pr-5 active:opacity-70"
            >
              <IconPlus size={21} color={PartyColors.ink} />
              <Text className="text-[13px] font-bold text-text-dark">
                Create
              </Text>
            </Pressable>
          </View>
        </View>
        <Text className="mt-1 text-sm text-muted">
          Join live audio parties and meet new people
        </Text>
        {searchOpen && (
          <View className="mt-4 flex-row items-center rounded-[16px] border border-border bg-card px-3">
            <IconSearch size={18} color={PartyColors.muted} />
            <TextInput
              accessibilityLabel="Search party rooms"
              autoFocus
              value={search}
              onChangeText={setSearch}
              placeholder="Search party rooms"
              placeholderTextColor={PartyColors.muted}
              className="ml-2 h-11 flex-1 text-sm text-foreground"
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close search"
              onPress={() => {
                setSearch('');
                setSearchOpen(false);
              }}
              className="h-11 w-11 items-center justify-center"
            >
              <IconX size={18} color={PartyColors.muted} />
            </Pressable>
          </View>
        )}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerClassName="mt-4 gap-2"
        >
          {(
            [
              ['trending', 'Trending', IconFlame],
              ['following', 'Following', IconUserHeart],
              ['nearby', 'Nearby', IconMapPin],
            ] as const
          ).map(([value, label, FilterIcon]) => (
            <Pressable
              key={value}
              accessibilityRole="radio"
              accessibilityState={{ selected: filter === value }}
              // Optional filter: tapping the selected pill clears it back to all rooms.
              onPress={() => setFilter(filter === value ? 'all' : value)}
              hitSlop={{ top: 4, bottom: 4 }}
              className={
                filter === value
                  ? 'h-10 flex-row items-center gap-1.5 rounded-xl bg-gold px-3.5'
                  : 'h-10 flex-row items-center gap-1.5 rounded-xl bg-card px-3.5'
              }
            >
              <FilterIcon
                size={16}
                color={filter === value ? PartyColors.ink : PartyColors.muted}
              />
              <Text
                className={
                  filter === value
                    ? 'text-sm font-semibold text-text-dark'
                    : 'text-sm text-muted'
                }
              >
                {label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
        <View className="mb-4 mt-5">
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerClassName="gap-2"
          >
            {partyCategories.map(option => {
              const CategoryIcon = categoryIcons[option.key];
              const active = category === option.key;
              return (
                <Pressable
                  key={option.key}
                  accessibilityRole="button"
                  accessibilityLabel={option.label + ' parties'}
                  accessibilityState={{ selected: active }}
                  onPress={() => changeCategory(option.key)}
                  hitSlop={{ top: 4, bottom: 4 }}
                  className={
                    active
                      ? 'h-10 flex-row items-center gap-1.5 rounded-xl bg-gold px-3.5'
                      : 'h-10 flex-row items-center gap-1.5 rounded-xl bg-card px-3.5'
                  }
                >
                  <CategoryIcon
                    size={17}
                    color={active ? PartyColors.ink : PartyColors.text}
                  />
                  <Text
                    className={
                      active
                        ? 'text-[13px] font-bold text-text-dark'
                        : 'text-[13px] font-medium text-foreground'
                    }
                  >
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
            {activeFilters > 0 && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={'Clear ' + activeFilters + (activeFilters === 1 ? ' filter' : ' filters')}
                onPress={clearFilters}
                hitSlop={{ top: 4, bottom: 4 }}
                className="h-10 flex-row items-center gap-1.5 rounded-xl border border-border px-3.5 active:opacity-70"
              >
                <IconX size={15} color={PartyColors.muted} />
                <Text className="text-[13px] font-medium text-muted">Clear · {activeFilters}</Text>
              </Pressable>
            )}
          </ScrollView>
        </View>
      </View>
      <FlashList
        data={loading && !items.length ? [] : items}
        keyExtractor={itemKey}
        getItemType={itemType}
        renderItem={renderItem}
        contentContainerStyle={LIST_CONTENT}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              load(category);
            }}
            tintColor={Colors.gold}
            colors={[Colors.gold]}
            progressBackgroundColor={Colors.card}
          />
        }
        onEndReached={() => {
          if (
            cursors &&
            (cursors.audio || cursors.video) &&
            !loading &&
            !loadingMore
          )
            load(category, true, cursors);
        }}
        onEndReachedThreshold={0.4}
        ListHeaderComponent={
          error && items.length ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Retry party rooms"
              onPress={() => load(category)}
              className="mb-3 min-h-12 flex-row items-center gap-2 rounded-[16px] bg-coral/15 px-4 py-3"
            >
              <IconAlertTriangle size={18} color={PartyColors.coral} />
              <Text accessibilityRole="alert" className="min-w-0 flex-1 text-sm text-coral">{error}</Text>
              <Text className="text-sm font-bold text-foreground">Retry</Text>
            </Pressable>
          ) : undefined
        }
        ListEmptyComponent={
          loading ? (
            <PartyListSkeleton />
          ) : error ? (
            <PartyStateView
              kind="error"
              title="Couldn't load parties"
              message={error}
              actions={[{ label: 'Try again', accessibilityLabel: 'Retry party rooms', icon: 'refresh', primary: true, onPress: () => load(category) }]}
            />
          ) : query ? (
            <PartyStateView
              kind="search"
              title="No parties match your search"
              message="Try another name or topic, or clear the search."
              actions={[{ label: 'Clear search', onPress: () => { setSearch(''); setSearchOpen(false); }, primary: true }]}
            />
          ) : (
            <PartyStateView
              kind="empty"
              title={activeFilters ? 'No parties match these filters' : 'No parties live right now'}
              message={activeFilters ? 'Try another category or clear your filters to see everything.' : 'Be the first to start one. Pick a topic and friends can join in seconds.'}
              actions={[
                { label: 'Start a party', accessibilityLabel: 'Start a party', icon: 'plus', primary: !activeFilters, onPress: () => setCreateOpen(true) },
                ...(activeFilters ? [{ label: 'Clear filters', onPress: clearFilters, primary: true }] : []),
              ]}
            />
          )
        }
        ListFooterComponent={
          loadingMore ? (
            <PartyRoomCardSkeleton />
          ) : undefined
        }
      />
      {createOpen && (
        <PartyCreateSheet
          onClose={() => setCreateOpen(false)}
          onCreated={onCreated}
        />
      )}
      {selectedRoom && (
        <PartyRoomPreview
          room={selectedRoom}
          activePartyId={activeAudioRoom?.party.id}
          onResume={() => {
            setSelectedRoom(null);
            expandAudioRoom();
          }}
          onBlocked={() => promptActiveParty(() => setSelectedRoom(null))}
          onClose={() => setSelectedRoom(null)}
          onJoined={session => {
            setSelectedRoom(null);
            openAudioRoom(session);
          }}
        />
      )}

      {!!menuRoom && (
        <Modal
          visible
          transparent
          animationType="fade"
          onRequestClose={() => setMenuRoom(null)}
        >
          <View className="flex-1 justify-end bg-black/60">
            <Pressable
              accessibilityLabel="Dismiss party options"
              onPress={() => setMenuRoom(null)}
              className="flex-1"
            />
            <SafeAreaView
              edges={['bottom']}
              className="rounded-t-[26px] bg-card px-5 py-4"
            >
              <Text
                className="mb-2 text-lg font-bold text-foreground"
                numberOfLines={1}
              >
                {roomTitle(menuRoom)}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Room details"
                onPress={() => {
                  setSelectedRoom(menuRoom);
                  setMenuRoom(null);
                }}
                className="h-14 flex-row items-center gap-3"
              >
                <IconInfoCircle size={22} color={PartyColors.text} />
                <Text className="text-[15px] text-foreground">
                  Room details
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Share party"
                onPress={() => {
                  const room = menuRoom;
                  setMenuRoom(null);
                  partyShareMessage(room)
                    .then(message => Share.share({ message }))
                    .catch(cause =>
                      setError(cause.message || 'Could not share party.'),
                    );
                }}
                className="h-14 flex-row items-center gap-3"
              >
                <IconShare size={22} color={PartyColors.text} />
                <Text className="text-[15px] text-foreground">Share party</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Cancel"
                onPress={() => setMenuRoom(null)}
                className="h-12 items-center justify-center"
              >
                <Text className="text-[15px] font-medium text-muted">Cancel</Text>
              </Pressable>
            </SafeAreaView>
          </View>
        </Modal>
      )}
    </SafeAreaView>
  );
};

export default Party;
