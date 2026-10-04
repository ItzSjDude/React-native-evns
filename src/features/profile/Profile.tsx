import React, {useCallback, useEffect, useRef, useState} from 'react';
import {ActivityIndicator, Alert, Image, Pressable, RefreshControl, ScrollView, StatusBar, StyleSheet, TextInput, View} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import LinearGradient from 'react-native-linear-gradient';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useAppDispatch} from '../../core/store/hooks';
import {clearSession, logoutFromApi} from '../auth';
import {Colors} from '../../Constants/Colors';
import AppIcon, {IconName} from '../../Constants/Icons';
import Typography from '../../Constants/Typography';
import {getMyProfile, getProfilePage, updateMyProfile} from './profileService';
import type {ProfileItem, ProfilePost, ProfileTab, UserProfile} from './types';

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
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <StatusBar barStyle="light-content" />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}>
        <LinearGradient colors={['#332452', '#171327', Colors.background]} style={styles.cover}>
          {profile?.cover_image_url ? <Image source={{uri: profile.cover_image_url}} style={styles.coverImage} resizeMode="cover" /> : <View style={styles.coverGlow} />}
        </LinearGradient>
        <View style={styles.body}>
          <View style={styles.identityRow}>
            <LinearGradient colors={['#F5C58D', '#463B75']} style={styles.avatarRing}>
              <View style={styles.avatar}>{avatar ? <Image source={{uri: avatar}} style={styles.avatarImage} /> : <AppIcon name="user" size={48} color={Colors.text} />}</View>
            </LinearGradient>
            <View style={styles.identity}>
              {profile ? <><Typography size={24} color={Colors.text} fontWeight="600" numsOfLine={1}>{displayName}</Typography>
                {profile.handle ? <Typography size={15} color={Colors.muted} numsOfLine={1}>@{profile.handle}</Typography> : null}
                <Typography size={13} color={Colors.muted} numsOfLine={1}>{profile.email}</Typography></> : null}
            </View>
            {profile && !editing ? <Pressable accessibilityRole="button" accessibilityLabel="Edit profile" onPress={startEditing} style={({pressed}) => [styles.editButton, pressed && styles.pressed]}><AppIcon name="edit" size={17} color={Colors.primary} /><Typography size={14} color={Colors.primary} fontWeight="600" style={styles.editLabel}>Edit</Typography></Pressable> : null}
          </View>
          {profileLoading && !profile ? <ActivityIndicator accessibilityLabel="Loading profile" color={Colors.primary} style={styles.loading} /> : null}
          {profileError ? <View style={styles.message}><Typography color={Colors.textBody}>{profileError}</Typography><Pressable accessibilityRole="button" onPress={() => loadProfile()}><Typography color={Colors.primary}>Retry</Typography></Pressable></View> : null}
          {profile && !editing ? <>
            {profile.bio ? <Typography size={16} color={Colors.muted} style={styles.bio}>{profile.bio}</Typography> : null}
            {profile.interests?.length ? <View style={styles.interests}>{profile.interests.map(interest => <View key={interest} style={styles.interestPill}><AppIcon name={interestIcon(interest)} size={17} color={Colors.text} /><Typography size={13} color={Colors.textBody} style={styles.interestText}>{interest}</Typography></View>)}</View> : null}
            {profile.city ? <View style={styles.locationRow}><AppIcon name="location" size={19} color={Colors.muted} /><Typography size={15} color={Colors.muted} style={styles.locationText}>{profile.city}</Typography></View> : null}
            <View style={styles.stats}><Typography size={15} color={Colors.textBody}><Typography size={15} color={Colors.text} fontWeight="600">{profile.stats?.following ?? 0}</Typography> Following</Typography><View style={styles.statDivider} /><Typography size={15} color={Colors.textBody}><Typography size={15} color={Colors.text} fontWeight="600">{profile.stats?.hosted ?? 0}</Typography> Hosted</Typography></View>
          </> : null}
          {profile && editing ? <View style={styles.form}>
            <Field label="Name" value={draft.name} onChangeText={name => setDraft(current => ({...current, name}))} maxLength={80} />
            <Field label="Handle" value={draft.handle} onChangeText={handle => setDraft(current => ({...current, handle}))} autoCapitalize="none" maxLength={30} />
            <Field label="Bio" value={draft.bio} onChangeText={bio => setDraft(current => ({...current, bio}))} multiline maxLength={240} />
            <Field label="City" value={draft.city} onChangeText={city => setDraft(current => ({...current, city}))} maxLength={80} />
            {saveError ? <Typography color={Colors.coral}>{saveError}</Typography> : null}
            <View style={styles.formActions}>
              <Pressable accessibilityRole="button" onPress={() => {editingRef.current = false; setEditing(false); setSaveError(null);}} style={styles.cancelButton}><Typography color={Colors.textBody}>Cancel</Typography></Pressable>
              <Pressable accessibilityRole="button" disabled={saving} onPress={() => save()} style={styles.saveButton}><Typography color={Colors.textDark} fontWeight="700">{saving ? 'Saving…' : 'Save changes'}</Typography></Pressable>
            </View>
          </View> : null}
          {profile && !editing ? <>
            <View style={styles.tabs}>{tabs.map(tab => <Pressable key={tab} accessibilityRole="tab" accessibilityState={{selected: activeTab === tab}} onPress={() => setActiveTab(tab)} style={styles.tab}><Typography size={16} color={activeTab === tab ? Colors.primary : Colors.muted} fontWeight={activeTab === tab ? '600' : '400'}>{tab[0].toUpperCase() + tab.slice(1)}</Typography>{activeTab === tab && <View style={styles.tabIndicator} />}</Pressable>)}</View>
            {list.items.map(item => <ProfileListItem key={item.id} item={item} tab={activeTab} profile={profile} />)}
            {list.loading ? <ActivityIndicator accessibilityLabel={`Loading ${activeTab}`} color={Colors.primary} style={styles.loading} /> : null}
            {list.error ? <View style={styles.message}><Typography color={Colors.textBody}>{list.error}</Typography><Pressable accessibilityRole="button" onPress={() => loadList(profile.id, activeTab, list.items.length > 0)}><Typography color={Colors.primary}>Retry</Typography></Pressable></View> : null}
            {!list.loading && !list.error && list.items.length === 0 ? <Typography size={14} color={Colors.muted} style={styles.empty}>No {activeTab} yet.</Typography> : null}
            {!list.loading && !list.error && list.hasMore && list.items.length > 0 ? <Pressable accessibilityRole="button" onPress={() => loadList(profile.id, activeTab, true)} style={styles.more}><Typography color={Colors.primary} fontWeight="600">Load more</Typography></Pressable> : null}
          </> : null}
          <Typography size={18} color={Colors.text} fontWeight="600" style={styles.sectionTitle}>Account &amp; privacy</Typography>
          <View style={styles.accountCard}>{accountItems.map((item, index) => <Pressable key={item.label} accessibilityRole="button" onPress={() => Alert.alert(item.label, item.message)} style={({pressed}) => [styles.accountRow, pressed && styles.pressed, index < accountItems.length - 1 && styles.accountBorder]}><AppIcon name={item.icon} size={23} color={Colors.muted} /><Typography size={15} color={Colors.textBody} style={styles.accountLabel}>{item.label}</Typography><AppIcon name="chevron" size={19} color={Colors.muted} /></Pressable>)}</View>
          <Pressable accessibilityRole="button" onPress={handleLogout} style={({pressed}) => [styles.logoutButton, pressed && styles.pressed]}><AppIcon name="logout" size={20} color={Colors.coral} /><Typography size={16} color={Colors.coral} fontWeight="600" style={styles.logoutText}>Log out</Typography></Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const Field = ({label, ...props}: {label: string} & React.ComponentProps<typeof TextInput>) => <View style={styles.field}><Typography size={13} color={Colors.muted} fontWeight="600">{label}</Typography><TextInput {...props} accessibilityLabel={label} placeholderTextColor={Colors.muted} style={[styles.input, props.multiline && styles.multiline]} /></View>;
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
  return <View style={styles.postCard}>
    <View style={styles.postHeader}>
      <View style={styles.miniAvatar}>{profile.avatar_url ? <Image source={{uri: profile.avatar_url}} style={styles.miniAvatarImage} /> : <AppIcon name="user" size={20} color={Colors.text} />}</View>
      <View style={styles.postAuthor}><Typography size={15} color={Colors.text} fontWeight="600" numsOfLine={1}>{profile.name}</Typography><Typography size={12} color={Colors.muted} numsOfLine={1}>{profile.handle ? `@${profile.handle}` : profile.email}{detail ? ` · ${detail}` : ''}</Typography></View>
      <AppIcon name="menu" size={20} color={Colors.muted} />
    </View>
    <Typography size={16} color={Colors.textBody} style={styles.postText}>{title}</Typography>
    {post ? <View style={styles.postActions}><View style={styles.reactionCount}><AppIcon name="heart" size={18} color={Colors.coral} /><Typography size={14} color={Colors.coral}>{post.reactions?.likeCount ?? 0}</Typography></View><View style={styles.reactionCount}><AppIcon name="comment" size={18} color={Colors.muted} /><Typography size={14} color={Colors.muted}>{post.commentCount ?? 0}</Typography></View><AppIcon name="share" size={20} color={Colors.muted} /></View>
      : <View style={styles.postActions}><AppIcon name={tab === 'parties' ? 'people' : 'location'} size={18} color={Colors.muted} /><Typography size={14} color={Colors.muted}>{tab === 'parties' ? `${(item as {participant_count: number}).participant_count} participants` : `${(item as {attendee_count: number}).attendee_count} attending`}</Typography></View>}
  </View>;
};

