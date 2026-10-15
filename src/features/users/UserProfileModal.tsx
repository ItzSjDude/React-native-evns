import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {SLIDE_MODAL_ANIMATION} from '../../Constants/NavigationTransitions';
import {ActivityIndicator, Modal, Pressable, Share, StyleSheet, Text, View, useWindowDimensions} from 'react-native';
import {FlashList} from '@shopify/flash-list';
import ThemedStatusBar from '../../components/ThemedStatusBar';
import ProfileContentTabs from '../../components/ProfileContentTabs';
import ProfileIdentity from '../../components/ProfileIdentity';
import {SafeAreaView} from 'react-native-safe-area-context';
import Svg, {Defs, RadialGradient, Rect, Stop} from 'react-native-svg';
import IconArrowLeft from '@tabler/icons-react-native/IconArrowLeft';
import IconDots from '@tabler/icons-react-native/IconDots';
import IconLock from '@tabler/icons-react-native/IconLock';
import IconUserOff from '@tabler/icons-react-native/IconUserOff';
import IconMessageCircle from '@tabler/icons-react-native/IconMessageCircle';
import IconRefresh from '@tabler/icons-react-native/IconRefresh';
import IconShare3 from '@tabler/icons-react-native/IconShare3';
import IconFlag from '@tabler/icons-react-native/IconFlag';
import IconBan from '@tabler/icons-react-native/IconBan';
import BottomSheet, {SheetButton, SheetRow, SheetSection} from '../../components/BottomSheet';
import {Colors} from '../../Constants/Colors';
import {DirectConversation, startDirectConversation} from '../messages';
import {PlusBadge, useProfileTheme} from '../plus';
import FollowButton from './FollowButton';
import FollowListSheet from './FollowListSheet';
import {useFollowToggle, useIsFollowing, useViewerId} from './followState';
import {ContentRowView, GiftPanel, compact, eventRows, postRows, roomRows, type UserContentRow} from './UserProfileItems';
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

