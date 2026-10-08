import React, {useCallback, useEffect, useRef, useState} from 'react';
import {ActivityIndicator, Image, Pressable, RefreshControl, ScrollView, Share, StatusBar, StyleSheet, Text, View, useWindowDimensions} from 'react-native';
import {useFocusEffect, useNavigation} from '@react-navigation/native';
import LinearGradient from 'react-native-linear-gradient';
import {cssInterop} from 'nativewind';
import {SafeAreaView} from 'react-native-safe-area-context';
import Svg, {Defs, RadialGradient, Rect, Stop, Circle} from 'react-native-svg';
import IconMenu2 from '@tabler/icons-react-native/IconMenu2';
import IconPencil from '@tabler/icons-react-native/IconPencil';
import IconShare3 from '@tabler/icons-react-native/IconShare3';
import IconRefresh from '@tabler/icons-react-native/IconRefresh';
import IconWaveSine from '@tabler/icons-react-native/IconWaveSine';
import IconChevronRight from '@tabler/icons-react-native/IconChevronRight';
import {useAppDispatch} from '../../core/store/hooks';
import {clearSession, logoutFromApi} from '../auth';
import {usePartySession} from '../party';
import {Colors} from '../../Constants/Colors';
import {getGiftSummary, getMyProfile, getProfilePage, updateMyProfile} from './profileService';
import {EventCard, GiftPanel, PostGrid, RoomGrid} from './ProfileItems';
import {EditProfileSheet} from './ProfileSheets';
import SettingsScreen from './SettingsScreen';
import type {GiftSummary, ProfileEvent, ProfileItem, ProfileParty, ProfilePost, ProfileTab, ProfileUpdate, UserProfile} from './types';

cssInterop(LinearGradient, {className: 'style'});
cssInterop(SafeAreaView, {className: 'style'});

type ListState = {items: ProfileItem[]; loading: boolean; loaded: boolean; error: string | null; hasMore: boolean; offset: number};
const emptyList = (): ListState => ({items: [], loading: false, loaded: false, error: null, hasMore: true, offset: 0});
const tabs: ProfileTab[] = ['posts', 'parties', 'events'];
type VisibleTab = ProfileTab | 'gifts';
const tabLabels: Record<VisibleTab, string> = {posts: 'Posts', parties: 'Rooms', events: 'Events', gifts: 'Gifts'};
const initialsOf = (name?: string | null) => (name || '?').trim().split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase();
const compact = (value: number) => value >= 1000 ? `${(value / 1000).toFixed(value >= 10000 ? 0 : 1).replace(/\.0$/, '')}k` : String(value);
const messageOf = (error: unknown) => (error as {message?: string})?.message ?? 'Please try again.';

