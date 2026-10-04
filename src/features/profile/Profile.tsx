import React, {useCallback, useEffect, useRef, useState} from 'react';
import {ActivityIndicator, Alert, Image, Pressable, RefreshControl, ScrollView, StatusBar, TextInput, View} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import LinearGradient from 'react-native-linear-gradient';
import {cssInterop} from 'nativewind';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useAppDispatch} from '../../core/store/hooks';
import {clearSession, logoutFromApi} from '../auth';
import {Colors} from '../../Constants/Colors';
import AppIcon, {IconName} from '../../Constants/Icons';
import Typography from '../../Constants/Typography';
import {getMyProfile, getProfilePage, updateMyProfile} from './profileService';
import type {ProfileItem, ProfilePost, ProfileTab, UserProfile} from './types';

cssInterop(LinearGradient, {className: 'style'});
cssInterop(SafeAreaView, {className: 'style'});

type ListState = {items: ProfileItem[]; loading: boolean; loaded: boolean; error: string | null; hasMore: boolean; offset: number};
const emptyList = (): ListState => ({items: [], loading: false, loaded: false, error: null, hasMore: true, offset: 0});
const tabs: ProfileTab[] = ['posts', 'parties', 'events'];
const accountItems: {label: string; icon: IconName; message: string}[] = [
  {label: 'Nearby visibility', icon: 'location', message: 'Nearby visibility settings are coming soon.'},
  {label: 'Blocked people', icon: 'people', message: 'Blocked people settings are coming soon.'},
  {label: 'Security', icon: 'shield', message: 'Security settings are coming soon.'},
];
const messageOf = (error: unknown) => (error as {message?: string})?.message ?? 'Please try again.';

