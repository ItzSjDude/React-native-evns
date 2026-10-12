import React, {useCallback, useEffect, useRef, useState} from 'react';
import {ActivityIndicator, Image, Pressable, RefreshControl, ScrollView, Share, StyleSheet, Text, View, useWindowDimensions} from 'react-native';
import ThemedStatusBar from '../../components/ThemedStatusBar';
import {useFocusEffect, useNavigation} from '@react-navigation/native';
import LinearGradient from 'react-native-linear-gradient';
import {cssInterop} from 'nativewind';
import {SafeAreaView} from 'react-native-safe-area-context';
import Svg, {Defs, RadialGradient, Rect, Stop} from 'react-native-svg';
import IconMenu2 from '@tabler/icons-react-native/IconMenu2';
import IconPencil from '@tabler/icons-react-native/IconPencil';
import IconPlus from '@tabler/icons-react-native/IconPlus';
import IconSquareRoundedPlus from '@tabler/icons-react-native/IconSquareRoundedPlus';
import IconShare3 from '@tabler/icons-react-native/IconShare3';
import IconRefresh from '@tabler/icons-react-native/IconRefresh';
import IconWaveSine from '@tabler/icons-react-native/IconWaveSine';
import IconChevronRight from '@tabler/icons-react-native/IconChevronRight';
import {useAppDispatch} from '../../core/store/hooks';
import {clearSession, logoutFromApi} from '../auth';
import {usePartySession} from '../party';
import {PlusBadge, usePlus, useOwnProfileTheme} from '../plus';
import {Colors} from '../../Constants/Colors';
import {getGiftSummary, getMyProfile, getMySettings, getProfilePage, updateMyProfile} from './profileService';
import {EventDetailSheet} from '../events';
import {EventCard, GiftPanel, PostGrid, RoomGrid} from './ProfileItems';
import {EditProfileSheet} from './ProfileSheets';
import SettingsScreen from './SettingsScreen';
import type {GiftSummary, ProfileEvent, ProfileItem, ProfileParty, ProfilePost, ProfileTab, ProfileUpdate, UserProfile, UserSettings} from './types';

cssInterop(LinearGradient, {className: 'style'});
cssInterop(SafeAreaView, {className: 'style'});

type ListState = {items: ProfileItem[]; loading: boolean; loaded: boolean; error: string | null; hasMore: boolean; offset: number};
const emptyList = (): ListState => ({items: [], loading: false, loaded: false, error: null, hasMore: true, offset: 0});
const tabs: ProfileTab[] = ['posts', 'parties', 'events'];
type VisibleTab = ProfileTab | 'gifts';
const tabLabels: Record<VisibleTab, string> = {posts: 'Posts', parties: 'Rooms', events: 'Events', gifts: 'Gifts'};
const initialsOf = (name?: string | null) => (name || '?').trim().split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase();
const compact = (value: number) => value >= 1000 ? `${(value / 1000).toFixed(value >= 10000 ? 0 : 1).replace(/\.0$/, '')}k` : String(value);
// Profile design accent (violet) and the dark ink that sits on it; the same in both themes.
const ACCENT = '#8B7CF6';
const ON_ACCENT = '#160F2E';
const messageOf = (error: unknown) => (error as {message?: string})?.message ?? 'Please try again.';

