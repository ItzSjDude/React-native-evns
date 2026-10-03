import React, {useCallback, useEffect, useRef, useState} from 'react';
import {ActivityIndicator, Alert, Image, Pressable, RefreshControl, ScrollView, StatusBar, StyleSheet, TextInput, View} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import LinearGradient from 'react-native-linear-gradient';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useAppDispatch} from '../../core/store/hooks';
import {clearSession, logoutFromApi} from '../auth';
import {Colors} from '../../Constants/Colors';
import AppIcon from '../../Constants/Icons';
import Typography from '../../Constants/Typography';
import {getMyProfile, getProfilePage, updateMyProfile} from './profileService';
import type {ProfileItem, ProfilePost, ProfileTab, UserProfile} from './types';

type ListState = {items: ProfileItem[]; loading: boolean; loaded: boolean; error: string | null; hasMore: boolean; offset: number};
const emptyList = (): ListState => ({items: [], loading: false, loaded: false, error: null, hasMore: true, offset: 0});
const tabs: ProfileTab[] = ['posts', 'parties', 'events'];
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
              <View style={styles.avatar}>{avatar ? <Image source={{uri: avatar}} style={styles.avatarImage} /> : <AppIcon name="user" size={42} color={Colors.text} />}</View>
            </LinearGradient>
            {!editing && <Pressable accessibilityRole="button" accessibilityLabel="Edit profile" onPress={startEditing} style={styles.editButton}><AppIcon name="edit" size={17} color={Colors.primary} /><Typography size={14} color={Colors.primary} fontWeight="600">Edit profile</Typography></Pressable>}
          </View>
          {profileLoading && !profile ? <ActivityIndicator accessibilityLabel="Loading profile" color={Colors.primary} style={styles.loading} /> : null}
          {profileError ? <View style={styles.message}><Typography color={Colors.textBody}>{profileError}</Typography><Pressable accessibilityRole="button" onPress={() => loadProfile()}><Typography color={Colors.primary}>Retry</Typography></Pressable></View> : null}
          {profile && !editing ? <>
            <Typography size={26} color={Colors.text} fontWeight="700" style={styles.name}>{displayName}</Typography>
            {profile.handle ? <Typography size={14} color={Colors.primary}>@{profile.handle}</Typography> : null}
            {profile.bio ? <Typography size={15} color={Colors.textBody} style={styles.bio}>{profile.bio}</Typography> : null}
            {profile.city ? <View style={styles.location}><AppIcon name="location" size={17} color={Colors.muted} /><Typography size={14} color={Colors.muted}>{profile.city}</Typography></View> : null}
            {profile.interests?.length ? <View style={styles.interests}>{profile.interests.map(interest => <View key={interest} style={styles.interest}><Typography size={13} color={Colors.textBody}>{interest}</Typography></View>)}</View> : null}
            <View style={styles.stats}>
              <Stat value={profile.stats?.following ?? 0} label="Following" />
              <Stat value={profile.stats?.hosted ?? 0} label="Hosted" />
              <Stat value={profile.stats?.posts ?? 0} label="Posts" />
            </View>
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
            <View style={styles.tabs}>{tabs.map(tab => <Pressable key={tab} accessibilityRole="tab" accessibilityState={{selected: activeTab === tab}} onPress={() => setActiveTab(tab)} style={[styles.tab, activeTab === tab && styles.tabActive]}><Typography size={15} color={activeTab === tab ? Colors.primary : Colors.muted} fontWeight="600">{tab[0].toUpperCase() + tab.slice(1)}</Typography></Pressable>)}</View>
            {list.items.map(item => <ProfileListItem key={item.id} item={item} tab={activeTab} />)}
            {list.loading ? <ActivityIndicator accessibilityLabel={`Loading ${activeTab}`} color={Colors.primary} style={styles.loading} /> : null}
            {list.error ? <View style={styles.message}><Typography color={Colors.textBody}>{list.error}</Typography><Pressable accessibilityRole="button" onPress={() => loadList(profile.id, activeTab, list.items.length > 0)}><Typography color={Colors.primary}>Retry</Typography></Pressable></View> : null}
            {!list.loading && !list.error && list.items.length === 0 ? <Typography size={14} color={Colors.muted} style={styles.empty}>No {activeTab} yet.</Typography> : null}
            {!list.loading && !list.error && list.hasMore && list.items.length > 0 ? <Pressable accessibilityRole="button" onPress={() => loadList(profile.id, activeTab, true)} style={styles.more}><Typography color={Colors.primary} fontWeight="600">Load more</Typography></Pressable> : null}
          </> : null}
          <Pressable accessibilityRole="button" onPress={handleLogout} style={styles.logout}><AppIcon name="logout" size={20} color={Colors.coral} /><Typography size={15} color={Colors.coral} fontWeight="600">Log out</Typography></Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const Stat = ({value, label}: {value: number; label: string}) => <View style={styles.stat}><Typography size={18} color={Colors.text} fontWeight="700">{value}</Typography><Typography size={12} color={Colors.muted}>{label}</Typography></View>;