export default Profile;

const styles = StyleSheet.create({
  safeArea: {flex: 1, backgroundColor: Colors.background}, content: {paddingBottom: 125},
  cover: {height: 142, overflow: 'hidden'}, coverImage: {width: '100%', height: '100%'}, coverGlow: {position: 'absolute', width: 250, height: 110, right: -40, bottom: 10, borderRadius: 120, backgroundColor: '#5B4086', opacity: 0.2, transform: [{rotate: '-12deg'}]},
  body: {paddingHorizontal: 20, marginTop: -36}, identityRow: {flexDirection: 'row', alignItems: 'center'},
  avatarRing: {width: 116, height: 116, borderRadius: 58, padding: 3}, avatar: {flex: 1, borderRadius: 55, backgroundColor: '#28253B', alignItems: 'center', justifyContent: 'center'}, avatarImage: {width: '100%', height: '100%', borderRadius: 55},
  identity: {flex: 1, marginLeft: 15, paddingTop: 31, minWidth: 0},
  editButton: {borderWidth: 1, borderColor: Colors.primaryBorder, borderRadius: 22, paddingVertical: 10, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', marginTop: 28}, editLabel: {marginLeft: 5},
  bio: {marginTop: 17, lineHeight: 23},
  interests: {flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 13}, interestPill: {flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: Colors.borderMuted, borderRadius: 22, paddingVertical: 8, paddingHorizontal: 12, backgroundColor: Colors.card}, interestText: {marginLeft: 6},
  locationRow: {flexDirection: 'row', alignItems: 'center', marginTop: 14}, locationText: {marginLeft: 7},
  stats: {flexDirection: 'row', alignItems: 'center', marginTop: 18}, statDivider: {height: 22, width: 1, backgroundColor: Colors.borderMuted, marginHorizontal: 22},
  tabs: {flexDirection: 'row', justifyContent: 'space-around', marginTop: 22, borderBottomWidth: 1, borderBottomColor: Colors.border}, tab: {alignItems: 'center', paddingHorizontal: 15, paddingBottom: 11}, tabIndicator: {height: 3, width: 62, borderRadius: 2, backgroundColor: Colors.primary, position: 'absolute', bottom: -1},
  postCard: {backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.border, borderRadius: 18, padding: 15, marginTop: 14}, postHeader: {flexDirection: 'row', alignItems: 'center'}, miniAvatar: {width: 38, height: 38, borderRadius: 19, backgroundColor: '#453E60', alignItems: 'center', justifyContent: 'center'}, miniAvatarImage: {width: '100%', height: '100%', borderRadius: 19}, postAuthor: {flex: 1, marginLeft: 10}, postText: {marginTop: 14, lineHeight: 23}, postActions: {flexDirection: 'row', alignItems: 'center', gap: 20, marginTop: 18}, reactionCount: {flexDirection: 'row', alignItems: 'center', gap: 4},
  empty: {textAlign: 'center', paddingVertical: 34}, loading: {marginVertical: 30},
  message: {backgroundColor: Colors.card, borderRadius: 14, padding: 16, gap: 12, marginTop: 15}, more: {alignItems: 'center', padding: 15},
  form: {marginTop: 22, gap: 15}, field: {gap: 7}, input: {minHeight: 44, backgroundColor: Colors.card, borderRadius: 12, paddingHorizontal: 14, color: Colors.text, fontSize: 15}, multiline: {minHeight: 92, textAlignVertical: 'top', paddingTop: 12},
  formActions: {flexDirection: 'row', gap: 10, marginTop: 2}, cancelButton: {flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.card, borderRadius: 12}, saveButton: {flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.primary, borderRadius: 12},
  sectionTitle: {marginTop: 25, marginBottom: 11}, accountCard: {backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.border, borderRadius: 17, paddingHorizontal: 15}, accountRow: {height: 57, flexDirection: 'row', alignItems: 'center'}, accountBorder: {borderBottomWidth: 1, borderBottomColor: Colors.border}, accountLabel: {flex: 1, marginLeft: 15},
  logoutButton: {height: 54, borderWidth: 1, borderColor: '#713A48', borderRadius: 17, marginTop: 19, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#291722'}, logoutText: {marginLeft: 9}, pressed: {opacity: 0.7},
});