const Profile = () => {
  const dispatch = useAppDispatch();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<ProfileTab>('posts');
  const [giftsOpen, setGiftsOpen] = useState(false);
  const [openEvent, setOpenEvent] = useState<ProfileEvent | null>(null);
  const [gifts, setGifts] = useState<{summary: GiftSummary | null; loading: boolean; error: string | null}>({summary: null, loading: false, error: null});
  const [lists, setLists] = useState<Record<ProfileTab, ListState>>({posts: emptyList(), parties: emptyList(), events: emptyList()});
  const [sheet, setSheet] = useState<'edit' | 'settings' | null>(null);
  // Only the Plus badge and theme are read from here; null while loading or if the server has no settings API.
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const plus = usePlus();
  // Only a theme the server catalog says this account can use right now; the stored selection itself is kept across Plus expiry.
  const theme = useOwnProfileTheme(settings?.profileTheme);
  const accent = theme?.accent ?? ACCENT;
  const onAccent = theme?.onAccent ?? ON_ACCENT;
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
    getMySettings().then(setSettings).catch(() => {});
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

  const navigation = useNavigation<{navigate: (route: string, params?: {initialView?: 'events'}) => void}>();
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
    {label: 'Fans', value: profile?.stats?.followers ?? 0, dot: 'bg-[#6CB4FF]'},
    {label: 'Following', value: profile?.stats?.following ?? 0, dot: 'bg-[#3DD68C]'},
    {label: 'Gifts', value: profile?.stats?.giftsReceived ?? 0, dot: 'bg-[#8B7CF6]'},
  ] : [
    {label: 'Posts', value: profile?.stats?.posts ?? 0, dot: 'bg-[#6CB4FF]'},
    {label: 'Hosted', value: profile?.stats?.hosted ?? 0, dot: 'bg-[#8B7CF6]'},
    {label: 'Following', value: profile?.stats?.following ?? 0, dot: 'bg-[#3DD68C]'},
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
      <ThemedStatusBar />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerClassName="pb-[125px]"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.gold} colors={[Colors.gold]} progressBackgroundColor={Colors.card} />}>
        <View>
          {/* Design hero: violet radial glow from the top-left fading into the page background. */}
          <Svg width={width} height="100%" style={StyleSheet.absoluteFill} preserveAspectRatio="none">
            <Defs>
              <RadialGradient id="hero" cx="30%" cy="0%" rx="120%" ry="95%" fx="30%" fy="0%">
                <Stop offset="0" stopColor={theme?.glow ?? Colors.profileGlow} /><Stop offset="0.6" stopColor={Colors.background} /><Stop offset="1" stopColor={Colors.background} />
              </RadialGradient>
            </Defs>
            <Rect width="100%" height="100%" fill="url(#hero)" />
          </Svg>
          <SafeAreaView edges={['top']}>
            <View className="h-14 flex-row items-center justify-between px-5 pt-3">
              <Text accessibilityRole="header" numberOfLines={1} className="flex-1 font-display-semibold text-[27px] tracking-[-0.8px] text-foreground">{profile?.handle ? `@${profile.handle}` : 'Profile'}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Settings" onPress={() => setSheet('settings')}
                className="h-11 w-11 items-center justify-center rounded-full border border-border dark:border-[#2E2A4A] bg-card dark:bg-[#17152A] active:opacity-70">
                <IconMenu2 size={20} color={Colors.text} />
              </Pressable>
            </View>

            <View className="flex-row items-center gap-5 px-5 pt-4">
              <View style={{borderColor: accent}} className="h-[88px] w-[88px] rounded-full border-[2.5px] p-[3px]">
                <View className="h-full w-full items-center justify-center overflow-hidden rounded-full bg-card dark:bg-[#2A2640]">
                  {profile?.avatar_url ? <Image source={{uri: profile.avatar_url}} className="h-full w-full" />
                    : <Text className="font-display text-[24px] text-muted dark:text-[#C9C5DE]">{initialsOf(profile?.name)}</Text>}
                </View>
                <Pressable accessibilityRole="button" accessibilityLabel="Change photo" onPress={() => setSheet('edit')} hitSlop={6}
                  className="absolute -bottom-1 -right-1 h-7 w-7 items-center justify-center rounded-full border-[2.5px] border-background dark:border-[#0B0A12] active:opacity-80" style={{backgroundColor: accent}}>
                  <IconPlus size={14} strokeWidth={2.6} color={onAccent} />
                </Pressable>
              </View>
              <View className="min-w-0 flex-1 flex-row gap-2">
                {stats.map(stat => <View key={stat.label} className="min-w-0 flex-1 items-center gap-1">
                  <Text className="font-display text-[20px] leading-[22px] text-foreground dark:text-[#F4F2FA]">{compact(stat.value)}</Text>
                  <View className="flex-row items-center gap-[5px]">
                    <View className={`h-1.5 w-1.5 rounded-full ${stat.dot}`} />
                    <Text numberOfLines={1} className="text-[12px] font-medium text-muted dark:text-[#9C97B8]">{stat.label}</Text>
                  </View>
                </View>)}
              </View>
            </View>

            {profileLoading && !profile ? <View className="mt-5 gap-2.5 px-5">
              <View className="h-6 w-40 rounded-lg bg-card" /><View className="h-4 w-64 rounded-lg bg-card" />
              <ActivityIndicator accessibilityLabel="Loading profile" color={ACCENT} className="mt-4" />
            </View> : null}

            {profileError && !profile ? <View className="mx-5 mt-5 items-center rounded-[20px] bg-card p-5">
              <Text className="text-center text-sm text-text-body">{profileError}</Text>
              <Pressable accessibilityRole="button" onPress={() => loadProfile()} className="mt-3 h-10 flex-row items-center gap-1.5 rounded-full bg-[#8B7CF6] px-4 active:opacity-80">
                <IconRefresh size={16} color={ON_ACCENT} /><Text className="text-[14px] font-semibold text-[#160F2E]">Try again</Text>
              </Pressable>
            </View> : null}

            {profile ? <>
              <View className="gap-1.5 px-5 pt-5">
                <View className="flex-row items-center">
                  <Text accessibilityRole="header" numberOfLines={1} className="shrink font-display text-[18px] leading-[22px] tracking-[-0.2px] text-foreground dark:text-[#F4F2FA]">{profile.name}</Text>
                  {plus.isPlus && settings?.showPlusBadge === true && <PlusBadge size="md" />}
                </View>
                {profile.bio ? <Text className="text-[13px] leading-5 text-text-body dark:text-[#B3AECB]">{profile.bio}</Text>
                  : <Pressable accessibilityRole="button" onPress={() => setSheet('edit')} className="self-start active:opacity-70"><Text className="text-[13px] font-semibold text-primary dark:text-[#A78BFA]">+ Add a bio</Text></Pressable>}
                {!!meta && <Text className="text-[12px] text-muted dark:text-[#9C97B8]">{meta}</Text>}
                {!!profile.interests?.length && <View className="mt-1 flex-row flex-wrap gap-1.5">
                  {profile.interests.slice(0, 3).map(interest => <Text key={interest} className="overflow-hidden rounded-full border border-border dark:border-[#2E2A4A] bg-card dark:bg-[#17152A] px-2.5 py-1 text-[12px] font-semibold capitalize text-muted dark:text-[#B3AECB]">{interest}</Text>)}
                  {profile.interests.length > 3 && <Text className="overflow-hidden rounded-full border border-border dark:border-[#2E2A4A] px-2.5 py-1 text-[12px] font-semibold text-muted dark:text-[#9C97B8]">+{profile.interests.length - 3} more</Text>}
                </View>}
              </View>

              <View className="flex-row gap-3 px-5 pt-5">
                <Pressable accessibilityRole="button" accessibilityLabel="Edit profile" onPress={() => setSheet('edit')}
                  style={{backgroundColor: accent}} className="h-10 flex-1 flex-row items-center justify-center gap-1.5 rounded-full active:opacity-80">
                  <IconPencil size={15} color={onAccent} /><Text style={{color: onAccent}} className="text-[14px] font-semibold">Edit profile</Text>
                </Pressable>
                <Pressable accessibilityRole="button" accessibilityLabel="Share profile" onPress={shareProfile}
                  className="h-10 flex-1 flex-row items-center justify-center gap-1.5 rounded-full border-[1.5px] border-purple-line dark:border-[#4A4378] active:opacity-70">
                  <IconShare3 size={15} color={Colors.text} /><Text className="text-[14px] font-semibold text-foreground dark:text-[#F4F2FA]">Share profile</Text>
                </Pressable>
              </View>
            </> : null}
          </SafeAreaView>
        </View>

        {liveParty ? <Pressable accessibilityRole="button" accessibilityLabel="Back to your live room" onPress={openLiveParty}
          className="mx-5 mt-5 flex-row items-center gap-3 rounded-[18px] bg-[#FF5D8F] px-3.5 py-3 active:opacity-90">
          <View className="h-10 w-10 items-center justify-center rounded-xl bg-[#1A0610]"><IconWaveSine size={20} color="#FF5D8F" /></View>
          <View className="min-w-0 flex-1">
            <Text className="text-[11px] font-extrabold tracking-[1px] text-[#1A0610]">YOU'RE IN A ROOM</Text>
            <Text numberOfLines={1} className="text-[14px] font-extrabold text-[#1A0610]">{liveParty.party.title || 'Audio party'}</Text>
          </View>
          <Text className="text-[12px] font-extrabold text-[#1A0610]">Back to room</Text>
          <IconChevronRight size={16} color="#1A0610" />
        </Pressable> : null}

        {profile ? <>
          <View accessibilityRole="tablist" className="mx-5 mt-6 flex-row gap-1 rounded-[20px] border border-border dark:border-[#2E2A4A] bg-card dark:bg-[#13111F] p-[3px]">
            {visibleTabs.map(tab => {
              const selected = currentTab === tab;
              return <Pressable key={tab} accessibilityRole="tab" accessibilityState={{selected}} onPress={() => selectTab(tab)}
                style={selected ? {backgroundColor: accent} : undefined} className={`h-[34px] flex-1 items-center justify-center rounded-[17px] ${selected ? '' : 'active:opacity-70'}`}>
                <Text style={selected ? {color: onAccent} : undefined} className={`text-[14px] font-semibold ${selected ? '' : 'text-muted dark:text-[#B3AECB]'}`}>{tabLabels[tab]}</Text>
              </Pressable>;
            })}
          </View>

          {currentTab === 'gifts' ? <View className="px-5 pb-5 pt-3.5">
            {gifts.summary ? <GiftPanel summary={gifts.summary} /> : null}
            {gifts.loading ? <ActivityIndicator accessibilityLabel="Loading gifts" color={ACCENT} className="my-[30px]" /> : null}
            {gifts.error ? <Pressable accessibilityRole="button" onPress={() => loadGifts(profile.id)} className="mt-3 rounded-[16px] bg-card p-4 active:opacity-70">
              <Text className="text-sm text-coral">{gifts.error} Tap to retry.</Text>
            </Pressable> : null}
          </View> : <View className="px-5 pb-5 pt-3.5">
            {activeTab === 'posts' && !!list.items.length && <PostGrid posts={list.items as ProfilePost[]} />}
            {activeTab === 'parties' && (list.loaded || list.items.length > 0) && !list.error && <RoomGrid parties={list.items as ProfileParty[]} onHost={() => navigation.navigate('Party')} />}
            {activeTab === 'events' && <View className="gap-3">{(list.items as ProfileEvent[]).map(event => <EventCard key={event.id} event={event} onPress={() => setOpenEvent(event)} />)}</View>}
            {list.loading ? <ActivityIndicator accessibilityLabel={`Loading ${tabLabels[activeTab]}`} color={ACCENT} className="my-[30px]" /> : null}
            {list.error ? <Pressable accessibilityRole="button" onPress={() => loadList(profile.id, activeTab, list.items.length > 0)} className="mt-3 rounded-[16px] bg-card p-4 active:opacity-70">
              <Text className="text-sm text-coral">{list.error} Tap to retry.</Text>
            </Pressable> : null}
            {!list.loading && !list.error && list.items.length === 0 && activeTab !== 'parties' ? <View className="items-center gap-1.5 px-5 py-10">
              <View className="mb-2 h-14 w-14 items-center justify-center rounded-full border border-border dark:border-[#2E2A4A] bg-card dark:bg-[#17152A]">
                <IconSquareRoundedPlus size={24} strokeWidth={1.8} color={Colors.muted} />
              </View>
              <Text className="text-[17px] font-bold text-foreground dark:text-[#F4F2FA]">No {tabLabels[activeTab].toLowerCase()} yet</Text>
              <Text className="text-center text-[14px] text-muted dark:text-[#9C97B8]">{activeTab === 'posts' ? 'Share something from the Home tab.' : 'Events you join show up here.'}</Text>
            </View> : null}
            {!list.loading && !list.error && list.hasMore && list.items.length > 0 ? <Pressable accessibilityRole="button" onPress={() => loadList(profile.id, activeTab, true)} className="mt-3 items-center p-[15px] active:opacity-70">
              <Text className="text-sm font-semibold text-primary dark:text-[#A78BFA]">Load more</Text>
            </Pressable> : null}
          </View>}
        </> : null}
      </ScrollView>

      <EventDetailSheet eventId={openEvent?.id ?? null} initial={openEvent} visible={!!openEvent} onClose={() => setOpenEvent(null)}
        onOpenEventChat={() => navigation.navigate('Chat', {initialView: 'events'})} />
      <EditProfileSheet profile={profile} visible={sheet === 'edit'} onClose={() => setSheet(null)} onSave={saveProfile} />
      <SettingsScreen onSettingsChange={setSettings} profile={profile} visible={sheet === 'settings'} onClose={() => setSheet(null)} onEditProfile={() => setSheet('edit')} onLogout={logout} />
    </View>
  );
};

export default Profile;