const noRows: UserContentRow[] = [];
const rowKey = (row: UserContentRow) => row.key;
/** Post grids, room grids and event cards have different layouts, so each kind recycles on its own. */
const rowType = (row: UserContentRow) => row.kind;
const LIST_CONTENT = {paddingBottom: 48};
const renderRow = ({item, index}: {item: UserContentRow; index: number}) => <ContentRowView row={item} first={index === 0} />;
const emptyList = (): ListState => ({items: [], loading: false, loaded: false, error: null, hasMore: false, offset: 0});
const emptyLists = (): Record<UserContentTab, ListState> => ({posts: emptyList(), parties: emptyList(), events: emptyList()});

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
  const theme = useProfileTheme(unavailable ? null : profile?.profileTheme);
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
  const stats = showContent || locked ? [
    {label: 'Fans', value: followers, displayValue: followers === null ? '—' : compact(followers), dotClassName: 'bg-[#6CB4FF]', onPress: () => setFollowList('followers')},
    {label: 'Following', value: profile?.stats.following ?? null, displayValue: profile ? compact(profile.stats.following) : '—', dotClassName: 'bg-[#3DDC97]', onPress: () => setFollowList('following')},
    ...(giftsReceived === null ? [] : [{label: 'Gifts', value: giftsReceived, displayValue: compact(giftsReceived), dotClassName: 'bg-[#8B7CF6]'}]),
  ] : [];
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

  // The active content tab as virtualized rows (post/room grid rows, event cards); the gifts tab has no rows.
  const rows = useMemo(() => {
    if (!list || !contentTab) return noRows;
    if (contentTab === 'posts') return postRows(list.items as UserPost[]);
    if (contentTab === 'parties') return roomRows(list.items as UserParty[]);
    return eventRows(list.items as UserEvent[]);
  }, [contentTab, list]);

  return <Modal visible={visible} animationType={SLIDE_MODAL_ANIMATION} statusBarTranslucent onRequestClose={onClose}>
    <View className="flex-1 bg-background">
      <ThemedStatusBar />
      <FlashList showsVerticalScrollIndicator={false} contentContainerStyle={LIST_CONTENT}
        data={showContent ? rows : noRows} keyExtractor={rowKey} getItemType={rowType} renderItem={renderRow}
        ListHeaderComponent={<>
        <View>
          <Svg width={width} height="100%" style={StyleSheet.absoluteFill} preserveAspectRatio="none">
            <Defs>
              <RadialGradient id="userHero" cx="20%" cy="0%" rx="120%" ry="90%" fx="20%" fy="0%">
                <Stop offset="0" stopColor={theme?.glow ?? Colors.profileGlow} /><Stop offset="0.6" stopColor={Colors.background} /><Stop offset="1" stopColor={Colors.background} />
              </RadialGradient>
            </Defs>
            <Rect width="100%" height="100%" fill="url(#userHero)" />
          </Svg>
          <SafeAreaView edges={['top']}>
            <View className="pb-5">
              <View className="h-14 flex-row items-center gap-3 px-5 pt-3">
                <Pressable accessibilityRole="button" accessibilityLabel="Close profile" onPress={onClose}
                  className="h-11 w-11 items-center justify-center rounded-full border border-border dark:border-[#2E2A4A] bg-card dark:bg-[#17152A] active:opacity-70">
                  <IconArrowLeft size={20} color={Colors.iconStrong} />
                </Pressable>
                <Text numberOfLines={1} className="flex-1 font-display-semibold text-[22px] tracking-[-0.4px] text-foreground">{handle ? `@${handle}` : 'Profile'}</Text>
                {!unavailable ? <Pressable accessibilityRole="button" accessibilityLabel="More options" onPress={() => openSheet('menu')}
                  className="h-11 w-11 items-center justify-center rounded-full border border-border dark:border-[#2E2A4A] bg-card dark:bg-[#17152A] active:opacity-70">
                  <IconDots size={20} color={Colors.iconStrong} />
                </Pressable> : <View className="h-11 w-11" />}
              </View>

              <ProfileIdentity name={name || 'Hiva user'} avatarUrl={unavailable ? null : avatarUrl} accentColor={unavailable ? Colors.borderMuted : theme?.accent ?? Colors.gold} stats={stats}
                nameAccessory={profile?.showPlusBadge === true && !unavailable ? <PlusBadge size="md" /> : null}>
                {!!profile?.bio && showContent && <Text className="text-[13px] leading-5 text-text-body dark:text-[#D9D4E4]">{profile.bio}</Text>}
                {!!profile?.city && showContent && <Text className="text-[12px] text-muted dark:text-[#9C97B8]">{profile.city}</Text>}
                {!!profile?.interests?.length && showContent && <View className="mt-1 flex-row flex-wrap gap-1.5">
                  {profile.interests.slice(0, 3).map((interest, i) => <Text key={interest} className={`overflow-hidden rounded-full px-2.5 py-1.5 text-[11px] font-extrabold capitalize ${i === 0 ? 'bg-gold-bg dark:bg-[#2E2410] text-gold' : 'bg-purple-tint dark:bg-[#241D4A] text-purple-soft'}`}>{interest}</Text>)}
                </View>}
              </ProfileIdentity>

              {!!profileError && <View className="mt-4 flex-row items-center gap-3 rounded-[16px] bg-white/5 p-3">
                <Text className="flex-1 text-[13px] text-text-body">{profileError}</Text>
                <Pressable accessibilityRole="button" accessibilityLabel="Retry profile" onPress={loadProfile} className="h-9 flex-row items-center gap-1.5 rounded-full bg-gold px-3.5 active:opacity-80">
                  <IconRefresh size={14} color={Colors.goldInk} /><Text className="text-[12px] font-extrabold text-gold-ink">Retry</Text>
                </Pressable>
              </View>}

              {!unavailable && !blocked && !isSelf && viewerId !== undefined && <View className="mx-5 mt-4 flex-row gap-3">
                <FollowButton name={name} following={follow.following} pending={follow.pending} onPress={toggleFollow} />
                <Pressable accessibilityRole="button" accessibilityLabel={`Message ${name}`} accessibilityState={{busy: messaging}} disabled={messaging} onPress={openMessage}
                  className="h-10 flex-1 flex-row items-center justify-center gap-2 rounded-full border-[1.5px] border-purple-line active:opacity-70">
                  {messaging ? <ActivityIndicator size="small" color={Colors.gold} /> : <IconMessageCircle size={16} color={Colors.textSoft} />}
                  <Text className="text-[13px] font-extrabold text-foreground dark:text-[#E6E0FF]">Message</Text>
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
            {sheetBusy ? <ActivityIndicator size="small" color={Colors.gold} /> : <Text className="text-[13px] font-extrabold text-foreground dark:text-[#E6E0FF]">Unblock</Text>}
          </Pressable>
          {!!sheetError && <Text className="mt-2 text-[12px] text-coral">{sheetError}</Text>}
        </StateCard>}

        {locked && !blocked && <StateCard icon={IconLock} title="This account is private" body={`Follow ${name} to see their posts, rooms and events.`} />}

        {showContent && <ProfileContentTabs tabs={visibleTabs.map(tab => ({id: tab, label: TAB_LABELS[tab]}))} selected={activeTab} onSelect={tab => selectTab(tab)} accentColor={theme?.accent ?? Colors.gold} onAccentColor={theme?.onAccent ?? Colors.goldInk} />}
        {showContent && <View className="h-3.5" />}
        </>}
        ListFooterComponent={showContent ? <View className="px-5 pb-5">
          {activeTab === 'gifts' && gifts && <GiftPanel summary={gifts} name={name} />}
          {contentTab && list && <>
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
        </View> : undefined} />

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