const Field = ({label, ...props}: {label: string} & React.ComponentProps<typeof TextInput>) => <View style={styles.field}><Typography size={13} color={Colors.muted} fontWeight="600">{label}</Typography><TextInput {...props} accessibilityLabel={label} placeholderTextColor={Colors.muted} style={[styles.input, props.multiline && styles.multiline]} /></View>;
const ProfileListItem = ({item, tab}: {item: ProfileItem; tab: ProfileTab}) => {
  const title = tab === 'posts' ? (item as ProfilePost).body || 'Post' : (item as {title: string}).title;
  const detail = tab === 'posts'
    ? `${(item as ProfilePost).reactions.likeCount} likes`
    : tab === 'parties'
      ? `${(item as {participant_count: number}).participant_count} ${(item as {participant_count: number}).participant_count === 1 ? 'participant' : 'participants'}`
      : `${(item as {attendee_count: number}).attendee_count} attending`;
  return <View style={styles.listItem}><Typography size={15} color={Colors.textBody} fontWeight="600">{title}</Typography><Typography size={12} color={Colors.muted} style={styles.itemDetail}>{detail}</Typography></View>;
};

export default Profile;

const styles = StyleSheet.create({
  safeArea: {flex: 1, backgroundColor: Colors.background}, content: {paddingBottom: 115},
  cover: {height: 146, overflow: 'hidden'}, coverImage: {width: '100%', height: '100%'}, coverGlow: {position: 'absolute', width: 260, height: 130, right: -40, bottom: -10, borderRadius: 120, backgroundColor: '#5B4086', opacity: 0.22},
  body: {paddingHorizontal: 20, marginTop: -46}, identityRow: {flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between'},
  avatarRing: {width: 98, height: 98, borderRadius: 49, padding: 3}, avatar: {flex: 1, borderRadius: 46, backgroundColor: '#28253B', alignItems: 'center', justifyContent: 'center'}, avatarImage: {width: '100%', height: '100%', borderRadius: 46},
  editButton: {minHeight: 40, borderWidth: 1, borderColor: Colors.primaryBorder, borderRadius: 20, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 2},
  name: {marginTop: 15, marginBottom: 3}, bio: {marginTop: 13, lineHeight: 22}, location: {flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 11},
  interests: {flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 15}, interest: {backgroundColor: Colors.card, borderRadius: 15, paddingHorizontal: 11, paddingVertical: 6},
  stats: {flexDirection: 'row', marginTop: 24, paddingVertical: 15, borderTopWidth: 1, borderBottomWidth: 1, borderColor: Colors.border}, stat: {flex: 1, alignItems: 'center', gap: 3},
  tabs: {flexDirection: 'row', marginTop: 22, borderBottomWidth: 1, borderColor: Colors.border}, tab: {flex: 1, alignItems: 'center', paddingBottom: 12, minHeight: 42}, tabActive: {borderBottomWidth: 2, borderColor: Colors.primary},
  listItem: {paddingVertical: 17, borderBottomWidth: 1, borderColor: Colors.border}, itemDetail: {marginTop: 7}, empty: {textAlign: 'center', paddingVertical: 34}, loading: {marginVertical: 30},
  message: {backgroundColor: Colors.card, borderRadius: 14, padding: 16, gap: 12, marginTop: 15}, more: {alignItems: 'center', padding: 15},
  form: {marginTop: 22, gap: 15}, field: {gap: 7}, input: {minHeight: 44, backgroundColor: Colors.card, borderRadius: 12, paddingHorizontal: 14, color: Colors.text, fontSize: 15}, multiline: {minHeight: 92, textAlignVertical: 'top', paddingTop: 12},
  formActions: {flexDirection: 'row', gap: 10, marginTop: 2}, cancelButton: {flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.card, borderRadius: 12}, saveButton: {flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.primary, borderRadius: 12},
  logout: {minHeight: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, marginTop: 32, borderRadius: 14, backgroundColor: '#291722'},
});