const Profile = () => {
  const dispatch = useAppDispatch();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<ProfileTab>('posts');
  const [lists, setLists] = useState<Record<ProfileTab, ListState>>({posts: emptyList(), parties: emptyList(), events: emptyList()});
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({name: '', handle: '', bio: '', city: ''});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const profileRequest = useRef(0);
  const visibleProfile = useRef(profile);
  visibleProfile.current = profile;
  const visibleTab = useRef(activeTab);
  visibleTab.current = activeTab;
  const listsRef = useRef(lists);
  const editingRef = useRef(false);
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
      if (!editingRef.current) setDraft({name: value.name ?? '', handle: value.handle ?? '', bio: value.bio ?? '', city: value.city ?? ''});
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

  const onRefresh = async () => {
    await loadProfile(true);
    if (profile?.id) await loadList(profile.id, activeTab);
  };

  const startEditing = () => {
    if (!profile) return;
    setDraft({name: profile.name ?? '', handle: profile.handle ?? '', bio: profile.bio ?? '', city: profile.city ?? ''});
    setSaveError(null);
    editingRef.current = true;
    setEditing(true);
  };

  const save = async () => {
    if (!profile || saving) return;
    const name = draft.name.trim();
    const handle = draft.handle.trim().toLowerCase();
    if (name.length < 2 || name.length > 80) {setSaveError('Name must be 2–80 characters.'); return;}
    if ((handle || profile.handle) && !/^[a-z0-9_]{3,30}$/.test(handle)) {setSaveError('Handle must be 3–30 letters, numbers, or underscores.'); return;}
    if (draft.bio.trim().length > 240) {setSaveError('Bio must be 240 characters or less.'); return;}
    if (draft.city.trim().length > 80) {setSaveError('City must be 80 characters or less.'); return;}
    setSaving(true);
    setSaveError(null);
    try {
      const updated = await updateMyProfile({name, ...(handle ? {handle} : {}), bio: draft.bio.trim() || null, city: draft.city.trim() || null});
      profileRequest.current++;
      setProfile(updated);
      setDraft({name: updated.name ?? '', handle: updated.handle ?? '', bio: updated.bio ?? '', city: updated.city ?? ''});
      editingRef.current = false;
      setEditing(false);
    } catch (error) {setSaveError(messageOf(error));}
    finally {setSaving(false);}
  };

  const handleLogout = () => {
    Alert.alert('Log out', 'Are you sure you want to log out?', [
      {text: 'Cancel', style: 'cancel'},
      {text: 'Log out', style: 'destructive', onPress: async () => {
        try {await logoutFromApi();}
        finally {dispatch(clearSession());}
      }},
    ]);
  };

  const list = lists[activeTab];
  const displayName = profile?.name ?? '';
  const avatar = profile?.avatar_url;
  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <StatusBar barStyle="light-content" />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerClassName="pb-[125px]"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}>
        <LinearGradient colors={['#332452', '#171327', Colors.background]} className="h-[142px] overflow-hidden">
          {profile?.cover_image_url ? <Image source={{uri: profile.cover_image_url}} className="h-full w-full" resizeMode="cover" /> : <View className="absolute bottom-[10px] -right-10 h-[110px] w-[250px] rotate-[-12deg] rounded-[120px] bg-[#5B4086] opacity-20" />}
        </LinearGradient>
        <View className="-mt-9 px-5">
          <View className="flex-row items-center">
            <LinearGradient colors={['#F5C58D', '#463B75']} className="h-[116px] w-[116px] rounded-[58px] p-[3px]">
              <View className="flex-1 items-center justify-center rounded-[55px] bg-[#28253B]">{avatar ? <Image source={{uri: avatar}} className="h-full w-full rounded-[55px]" /> : <AppIcon name="user" size={48} color={Colors.text} />}</View>
            </LinearGradient>
            <View className="ml-[15px] min-w-0 flex-1 pt-[31px]">
              {profile ? <><Typography size={24} color={Colors.text} fontWeight="600" numsOfLine={1}>{displayName}</Typography>
                {profile.handle ? <Typography size={15} color={Colors.muted} numsOfLine={1}>@{profile.handle}</Typography> : null}
                <Typography size={13} color={Colors.muted} numsOfLine={1}>{profile.email}</Typography></> : null}
            </View>
            {profile && !editing ? <Pressable accessibilityRole="button" accessibilityLabel="Edit profile" onPress={startEditing} className="mt-7 flex-row items-center rounded-[22px] border border-[#8A6BFF] px-[13px] py-[10px] active:opacity-70"><AppIcon name="edit" size={17} color={Colors.primary} /><Typography size={14} color={Colors.primary} fontWeight="600" className="ml-[5px]">Edit</Typography></Pressable> : null}
          </View>
          {profileLoading && !profile ? <ActivityIndicator accessibilityLabel="Loading profile" color={Colors.primary} className="my-[30px]" /> : null}
          {profileError ? <View className="mt-[15px] gap-3 rounded-[14px] bg-card p-4"><Typography color={Colors.textBody}>{profileError}</Typography><Pressable accessibilityRole="button" onPress={() => loadProfile()}><Typography color={Colors.primary}>Retry</Typography></Pressable></View> : null}
          {profile && !editing ? <>
            {profile.bio ? <Typography size={16} color={Colors.muted} className="mt-[17px] leading-[23px]">{profile.bio}</Typography> : null}
            {profile.interests?.length ? <View className="mt-[13px] flex-row flex-wrap gap-2">{profile.interests.map(interest => <View key={interest} className="flex-row items-center rounded-[22px] border border-[#4A4659] bg-card px-3 py-2"><AppIcon name={interestIcon(interest)} size={17} color={Colors.text} /><Typography size={13} color={Colors.textBody} className="ml-[6px]">{interest}</Typography></View>)}</View> : null}
            {profile.city ? <View className="mt-[14px] flex-row items-center"><AppIcon name="location" size={19} color={Colors.muted} /><Typography size={15} color={Colors.muted} className="ml-[7px]">{profile.city}</Typography></View> : null}
            <View className="mt-[18px] flex-row items-center"><Typography size={15} color={Colors.textBody}><Typography size={15} color={Colors.text} fontWeight="600">{profile.stats?.following ?? 0}</Typography> Following</Typography><View className="mx-[22px] h-[22px] w-px bg-[#4A4659]" /><Typography size={15} color={Colors.textBody}><Typography size={15} color={Colors.text} fontWeight="600">{profile.stats?.hosted ?? 0}</Typography> Hosted</Typography></View>
          </> : null}
          {profile && editing ? <View className="mt-[22px] gap-[15px]">
            <Field label="Name" value={draft.name} onChangeText={name => setDraft(current => ({...current, name}))} maxLength={80} />
            <Field label="Handle" value={draft.handle} onChangeText={handle => setDraft(current => ({...current, handle}))} autoCapitalize="none" maxLength={30} />
            <Field label="Bio" value={draft.bio} onChangeText={bio => setDraft(current => ({...current, bio}))} multiline maxLength={240} />
            <Field label="City" value={draft.city} onChangeText={city => setDraft(current => ({...current, city}))} maxLength={80} />
            {saveError ? <Typography color={Colors.coral}>{saveError}</Typography> : null}
            <View className="mt-[2px] flex-row gap-[10px]">
              <Pressable accessibilityRole="button" onPress={() => {editingRef.current = false; setEditing(false); setSaveError(null);}} className="min-h-[44px] flex-1 items-center justify-center rounded-xl bg-card"><Typography color={Colors.textBody}>Cancel</Typography></Pressable>
              <Pressable accessibilityRole="button" disabled={saving} onPress={() => save()} className="min-h-[44px] flex-1 items-center justify-center rounded-xl bg-primary"><Typography color={Colors.textDark} fontWeight="700">{saving ? 'Saving…' : 'Save changes'}</Typography></Pressable>
            </View>
          </View> : null}
          {profile && !editing ? <>
            <View className="mt-[22px] flex-row justify-around border-b border-[#363342]">{tabs.map(tab => <Pressable key={tab} accessibilityRole="tab" accessibilityState={{selected: activeTab === tab}} onPress={() => setActiveTab(tab)} className="items-center px-[15px] pb-[11px]"><Typography size={16} color={activeTab === tab ? Colors.primary : Colors.muted} fontWeight={activeTab === tab ? '600' : '400'}>{tab[0].toUpperCase() + tab.slice(1)}</Typography>{activeTab === tab && <View className="absolute -bottom-px h-[3px] w-[62px] rounded-[2px] bg-primary" />}</Pressable>)}</View>
            {list.items.map(item => <ProfileListItem key={item.id} item={item} tab={activeTab} profile={profile} />)}
            {list.loading ? <ActivityIndicator accessibilityLabel={`Loading ${activeTab}`} color={Colors.primary} className="my-[30px]" /> : null}
            {list.error ? <View className="mt-[15px] gap-3 rounded-[14px] bg-card p-4"><Typography color={Colors.textBody}>{list.error}</Typography><Pressable accessibilityRole="button" onPress={() => loadList(profile.id, activeTab, list.items.length > 0)}><Typography color={Colors.primary}>Retry</Typography></Pressable></View> : null}
            {!list.loading && !list.error && list.items.length === 0 ? <Typography size={14} color={Colors.muted} className="py-[34px] text-center">No {activeTab} yet.</Typography> : null}
            {!list.loading && !list.error && list.hasMore && list.items.length > 0 ? <Pressable accessibilityRole="button" onPress={() => loadList(profile.id, activeTab, true)} className="items-center p-[15px]"><Typography color={Colors.primary} fontWeight="600">Load more</Typography></Pressable> : null}
          </> : null}
          <Typography size={18} color={Colors.text} fontWeight="600" className="mb-[11px] mt-[25px]">Account &amp; privacy</Typography>
          <View className="rounded-[17px] border border-[#363342] bg-card px-[15px]">{accountItems.map((item, index) => <Pressable key={item.label} accessibilityRole="button" onPress={() => Alert.alert(item.label, item.message)} className={`h-[57px] flex-row items-center active:opacity-70 ${index < accountItems.length - 1 ? 'border-b border-[#363342]' : ''}`}><AppIcon name={item.icon} size={23} color={Colors.muted} /><Typography size={15} color={Colors.textBody} className="ml-[15px] flex-1">{item.label}</Typography><AppIcon name="chevron" size={19} color={Colors.muted} /></Pressable>)}</View>
          <Pressable accessibilityRole="button" onPress={handleLogout} className="mt-[19px] h-[54px] flex-row items-center justify-center rounded-[17px] border border-[#713A48] bg-[#291722] active:opacity-70"><AppIcon name="logout" size={20} color={Colors.coral} /><Typography size={16} color={Colors.coral} fontWeight="600" className="ml-[9px]">Log out</Typography></Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const Field = ({label, ...props}: {label: string} & React.ComponentProps<typeof TextInput>) => <View className="gap-[7px]"><Typography size={13} color={Colors.muted} fontWeight="600">{label}</Typography><TextInput {...props} accessibilityLabel={label} placeholderTextColor={Colors.muted} className={`min-h-[44px] rounded-xl bg-card px-[14px] text-[15px] text-foreground ${props.multiline ? 'min-h-[92px] pt-3' : ''}`} textAlignVertical={props.multiline ? 'top' : undefined} /></View>;
