import React, {useCallback, useEffect, useRef, useState} from 'react';
import {ActivityIndicator, FlatList, Modal, Pressable, RefreshControl, ScrollView, Share, StatusBar, Text, TextInput, View} from 'react-native';
import {useIsFocused} from '@react-navigation/native';
import {SafeAreaView} from 'react-native-safe-area-context';
import IconBallFootball from '@tabler/icons-react-native/IconBallFootball';
import IconBook from '@tabler/icons-react-native/IconBook';
import IconCoffee from '@tabler/icons-react-native/IconCoffee';
import IconDeviceGamepad2 from '@tabler/icons-react-native/IconDeviceGamepad2';
import IconHeadphones from '@tabler/icons-react-native/IconHeadphones';
import IconInfoCircle from '@tabler/icons-react-native/IconInfoCircle';
import IconLayoutGridFilled from '@tabler/icons-react-native/IconLayoutGridFilled';
import IconMessageCircle from '@tabler/icons-react-native/IconMessageCircle';
import IconMusic from '@tabler/icons-react-native/IconMusic';
import IconPlane from '@tabler/icons-react-native/IconPlane';
import IconPlus from '@tabler/icons-react-native/IconPlus';
import IconSearch from '@tabler/icons-react-native/IconSearch';
import IconShare from '@tabler/icons-react-native/IconShare';
import IconX from '@tabler/icons-react-native/IconX';
import PartyRoomCard from './PartyRoomCard';
import PartyCreateSheet from './PartyCreateSheet';
import PartyRoomPreview from './PartyRoomPreview';
import {usePartySession} from './PartySessionProvider';
import {partyShareMessage} from './partyLinks';
import {PartyColors, partyCategories, roomTitle, type PartyCategory} from './partyPresentation';
import {getPartyDiscoveryPage, type CreatedParty, type PartyCursors, type PartyFilter, type PartyRoom} from './partyService';

const categoryIcons = {
  all: IconLayoutGridFilled, music: IconMusic, chill: IconCoffee,
  gaming: IconDeviceGamepad2, talk: IconMessageCircle, study: IconBook,
  travel: IconPlane, sports: IconBallFootball,
};
const errorMessage = (error: unknown) => (error as {status?: number})?.status === 404 ? 'Party rooms are unavailable right now.' : (error as {message?: string})?.message || 'Please try again.';

