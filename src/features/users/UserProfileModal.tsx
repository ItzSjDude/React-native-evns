import React, {useCallback, useEffect, useRef, useState} from 'react';
import {ActivityIndicator, Modal, Pressable, ScrollView, Share, StatusBar, StyleSheet, Text, View, useWindowDimensions} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import Svg, {Circle, Defs, RadialGradient, Rect, Stop} from 'react-native-svg';
import IconArrowLeft from '@tabler/icons-react-native/IconArrowLeft';
import IconDots from '@tabler/icons-react-native/IconDots';
import IconLock from '@tabler/icons-react-native/IconLock';
import IconUserOff from '@tabler/icons-react-native/IconUserOff';
import IconMessageCircle from '@tabler/icons-react-native/IconMessageCircle';
import IconRefresh from '@tabler/icons-react-native/IconRefresh';
import IconShare3 from '@tabler/icons-react-native/IconShare3';
import IconFlag from '@tabler/icons-react-native/IconFlag';
import IconBan from '@tabler/icons-react-native/IconBan';
import IconChevronRight from '@tabler/icons-react-native/IconChevronRight';
import BottomSheet, {SheetButton, SheetRow, SheetSection} from '../../components/BottomSheet';
import {Colors} from '../../Constants/Colors';
import {DirectConversation, startDirectConversation} from '../messages';
import {PlusBadge} from '../plus';
import FollowButton from './FollowButton';
import FollowListSheet from './FollowListSheet';
import {useFollowToggle, useIsFollowing, useViewerId} from './followState';
import {Avatar, EventCard, GiftPanel, PostGrid, RoomGrid, compact} from './UserProfileItems';
import {
  PUBLIC_PROFILE_ENDPOINT_ENABLED, accessOf, blockUser, getUserContentPage, getUserGiftSummary, getUserProfile,
  messageOf, reportUser, unblockUser,
} from './usersService';
import type {
  FollowListKind, ProfileAccess, PublicUserProfile, UserContentItem, UserContentTab, UserEvent, UserGiftSummary,
  UserParty, UserPost, UserPreview,
} from './types';

export type UserProfileModalProps = {
  userId: string;
  /** Whatever the caller already shows (feed author, room participant, nearby row). */
  initial?: UserPreview;
  visible: boolean;
  onClose: () => void;
  /** Called after the viewer blocks this user, so the caller can drop their posts/rows. */
  onBlocked?: (userId: string) => void;
};

type ListState = {items: UserContentItem[]; loading: boolean; loaded: boolean; error: string | null; hasMore: boolean; offset: number};
type VisibleTab = UserContentTab | 'gifts';
type SheetKind = 'menu' | 'block' | 'report' | 'reported';

const CONTENT_TABS: UserContentTab[] = ['posts', 'parties', 'events'];
const TAB_LABELS: Record<VisibleTab, string> = {posts: 'Posts', parties: 'Rooms', events: 'Events', gifts: 'Gifts'};
export const REPORT_REASONS = ['Inappropriate behavior', 'Spam or scam', 'Harassment or hate', 'Impersonation', 'Underage user'];

const emptyList = (): ListState => ({items: [], loading: false, loaded: false, error: null, hasMore: false, offset: 0});
const emptyLists = (): Record<UserContentTab, ListState> => ({posts: emptyList(), parties: emptyList(), events: emptyList()});

const StatPill = ({label, value, dot, count, text, onPress}: {
  label: string; value: number | null; dot: string; count: string; text: string; onPress?: () => void;
}) =>
  <Pressable accessibilityRole={onPress ? 'button' : undefined} accessibilityLabel={value === null ? label : `${compact(value)} ${label}`}
    disabled={!onPress} onPress={onPress} className="flex-row items-center gap-2.5 active:opacity-70">
    <View className="h-[30px] w-[92px] flex-row items-center gap-1.5 rounded-full border border-[#3A3168] bg-[#15102C]/80 px-2.5">
      <View className={`h-1.5 w-1.5 rounded-full ${dot}`} /><Text className="text-[11px] font-bold text-[#B3ACC4]">{label}</Text>
    </View>
    <View className={`h-[30px] min-w-[48px] items-center justify-center rounded-full border px-2.5 ${count}`}>
      {value === null ? <IconChevronRight size={14} color="#E6E0FF" /> : <Text className={`text-[13px] font-extrabold ${text}`}>{compact(value)}</Text>}
    </View>
  </Pressable>;