const interestIcon = (interest: string): IconName => {
  const value = interest.toLowerCase();
  if (value.includes('music')) return 'music';
  if (value.includes('football') || value.includes('sport')) return 'football';
  if (value.includes('startup') || value.includes('tech')) return 'rocket';
  return 'plus';
};
const dateLabel = (value: string | null) => {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString(undefined, {month: 'short', day: 'numeric'});
};
const ProfileListItem = ({item, tab, profile}: {item: ProfileItem; tab: ProfileTab; profile: UserProfile}) => {
  const post = tab === 'posts' ? item as ProfilePost : null;
  const title = post?.body || (item as {title?: string}).title || 'Post';
  const detail = post ? dateLabel(post.createdAt) : tab === 'parties'
    ? dateLabel((item as {scheduled_start_at: string | null}).scheduled_start_at)
    : dateLabel((item as {starts_at: string}).starts_at);
  return <View className="mt-[14px] rounded-[18px] border border-[#363342] bg-card p-[15px]">
    <View className="flex-row items-center">
      <View className="h-[38px] w-[38px] items-center justify-center rounded-[19px] bg-[#453E60]">{profile.avatar_url ? <Image source={{uri: profile.avatar_url}} className="h-full w-full rounded-[19px]" /> : <AppIcon name="user" size={20} color={Colors.text} />}</View>
      <View className="ml-[10px] flex-1"><Typography size={15} color={Colors.text} fontWeight="600" numsOfLine={1}>{profile.name}</Typography><Typography size={12} color={Colors.muted} numsOfLine={1}>{profile.handle ? `@${profile.handle}` : profile.email}{detail ? ` · ${detail}` : ''}</Typography></View>
      <AppIcon name="menu" size={20} color={Colors.muted} />
    </View>
    <Typography size={16} color={Colors.textBody} className="mt-[14px] leading-[23px]">{title}</Typography>
    {post ? <View className="mt-[18px] flex-row items-center gap-5"><View className="flex-row items-center gap-1"><AppIcon name="heart" size={18} color={Colors.coral} /><Typography size={14} color={Colors.coral}>{post.reactions?.likeCount ?? 0}</Typography></View><View className="flex-row items-center gap-1"><AppIcon name="comment" size={18} color={Colors.muted} /><Typography size={14} color={Colors.muted}>{post.commentCount ?? 0}</Typography></View><AppIcon name="share" size={20} color={Colors.muted} /></View>
      : <View className="mt-[18px] flex-row items-center gap-5"><AppIcon name={tab === 'parties' ? 'people' : 'location'} size={18} color={Colors.muted} /><Typography size={14} color={Colors.muted}>{tab === 'parties' ? `${(item as {participant_count: number}).participant_count} participants` : `${(item as {attendee_count: number}).attendee_count} attending`}</Typography></View>}
  </View>;
};

export default Profile;