const Party = () => {
  const isFocused = useIsFocused();
  const [category, setCategory] = useState<PartyCategory>('all');
  const [filter,setFilter]=useState<PartyFilter>('all');
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
  const {session: activeAudioRoom, open: openAudioRoom, expand: expandAudioRoom} = usePartySession();
  const [menuRoom, setMenuRoom] = useState<PartyRoom | null>(null);
  const request = useRef(0);
  const moreInFlight = useRef(false);

  const load = useCallback(async (nextCategory: PartyCategory, append = false, nextCursors?: PartyCursors) => {
    const id = append ? request.current : ++request.current;
    if (append) {
      if (moreInFlight.current) return;
      moreInFlight.current = true;
      setLoadingMore(true);
    } else { setLoading(true); setLoadingMore(false); }
    setError(null);
    const selected = partyCategories.find(item => item.key === nextCategory)!;
    const normalizedSearch=search.trim();
    const options = {category: selected.category, interest: selected.interest, ...(filter!=='all'?{filter}:{}), ...(normalizedSearch?{search:normalizedSearch}: {})};
    try {
      const result = await getPartyDiscoveryPage(options, nextCursors);
      if (id !== request.current) return;
      setRooms(previous => append ? [...previous, ...result.rooms.filter(room => !previous.some(item => item.id === room.id))] : result.rooms);
      setCursors(result.cursors);
    } catch (cause) {
      if (id === request.current) setError(errorMessage(cause));
    } finally {
      if (id === request.current) { setLoading(false); setRefreshing(false); setLoadingMore(false); }
      if (append) moreInFlight.current = false;
    }
  }, [filter, search]);

  useEffect(() => {
    const requestRef = request;
    const timer=isFocused?setTimeout(()=>load(category),search.trim()?350:0):undefined;
    return () => {if(timer)clearTimeout(timer);requestRef.current++;};
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
      host: {id: host?.userId || '', name: host?.name || 'You', avatarUrl: host?.avatarUrl || null},
      participantCount: result.participants.length,
    });
    load(category);
  };
  const query = search.trim().toLowerCase();
  const visibleRooms = query ? rooms.filter(room => [room.title, room.topic, room.host.name, ...(room.interestTags || [])].join(' ').toLowerCase().includes(query)) : rooms;

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      {isFocused && <StatusBar barStyle="light-content" />}
      <View className="px-5 pt-4">
        <View className="flex-row items-center justify-between">
          <Text className="text-[32px] font-bold tracking-[-0.5px] text-foreground">Party</Text>
          <View className="flex-row items-center gap-2">
            <Pressable accessibilityRole="button" accessibilityLabel="Search parties" onPress={() => setSearchOpen(value => !value)} className="h-10 w-10 items-center justify-center rounded-full bg-card active:opacity-70"><IconSearch size={23} color={PartyColors.text} /></Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Open create party" onPress={() => setCreateOpen(true)} className="h-10 flex-row items-center justify-center gap-1.5 rounded-[18px] bg-primary px-4 active:opacity-70"><IconPlus size={21} color={PartyColors.ink} /><Text className="text-[13px] font-bold text-text-dark">Create</Text></Pressable>
          </View>
        </View>
        <Text className="mt-1 text-[14px] leading-[20px] text-muted">Join live audio parties, meet new people{ '\n' }and enjoy the vibe.</Text>
        {searchOpen && <View className="mt-4 flex-row items-center rounded-[16px] border border-border bg-card px-3">
          <IconSearch size={18} color={PartyColors.muted} />
          <TextInput accessibilityLabel="Search party rooms" autoFocus value={search} onChangeText={setSearch} placeholder="Search party rooms" placeholderTextColor={PartyColors.muted} className="ml-2 h-11 flex-1 text-sm text-foreground" />
          <Pressable accessibilityRole="button" accessibilityLabel="Close search" onPress={() => { setSearch(''); setSearchOpen(false); }} className="h-10 w-8 items-center justify-center"><IconX size={18} color={PartyColors.muted} /></Pressable>
        </View>}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="mt-4 gap-2">
          {([['all','For you'],['trending','Trending'],['following','Following'],['nearby','Nearby']] as const).map(([value,label])=><Pressable key={value} accessibilityRole="radio" accessibilityState={{selected:filter===value}} onPress={()=>setFilter(value)} className={filter===value?'min-h-11 justify-center rounded-full bg-primary px-4':'min-h-11 justify-center rounded-full bg-card px-4'}><Text className={filter===value?'text-sm font-semibold text-text-dark':'text-sm text-muted'}>{label}</Text></Pressable>)}
        </ScrollView>
        <View className="mb-4 mt-5">
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2">
            {partyCategories.map(option => {
              const CategoryIcon = categoryIcons[option.key];
              const active = category === option.key;
              return <Pressable key={option.key} accessibilityRole="button" accessibilityLabel={option.label + ' parties'} accessibilityState={{selected: active}} onPress={() => changeCategory(option.key)} className={active ? 'h-9 flex-row items-center gap-1.5 rounded-full border border-primary bg-primary px-3.5' : 'h-9 flex-row items-center gap-1.5 rounded-full border border-border bg-card px-3.5'}><CategoryIcon size={17} color={active ? PartyColors.ink : PartyColors.text} /><Text className={active ? 'text-[12px] font-bold text-text-dark' : 'text-[12px] font-medium text-foreground'}>{option.label}</Text></Pressable>;
            })}
          </ScrollView>
        </View>
      </View>
      <FlatList
        data={visibleRooms}
        keyExtractor={item => item.id}
        renderItem={({item}) => <PartyRoomCard room={item} onOpen={() => setSelectedRoom(item)} onMore={() => setMenuRoom(item)} />}
        contentContainerClassName="flex-grow px-4 pb-[110px]"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(category); }} tintColor={PartyColors.accent} colors={[PartyColors.accent]} />}
        onEndReached={() => { if (cursors && (cursors.audio || cursors.video) && !loading && !loadingMore) load(category, true, cursors); }}
        onEndReachedThreshold={0.4}
        ListHeaderComponent={error ? <Pressable accessibilityRole="button" accessibilityLabel="Retry party rooms" onPress={() => load(category)} className="mb-3 rounded-[16px] bg-card p-4"><Text className="text-sm text-coral">{error} Tap to retry.</Text></Pressable> : undefined}
        ListEmptyComponent={loading ? <View className="items-center pt-16"><ActivityIndicator color={PartyColors.accent} /></View> : !error ? <View className="items-center px-6 pt-16"><IconHeadphones size={44} color={PartyColors.muted} strokeWidth={1.5} /><Text className="mt-4 text-center text-base font-semibold text-foreground">{query ? 'No parties match your search' : 'No parties here yet'}</Text><Text className="mt-2 text-center text-sm leading-5 text-muted">{query ? 'Try another name or topic.' : 'Try another category or create your own.'}</Text></View> : undefined}
        ListFooterComponent={loadingMore ? <ActivityIndicator className="my-4" color={PartyColors.accent} /> : undefined}
      />
      {createOpen && <PartyCreateSheet onClose={() => setCreateOpen(false)} onCreated={onCreated} />}
      {selectedRoom && <PartyRoomPreview room={selectedRoom} activePartyId={activeAudioRoom?.party.id} onResume={() => {setSelectedRoom(null); expandAudioRoom();}} onClose={() => setSelectedRoom(null)} onJoined={session => { setSelectedRoom(null); openAudioRoom(session); }} />}

      {!!menuRoom && <Modal visible transparent animationType="fade" onRequestClose={() => setMenuRoom(null)}>
        <View className="flex-1 justify-end bg-black/60">
          <Pressable accessibilityLabel="Dismiss party options" onPress={() => setMenuRoom(null)} className="flex-1" />
          <SafeAreaView edges={['bottom']} className="rounded-t-[26px] bg-card px-5 py-4">
            <Text className="mb-2 text-lg font-bold text-foreground" numberOfLines={1}>{roomTitle(menuRoom)}</Text>
            <Pressable accessibilityRole="button" onPress={() => { setSelectedRoom(menuRoom); setMenuRoom(null); }} className="h-14 flex-row items-center gap-3"><IconInfoCircle size={22} color={PartyColors.text} /><Text className="text-[15px] text-foreground">Room details</Text></Pressable>
            <Pressable accessibilityRole="button" onPress={() => { const room = menuRoom; setMenuRoom(null); partyShareMessage(room).then(message => Share.share({message})).catch(cause => setError(cause.message || 'Could not share party.')); }} className="h-14 flex-row items-center gap-3"><IconShare size={22} color={PartyColors.text} /><Text className="text-[15px] text-foreground">Share party</Text></Pressable>
            <Pressable accessibilityRole="button" onPress={() => setMenuRoom(null)} className="h-11 items-center justify-center"><Text className="text-sm text-muted">Cancel</Text></Pressable>
          </SafeAreaView>
        </View>
      </Modal>}
    </SafeAreaView>
  );
};

export default Party;