const StateCard = ({icon: Icon, title, body, children}: {icon: typeof IconLock; title: string; body: string; children?: React.ReactNode}) =>
  <View className="mx-5 mt-[18px] items-center rounded-[22px] border border-border bg-card px-5 py-8">
    <View className="h-14 w-14 items-center justify-center rounded-full bg-purple-tint"><Icon size={26} color={Colors.purpleSoft} /></View>
    <Text accessibilityRole="header" className="mt-3 text-center text-[16px] font-extrabold text-foreground">{title}</Text>
    <Text className="mt-1 text-center text-[13px] leading-5 text-muted">{body}</Text>
    {children}
  </View>;

/** Full-screen profile of another user (or yourself, with the self-only actions hidden). */
export default function UserProfileModal({userId, initial, visible, onClose, onBlocked}: UserProfileModalProps) {
  const {width} = useWindowDimensions();
  const viewerId = useViewerId();
  const isSelf = !!viewerId && viewerId === userId;

  const [profile, setProfile] = useState<PublicUserProfile | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [access, setAccess] = useState<ProfileAccess>('open');
  const [blocked, setBlocked] = useState(false);
  const [lists, setLists] = useState(emptyLists);
  const [activeTab, setActiveTab] = useState<VisibleTab>('posts');
  const [gifts, setGifts] = useState<UserGiftSummary | null>(null);
  const [sheet, setSheet] = useState<SheetKind | null>(null);
  const [sheetBusy, setSheetBusy] = useState(false);
  const [sheetError, setSheetError] = useState<string | null>(null);
  const [followList, setFollowList] = useState<FollowListKind | null>(null);
  const [nested, setNested] = useState<{userId: string; initial: UserPreview} | null>(null);
  const [chat, setChat] = useState<{id: string} | null>(null);
  const [messaging, setMessaging] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const generation = useRef(0);
  const listsRef = useRef(lists);
  const updateLists = useCallback((updater: (current: Record<UserContentTab, ListState>) => Record<UserContentTab, ListState>) => {
    listsRef.current = updater(listsRef.current);
    setLists(listsRef.current);
  }, []);

  const lookedUpFollowing = useIsFollowing(userId, viewerId, visible && !isSelf && !profile);
  const follow = useFollowToggle(userId, {following: profile?.isFollowing ?? lookedUpFollowing, followers: profile?.stats.followers},
    cause => {if (accessOf(cause) === 'unavailable') setAccess('unavailable');});

  const loadList = useCallback(async (tab: UserContentTab, append = false) => {
    const current = listsRef.current[tab];
    if (current.loading) return;
    const request = generation.current;
    updateLists(state => ({...state, [tab]: {...state[tab], loading: true, error: null}}));
    try {
      const page = await getUserContentPage(userId, tab, append ? current.offset : 0);
      if (request !== generation.current) return;
      updateLists(state => ({...state, [tab]: {
        items: append ? [...state[tab].items, ...page.items] : page.items,
        loading: false, loaded: true, error: null, hasMore: page.hasMore, offset: page.offset + page.items.length,
      }}));
    } catch (cause) {
      if (request !== generation.current) return;
      const denied = accessOf(cause);
      if (denied) setAccess(denied);
      updateLists(state => ({...state, [tab]: {...state[tab], loading: false, loaded: true, error: denied ? null : messageOf(cause)}}));
    }
  }, [userId, updateLists]);

  const loadProfile = useCallback(async () => {
    if (!PUBLIC_PROFILE_ENDPOINT_ENABLED) return;
    const request = generation.current;
    setProfileError(null);
    try {
      const value = await getUserProfile(userId);
      if (request === generation.current) setProfile(value);
    } catch (cause) {
      if (request !== generation.current) return;
      if (accessOf(cause) === 'unavailable') setAccess('unavailable'); else setProfileError(messageOf(cause));
    }
  }, [userId]);

  const loadGifts = useCallback(async () => {
    const request = generation.current;
    try {
      const summary = await getUserGiftSummary(userId);
      if (request === generation.current) setGifts(summary);
    } catch {
      // Gifts are optional: no tab and no stat when the summary isn't available.
    }
  }, [userId]);

  /** Clears everything and loads the profile from scratch. */
  const reload = useCallback(() => {
    generation.current++;
    listsRef.current = emptyLists();
    setLists(listsRef.current);
    setAccess('open');
    setProfileError(null);
    setActiveTab('posts');
    loadProfile();
    loadList('posts');
    loadGifts();
  }, [loadProfile, loadList, loadGifts]);

  useEffect(() => {
    if (!visible) {generation.current++; return;}
    setProfile(null);
    setGifts(null);
    setBlocked(false);
    setSheet(null);
    setFollowList(null);
    setNested(null);
    setChat(null);
    setActionError(null);
    reload();
  }, [visible, userId, reload]);

  const preview = lists.posts.items.length ? (lists.posts.items[0] as UserPost).author : null;
  const name = profile?.name || initial?.name || preview?.name || (lists.posts.loaded ? 'Hiva user' : '');
  const avatarUrl = profile?.avatarUrl ?? initial?.avatarUrl ?? preview?.avatarUrl ?? null;
  const handle = profile?.handle ?? initial?.handle ?? null;
  const unavailable = access === 'unavailable';
  const locked = access === 'private';
  const showContent = !unavailable && !locked && !blocked;
  const canModerate = viewerId !== undefined && !isSelf && !blocked;

  const toggleFollow = async () => {
    setActionError(null);
    const result = await follow.toggle();
    if (!result) return;
    // Following a private profile unlocks it immediately (there are no follow requests).
    if (locked && result.isFollowing) reload();
    else if (profile?.isPrivate && !result.isFollowing && !isSelf) setAccess('private');
  };

  const openMessage = async () => {
    if (messaging) return;
    setMessaging(true);
    setActionError(null);
    try {
      const conversation = await startDirectConversation(userId);
      setChat({id: conversation.id});
    } catch (cause) {
      setActionError(accessOf(cause) === 'private' ? `You can't message ${name} right now.` : messageOf(cause));
    } finally {
      setMessaging(false);
    }
  };

  const share = () => {
    setSheet(null);
    Share.share({message: `${name}${handle ? ` (@${handle})` : ''} is on Hiva Chat. Come hang out!`}).catch(() => {});
  };

  const runSheetAction = async (action: () => Promise<void>) => {
    setSheetBusy(true);
    setSheetError(null);
    try {await action();}
    catch (cause) {setSheetError(messageOf(cause));}
    finally {setSheetBusy(false);}
  };

  const confirmBlock = () => runSheetAction(async () => {
    await blockUser(userId);
    generation.current++;
    setBlocked(true);
    setSheet(null);
    onBlocked?.(userId);
  });

  const unblock = () => runSheetAction(async () => {
    await unblockUser(userId);
    setBlocked(false);
    reload();
  });

  const report = (reason: string) => runSheetAction(async () => {
    await reportUser(userId, reason);
    setSheet('reported');
  });

  const openSheet = (kind: SheetKind) => {setSheetError(null); setSheet(kind);};

  const followers = follow.followers ?? profile?.stats.followers ?? null;
  const giftsReceived = gifts?.totalReceived ?? profile?.stats.giftsReceived ?? null;
  const visibleTabs: VisibleTab[] = gifts ? [...CONTENT_TABS, 'gifts'] : CONTENT_TABS;
  const contentTab = activeTab === 'gifts' ? null : activeTab;
  const list = contentTab ? lists[contentTab] : null;

  const selectTab = (tab: VisibleTab) => {
    setActiveTab(tab);
    if (tab !== 'gifts' && !listsRef.current[tab].loaded) loadList(tab);
  };

  const sheetTitle = sheet === 'block' ? `Block ${name}?` : sheet === 'report' ? `Report ${name}` : sheet === 'reported' ? 'Thanks for telling us' : name;
  const sheetSubtitle = sheet === 'block' ? 'They won’t be able to message you or find you in Nearby, and you won’t see each other’s profiles. They aren’t notified.'
    : sheet === 'report' ? 'Why are you reporting this account? Reports are private.'
    : sheet === 'reported' ? 'Our team will review this account. Reporting doesn’t block them.' : handle ? `@${handle}` : null;

  return <Modal visible={visible} animationType="slide" statusBarTranslucent onRequestClose={onClose}>
    <View className="flex-1 bg-background">
      <StatusBar barStyle="light-content" />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerClassName="pb-12">
        <View>
          <Svg width={width} height="100%" style={StyleSheet.absoluteFill} preserveAspectRatio="none">
            <Defs>
              <RadialGradient id="userHero" cx="20%" cy="0%" rx="120%" ry="90%" fx="20%" fy="0%">
                <Stop offset="0" stopColor="#3B2A86" /><Stop offset="0.45" stopColor="#1A1338" /><Stop offset="0.8" stopColor={Colors.background} /><Stop offset="1" stopColor={Colors.background} />
              </RadialGradient>
            </Defs>
            <Rect width="100%" height="100%" fill="url(#userHero)" />
          </Svg>
          <SafeAreaView edges={['top']}>
            <View className="px-5 pb-5 pt-3">
              <View className="flex-row items-center gap-2">
                <Pressable accessibilityRole="button" accessibilityLabel="Close profile" onPress={onClose}
                  className="h-11 w-11 items-center justify-center rounded-full bg-white/10 active:opacity-70">
                  <IconArrowLeft size={20} color="#FFFFFF" />
                </Pressable>
                <Text numberOfLines={1} className="flex-1 text-center text-[14px] font-bold text-[#C9C2DA]">{handle ? `@${handle}` : ''}</Text>
                {!unavailable ? <Pressable accessibilityRole="button" accessibilityLabel="More options" onPress={() => openSheet('menu')}
                  className="h-11 w-11 items-center justify-center rounded-full bg-white/10 active:opacity-70">
                  <IconDots size={20} color="#FFFFFF" />
                </Pressable> : <View className="h-11 w-11" />}
              </View>

              <View className="mt-[26px] flex-row items-center gap-[22px] pl-2.5">
                <View className="h-[112px] w-[112px] items-center justify-center">
                  <View className="absolute -inset-2.5 rounded-full border-[1.5px] border-dashed border-[#5A4F8C]" />
                  <Svg width={112} height={112} style={StyleSheet.absoluteFill}>
                    <Circle cx={56} cy={56} r={52} stroke={unavailable ? Colors.borderMuted : Colors.gold} strokeWidth={5} fill="none" />
                  </Svg>
                  <Avatar name={name || '?'} url={unavailable ? null : avatarUrl} size={90} />
                </View>
                {showContent || locked ? <View className="min-w-0 flex-1 gap-2.5">
                  <StatPill label="Fans" value={followers} dot="bg-[#8B7CF6]" count="border-[#4A3F8C] bg-[#2A2160]" text="text-foreground" onPress={() => setFollowList('followers')} />
                  <StatPill label="Following" value={profile?.stats.following ?? null} dot="bg-[#3DDC97]" count="border-[#1F5A40] bg-[#123224]" text="text-foreground" onPress={() => setFollowList('following')} />
                  {giftsReceived !== null && <StatPill label="Gifts mile" value={giftsReceived} dot="bg-gold" count="border-gold bg-gold" text="text-gold-ink" />}
                </View> : <View className="flex-1" />}
              </View>

              <View className="mt-5 gap-1.5">
                {name ? <View className="flex-row items-center">
                  <Text accessibilityRole="header" numberOfLines={1} className="shrink font-display text-[24px] tracking-[-0.3px] text-foreground">{name}</Text>
                  {profile?.isPlus === true && !unavailable && <PlusBadge size="md" />}
                </View> : <View accessibilityLabel="Loading profile" className="h-6 w-40 rounded-lg bg-white/10" />}
                {!!profile?.bio && showContent && <Text className="text-[13px] leading-5 text-[#D9D4E4]">{profile.bio}</Text>}
                {!!profile?.city && showContent && <Text className="text-[11px] text-[#9C95AE]">{profile.city}</Text>}
                {!!profile?.interests?.length && showContent && <View className="mt-1 flex-row flex-wrap gap-1.5">
                  {profile.interests.slice(0, 3).map((interest, i) => <Text key={interest} className={`overflow-hidden rounded-full px-2.5 py-1.5 text-[11px] font-extrabold capitalize ${i === 0 ? 'bg-[#2E2410] text-gold' : 'bg-[#241D4A] text-purple-soft'}`}>{interest}</Text>)}
                </View>}
              </View>

              {!!profileError && <View className="mt-4 flex-row items-center gap-3 rounded-[16px] bg-white/5 p-3">
                <Text className="flex-1 text-[13px] text-text-body">{profileError}</Text>
                <Pressable accessibilityRole="button" accessibilityLabel="Retry profile" onPress={loadProfile} className="h-9 flex-row items-center gap-1.5 rounded-full bg-gold px-3.5 active:opacity-80">
                  <IconRefresh size={14} color={Colors.goldInk} /><Text className="text-[12px] font-extrabold text-gold-ink">Retry</Text>
                </Pressable>
              </View>}

              {!unavailable && !blocked && !isSelf && viewerId !== undefined && <View className="mt-4 flex-row gap-2.5">
                <FollowButton name={name} following={follow.following} pending={follow.pending} onPress={toggleFollow} />
                <Pressable accessibilityRole="button" accessibilityLabel={`Message ${name}`} accessibilityState={{busy: messaging}} disabled={messaging} onPress={openMessage}
                  className="h-11 flex-1 flex-row items-center justify-center gap-2 rounded-full border-[1.5px] border-purple-line active:opacity-70">
                  {messaging ? <ActivityIndicator size="small" color="#E6E0FF" /> : <IconMessageCircle size={16} color="#E6E0FF" />}
                  <Text className="text-[13px] font-extrabold text-[#E6E0FF]">Message</Text>
                </Pressable>
              </View>}
              {!!(follow.error || actionError) && <Text accessibilityLiveRegion="polite" className="mt-2 text-[12px] text-coral">{actionError || follow.error}</Text>}
            </View>
          </SafeAreaView>
        </View>

        {unavailable && <StateCard icon={IconUserOff} title="This profile isn't available" body="The account may have been removed, or one of you has blocked the other." />}

        {blocked && <StateCard icon={IconBan} title={`You blocked ${name}`} body="You won't see their profile, posts or rooms, and they can't message you.">
          <Pressable accessibilityRole="button" accessibilityLabel={`Unblock ${name}`} disabled={sheetBusy} onPress={unblock}
            className="mt-4 h-11 flex-row items-center justify-center rounded-full border-[1.5px] border-purple-line px-6 active:opacity-70">
            {sheetBusy ? <ActivityIndicator size="small" color="#E6E0FF" /> : <Text className="text-[13px] font-extrabold text-[#E6E0FF]">Unblock</Text>}
          </Pressable>
          {!!sheetError && <Text className="mt-2 text-[12px] text-coral">{sheetError}</Text>}
        </StateCard>}

        {locked && !blocked && <StateCard icon={IconLock} title="This account is private" body={`Follow ${name} to see their posts, rooms and events.`} />}

        {showContent && <>
          <View accessibilityRole="tablist" className="mx-5 mt-[18px] flex-row gap-0.5 rounded-full border border-border bg-[#15121E] p-1">
            {visibleTabs.map(tab => {
              const selected = activeTab === tab;
              return <Pressable key={tab} accessibilityRole="tab" accessibilityState={{selected}} onPress={() => selectTab(tab)}
                className={`h-10 flex-1 items-center justify-center rounded-full ${selected ? 'bg-gold' : 'active:opacity-70'}`}>
                <Text className={`text-[13px] font-extrabold ${selected ? 'text-gold-ink' : 'text-[#A9A3B8]'}`}>{TAB_LABELS[tab]}</Text>
              </Pressable>;
            })}
          </View>

          <View className="px-5 pb-5 pt-3.5">
            {activeTab === 'gifts' && gifts && <GiftPanel summary={gifts} name={name} />}
            {contentTab && list && <>
              {contentTab === 'posts' && !!list.items.length && <PostGrid posts={list.items as UserPost[]} />}
              {contentTab === 'parties' && !!list.items.length && <RoomGrid parties={list.items as UserParty[]} />}
              {contentTab === 'events' && <View className="gap-3">{(list.items as UserEvent[]).map(event => <EventCard key={event.id} event={event} />)}</View>}
              {list.loading && <ActivityIndicator accessibilityLabel={`Loading ${TAB_LABELS[contentTab]}`} color={Colors.gold} className="my-[30px]" />}
              {!!list.error && <Pressable accessibilityRole="button" accessibilityLabel={`Retry ${TAB_LABELS[contentTab]}`} onPress={() => loadList(contentTab, list.items.length > 0)}
                className="mt-3 rounded-[16px] bg-card p-4 active:opacity-70">
                <Text className="text-sm text-coral">{list.error} Tap to retry.</Text>
              </Pressable>}
              {list.loaded && !list.loading && !list.error && !list.items.length && <View className="items-center py-12">
                <Text className="text-[16px] font-extrabold text-foreground">No {TAB_LABELS[contentTab].toLowerCase()} yet</Text>
              </View>}
              {!list.loading && !list.error && list.hasMore && list.items.length > 0 && <Pressable accessibilityRole="button" accessibilityLabel="Load more" onPress={() => loadList(contentTab, true)}
                className="mt-3 items-center p-[15px] active:opacity-70">
                <Text className="text-sm font-extrabold text-gold">Load more</Text>
              </Pressable>}
            </>}
          </View>
        </>}
      </ScrollView>

      <BottomSheet visible={sheet !== null} onClose={() => setSheet(null)} dismissible={!sheetBusy} title={sheetTitle} subtitle={sheetSubtitle}
        footer={sheet === 'block' ? <>
          <SheetButton label="Block" variant="destructive" busy={sheetBusy} onPress={confirmBlock} />
          <SheetButton label="Cancel" variant="ghost" disabled={sheetBusy} onPress={() => setSheet('menu')} />
        </> : sheet === 'reported' ? <SheetButton label="Done" onPress={() => setSheet(null)} /> : undefined}>
        {sheet === 'menu' && <SheetSection>
          <SheetRow icon={IconShare3} label="Share profile" onPress={share} />
          {canModerate && <SheetRow icon={IconFlag} label="Report" chevron onPress={() => openSheet('report')} />}
          {canModerate && <SheetRow icon={IconBan} label={`Block ${name}`} destructive onPress={() => openSheet('block')} />}
        </SheetSection>}
        {sheet === 'report' && <SheetSection>
          {REPORT_REASONS.map(reason => <SheetRow key={reason} label={reason} disabled={sheetBusy} chevron onPress={() => report(reason)} />)}
        </SheetSection>}
        {sheet === 'reported' && !blocked && <SheetSection>
          <SheetRow icon={IconBan} label={`Also block ${name}`} destructive onPress={() => openSheet('block')} />
        </SheetSection>}
        {sheetBusy && sheet === 'report' && <ActivityIndicator accessibilityLabel="Sending report" color={Colors.gold} className="my-2" />}
        {!!sheetError && sheet !== null && <Text accessibilityLiveRegion="polite" className="mb-2 text-center text-[13px] text-coral">{sheetError}</Text>}
      </BottomSheet>

      {followList && <FollowListSheet userId={userId} kind={followList} ownerName={isSelf ? undefined : name} visible onClose={() => setFollowList(null)}
        onOpenUser={user => {
          setFollowList(null);
          if (user.id !== userId) setNested({userId: user.id, initial: {name: user.name, avatarUrl: user.avatarUrl, handle: user.handle}});
        }} />}

      {nested && <UserProfileModal userId={nested.userId} initial={nested.initial} visible onClose={() => setNested(null)} onBlocked={onBlocked} />}

      {chat && <DirectConversation conversationId={chat.id} contactId={userId} contactName={name} contactAvatarUrl={avatarUrl}
        backLabel="Back to profile" onClose={() => setChat(null)} />}
    </View>
  </Modal>;
}