const Profile = () => {
  const dispatch = useAppDispatch();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<ProfileTab>('posts');
  const [giftsOpen, setGiftsOpen] = useState(false);
  const [gifts, setGifts] = useState<{summary: GiftSummary | null; loading: boolean; error: string | null}>({summary: null, loading: false, error: null});
  const [lists, setLists] = useState<Record<ProfileTab, ListState>>({posts: emptyList(), parties: emptyList(), events: emptyList()});
  const [sheet, setSheet] = useState<'edit' | 'settings' | null>(null);
  const profileRequest = useRef(0);
  const visibleProfile = useRef(profile);
  visibleProfile.current = profile;
  const visibleTab = useRef(activeTab);
  visibleTab.current = activeTab;
  const listsRef = useRef(lists);
  const listOwner = useRef<string | null>(null);
  const listRequests = useRef<Record<ProfileTab, number>>({posts: 0, parties: 0, events: 0});
  const listBusy = useRef(new Set<string>());
  const updateLists = useCallback((updater: (current: Record<ProfileTab, ListState>) => Record<ProfileTab, ListState>) => {
    const next = updater(listsRef.current);
    listsRef.current = next;
    setLists(next);
  }, []);

  const loadProfile = useCallback(async (isRefresh = false) => {
    const request = ++profileRequest.current;
    if (isRefresh) setRefreshing(true); else setProfileLoading(true);
    setProfileError(null);
    try {
      const value = await getMyProfile();
      if (request !== profileRequest.current) return;
      setProfile(value);
    } catch (error) {
      if (request === profileRequest.current) setProfileError(messageOf(error));
    } finally {
      if (request === profileRequest.current) {setProfileLoading(false); setRefreshing(false);}
    }
  }, []);

  const loadList = useCallback(async (userId: string, tab: ProfileTab, append = false) => {
    const offset = append ? listsRef.current[tab].offset : 0;
    const key = `${userId}:${tab}:${offset}`;
    if (listBusy.current.has(key)) return;
    listBusy.current.add(key);
    const request = ++listRequests.current[tab];
    updateLists(current => ({...current, [tab]: {...current[tab], loading: true, error: null}}));
    try {
      const page = await getProfilePage(userId, tab, offset);
      if (request !== listRequests.current[tab] || userId !== listOwner.current) return;
      updateLists(current => ({...current, [tab]: {
        items: append ? [...current[tab].items, ...page.items] : page.items,
        loading: false, loaded: true, error: null, hasMore: page.hasMore,
        offset: page.offset + page.items.length,
      }}));
    } catch (error) {
      if (request === listRequests.current[tab] && userId === listOwner.current) {
        updateLists(current => ({...current, [tab]: {...current[tab], loading: false, loaded: true, error: messageOf(error)}}));
      }
    } finally {listBusy.current.delete(key);}
  }, [updateLists]);

  useFocusEffect(useCallback(() => {
    loadProfile();
    const currentProfile = visibleProfile.current;
    if (currentProfile?.id && listOwner.current === currentProfile.id) {
      loadList(currentProfile.id, visibleTab.current);
    }
    return () => {
      profileRequest.current++;
      for (const tab of tabs) listRequests.current[tab]++;
      listBusy.current.clear();
    };
  }, [loadProfile, loadList]));

  useEffect(() => {
    const userId = profile?.id;
    if (!userId) return;
    if (listOwner.current !== userId) {
      listOwner.current = userId;
      updateLists(() => ({posts: emptyList(), parties: emptyList(), events: emptyList()}));
    }
    if (!listsRef.current[activeTab].loaded && !listsRef.current[activeTab].loading) {
      loadList(userId, activeTab);
    }
  }, [profile?.id, activeTab, loadList, updateLists]);

  const loadGifts = async (userId: string) => {
    setGifts(current => ({...current, loading: true, error: null}));
    try {setGifts({summary: await getGiftSummary(userId), loading: false, error: null});}
    catch (cause) {setGifts({summary: null, loading: false, error: messageOf(cause)});}
  };
  const onRefresh = async () => {
    await loadProfile(true);
    if (profile?.id) await (giftsOpen ? loadGifts(profile.id) : loadList(profile.id, activeTab));
  };

  const saveProfile = async (update: ProfileUpdate) => {
    const updated = await updateMyProfile(update);
    profileRequest.current++;
    setProfile(updated);
  };

  const logout = async () => {
    try {await logoutFromApi();}
    finally {dispatch(clearSession());}
  };

  const navigation = useNavigation<{navigate: (route: string) => void}>();
  const {session: liveParty, expand: openLiveParty} = usePartySession();
  const {width} = useWindowDimensions();

  const shareProfile = () => {
    if (!profile) return;
    Share.share({message: `${profile.name}${profile.handle ? ` (@${profile.handle})` : ''} is on Hiva Chat. Come hang out!`}).catch(() => {});
  };

  const list = lists[activeTab];
  // Fans and gifts need the profile-settings backend; until it ships, fall back to the stats every server returns.
  const social = profile?.stats?.followers !== undefined;
  const stats = social ? [
    {label: 'Fans', value: profile?.stats?.followers ?? 0, dot: 'bg-[#8B7CF6]', count: 'border-[#4A3F8C] bg-[#2A2160]', text: 'text-foreground'},
    {label: 'Following', value: profile?.stats?.following ?? 0, dot: 'bg-[#3DDC97]', count: 'border-[#1F5A40] bg-[#123224]', text: 'text-foreground'},
    {label: 'Gifts mile', value: profile?.stats?.giftsReceived ?? 0, dot: 'bg-gold', count: 'border-gold bg-gold', text: 'text-gold-ink'},
  ] : [
    {label: 'Posts', value: profile?.stats?.posts ?? 0, dot: 'bg-[#8B7CF6]', count: 'border-[#4A3F8C] bg-[#2A2160]', text: 'text-foreground'},
    {label: 'Hosted', value: profile?.stats?.hosted ?? 0, dot: 'bg-gold', count: 'border-gold bg-gold', text: 'text-gold-ink'},
    {label: 'Following', value: profile?.stats?.following ?? 0, dot: 'bg-[#3DDC97]', count: 'border-[#1F5A40] bg-[#123224]', text: 'text-foreground'},
  ];
  const visibleTabs: VisibleTab[] = social ? [...tabs, 'gifts'] : tabs;
  const currentTab: VisibleTab = giftsOpen && social ? 'gifts' : activeTab;
  const selectTab = (tab: VisibleTab) => {
    if (tab === 'gifts') {
      setGiftsOpen(true);
      if (profile && !gifts.summary && !gifts.loading) loadGifts(profile.id);
      return;
    }
    setGiftsOpen(false);
    setActiveTab(tab);
  };
  const joined = (profile as {created_at?: string} | null)?.created_at;
  const meta = [profile?.city, joined ? `Joined ${new Date(joined).toLocaleDateString(undefined, {month: 'short', year: 'numeric'})}` : null].filter(Boolean).join(' · ');

  return (
    <View className="flex-1 bg-background">
      <StatusBar barStyle="light-content" />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerClassName="pb-[125px]"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.gold} colors={[Colors.gold]} progressBackgroundColor={Colors.card} />}>
        <View>
          {/* Design hero: violet radial glow from the top-left fading into the page background. */}
          <Svg width={width} height="100%" style={StyleSheet.absoluteFill} preserveAspectRatio="none">
            <Defs>
              <RadialGradient id="hero" cx="20%" cy="0%" rx="120%" ry="90%" fx="20%" fy="0%">
                <Stop offset="0" stopColor="#3B2A86" /><Stop offset="0.45" stopColor="#1A1338" /><Stop offset="0.8" stopColor={Colors.background} /><Stop offset="1" stopColor={Colors.background} />
              </RadialGradient>
            </Defs>
            <Rect width="100%" height="100%" fill="url(#hero)" />
          </Svg>
          <SafeAreaView edges={['top']}>
            <View className="px-5 pb-5 pt-[18px]">
              <View className="flex-row items-center gap-2">
                <Text numberOfLines={1} className="flex-1 text-[14px] font-bold text-[#C9C2DA]">{profile?.handle ? `@${profile.handle}` : ''}</Text>
                <Pressable accessibilityRole="button" accessibilityLabel="Settings" onPress={() => setSheet('settings')}
                  className="h-11 w-11 items-center justify-center rounded-full bg-white/10 active:opacity-70">
                  <IconMenu2 size={20} color="#FFFFFF" />
                </Pressable>
              </View>

              <View className="mt-[30px] flex-row items-center gap-[22px] pl-2.5">
                <View className="h-[112px] w-[112px] items-center justify-center">
                  <View className="absolute -inset-2.5 rounded-full border-[1.5px] border-dashed border-[#5A4F8C]" />
                  <Svg width={112} height={112} style={StyleSheet.absoluteFill}>
                    <Circle cx={56} cy={56} r={52} stroke={Colors.gold} strokeWidth={5} fill="none" />
                  </Svg>
                  <View className="h-[90px] w-[90px] items-center justify-center overflow-hidden rounded-full bg-[#4A3A8C]">
                    {profile?.avatar_url ? <Image source={{uri: profile.avatar_url}} className="h-full w-full" />
                      : <Text className="text-[28px] font-extrabold text-[#F0ECFF]">{initialsOf(profile?.name)}</Text>}
                  </View>
                </View>
                <View className="min-w-0 flex-1 gap-2.5">
                  {stats.map(stat => <View key={stat.label} className="flex-row items-center gap-2.5">
                    <View className="h-[30px] w-[92px] flex-row items-center gap-1.5 rounded-full border border-[#3A3168] bg-[#15102C]/80 px-2.5">
                      <View className={`h-1.5 w-1.5 rounded-full ${stat.dot}`} /><Text className="text-[11px] font-bold text-[#B3ACC4]">{stat.label}</Text>
                    </View>
                    <View className={`h-[30px] min-w-[48px] items-center justify-center rounded-full border px-2.5 ${stat.count}`}>
                      <Text className={`font-display text-[13px] ${stat.text}`}>{compact(stat.value)}</Text>
                    </View>
                  </View>)}
                </View>
              </View>

              {profileLoading && !profile ? <View className="mt-5 gap-2.5">
                <View className="h-6 w-40 rounded-lg bg-white/10" /><View className="h-4 w-64 rounded-lg bg-white/10" />
                <ActivityIndicator accessibilityLabel="Loading profile" color={Colors.gold} className="mt-4" />
              </View> : null}

              {profileError && !profile ? <View className="mt-5 items-center rounded-[20px] bg-white/5 p-5">
                <Text className="text-center text-sm text-text-body">{profileError}</Text>
                <Pressable accessibilityRole="button" onPress={() => loadProfile()} className="mt-3 h-10 flex-row items-center gap-1.5 rounded-full bg-gold px-4 active:opacity-80">
                  <IconRefresh size={16} color={Colors.goldInk} /><Text className="text-[13px] font-extrabold text-gold-ink">Try again</Text>
                </Pressable>
              </View> : null}

              {profile ? <>
                <View className="mt-5 gap-1.5">
                  <Text accessibilityRole="header" numberOfLines={1} className="font-display text-[24px] tracking-[-0.3px] text-foreground">{profile.name}</Text>
                  {profile.bio ? <Text className="text-[13px] leading-5 text-[#D9D4E4]">{profile.bio}</Text>
                    : <Pressable accessibilityRole="button" onPress={() => setSheet('edit')} className="self-start active:opacity-70"><Text className="text-[13px] font-semibold text-gold">+ Add a bio</Text></Pressable>}
                  {!!meta && <Text className="text-[11px] text-[#9C95AE]">{meta}</Text>}
                  {!!profile.interests?.length && <View className="mt-1 flex-row flex-wrap gap-1.5">
                    {profile.interests.slice(0, 3).map((interest, i) => <Text key={interest} className={`overflow-hidden rounded-full px-2.5 py-1.5 text-[11px] font-extrabold capitalize ${i === 0 ? 'bg-[#2E2410] text-gold' : 'bg-[#241D4A] text-purple-soft'}`}>{interest}</Text>)}
                    {profile.interests.length > 3 && <Text className="overflow-hidden rounded-full bg-white/10 px-2.5 py-1.5 text-[11px] font-extrabold text-[#C9C2DA]">+{profile.interests.length - 3} more</Text>}
                  </View>}
                </View>

                <View className="mt-4 flex-row gap-2.5">
                  <Pressable accessibilityRole="button" accessibilityLabel="Edit profile" onPress={() => setSheet('edit')}
                    className="h-11 flex-1 flex-row items-center justify-center gap-2 rounded-full bg-gold active:opacity-80">
                    <IconPencil size={16} color={Colors.goldInk} /><Text className="text-[13px] font-extrabold text-gold-ink">Edit profile</Text>
                  </Pressable>
                  <Pressable accessibilityRole="button" accessibilityLabel="Share profile" onPress={shareProfile}
                    className="h-11 flex-1 flex-row items-center justify-center gap-2 rounded-full border-[1.5px] border-purple-line active:opacity-70">
                    <IconShare3 size={16} color="#E6E0FF" /><Text className="text-[13px] font-extrabold text-[#E6E0FF]">Share profile</Text>
                  </Pressable>
                </View>
              </> : null}
            </View>
          </SafeAreaView>
        </View>

        {liveParty ? <Pressable accessibilityRole="button" accessibilityLabel="Back to your live room" onPress={openLiveParty}
          className="mx-5 mt-1 flex-row items-center gap-3 rounded-[18px] bg-[#FF5D8F] px-3.5 py-3 active:opacity-90">
          <View className="h-10 w-10 items-center justify-center rounded-xl bg-[#1A0610]"><IconWaveSine size={20} color="#FF5D8F" /></View>
          <View className="min-w-0 flex-1">
            <Text className="text-[11px] font-extrabold tracking-[1px] text-[#1A0610]">YOU'RE IN A ROOM</Text>
            <Text numberOfLines={1} className="text-[14px] font-extrabold text-[#1A0610]">{liveParty.party.title || 'Audio party'}</Text>
          </View>
          <Text className="text-[12px] font-extrabold text-[#1A0610]">Back to room</Text>
          <IconChevronRight size={16} color="#1A0610" />
        </Pressable> : null}

        {profile ? <>
          <View accessibilityRole="tablist" className="mx-5 mt-[18px] flex-row gap-0.5 rounded-full border border-border bg-[#15121E] p-1">
            {visibleTabs.map(tab => {
              const selected = currentTab === tab;
              return <Pressable key={tab} accessibilityRole="tab" accessibilityState={{selected}} onPress={() => selectTab(tab)}
                className={`h-10 flex-1 items-center justify-center rounded-full ${selected ? 'bg-gold' : 'active:opacity-70'}`}>
                <Text className={`text-[13px] font-extrabold ${selected ? 'text-gold-ink' : 'text-[#A9A3B8]'}`}>{tabLabels[tab]}</Text>
              </Pressable>;
            })}
          </View>

          {currentTab === 'gifts' ? <View className="px-5 pb-5 pt-3.5">
            {gifts.summary ? <GiftPanel summary={gifts.summary} /> : null}
            {gifts.loading ? <ActivityIndicator accessibilityLabel="Loading gifts" color={Colors.gold} className="my-[30px]" /> : null}
            {gifts.error ? <Pressable accessibilityRole="button" onPress={() => loadGifts(profile.id)} className="mt-3 rounded-[16px] bg-card p-4 active:opacity-70">
              <Text className="text-sm text-coral">{gifts.error} Tap to retry.</Text>
            </Pressable> : null}
          </View> : <View className="px-5 pb-5 pt-3.5">
            {activeTab === 'posts' && !!list.items.length && <PostGrid posts={list.items as ProfilePost[]} />}
            {activeTab === 'parties' && (list.loaded || list.items.length > 0) && !list.error && <RoomGrid parties={list.items as ProfileParty[]} onHost={() => navigation.navigate('Party')} />}
            {activeTab === 'events' && <View className="gap-3">{(list.items as ProfileEvent[]).map(event => <EventCard key={event.id} event={event} />)}</View>}
            {list.loading ? <ActivityIndicator accessibilityLabel={`Loading ${tabLabels[activeTab]}`} color={Colors.gold} className="my-[30px]" /> : null}
            {list.error ? <Pressable accessibilityRole="button" onPress={() => loadList(profile.id, activeTab, list.items.length > 0)} className="mt-3 rounded-[16px] bg-card p-4 active:opacity-70">
              <Text className="text-sm text-coral">{list.error} Tap to retry.</Text>
            </Pressable> : null}
            {!list.loading && !list.error && list.items.length === 0 && activeTab !== 'parties' ? <View className="items-center py-12">
              <Text className="text-[16px] font-extrabold text-foreground">No {tabLabels[activeTab].toLowerCase()} yet</Text>
              <Text className="mt-1 text-[13px] text-muted">{activeTab === 'posts' ? 'Share something from the Home tab.' : 'Events you join show up here.'}</Text>
            </View> : null}
            {!list.loading && !list.error && list.hasMore && list.items.length > 0 ? <Pressable accessibilityRole="button" onPress={() => loadList(profile.id, activeTab, true)} className="mt-3 items-center p-[15px] active:opacity-70">
              <Text className="text-sm font-extrabold text-gold">Load more</Text>
            </Pressable> : null}
          </View>}
        </> : null}
      </ScrollView>

      <EditProfileSheet profile={profile} visible={sheet === 'edit'} onClose={() => setSheet(null)} onSave={saveProfile} />
      <SettingsScreen profile={profile} visible={sheet === 'settings'} onClose={() => setSheet(null)} onEditProfile={() => setSheet('edit')} onLogout={logout} />
    </View>
  );
};

export default Profile;
