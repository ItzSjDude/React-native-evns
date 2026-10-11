import React, {useEffect, useState} from 'react';
import {Image, Linking, Modal, Pressable, ScrollView, Text, TextInput, View} from 'react-native';
import {showDialog} from '../../components/Dialog';
import {SafeAreaView} from 'react-native-safe-area-context';
import IconChevronLeft from '@tabler/icons-react-native/IconChevronLeft';
import IconChevronRight from '@tabler/icons-react-native/IconChevronRight';
import IconMapPin from '@tabler/icons-react-native/IconMapPin';
import IconBrandGoogle from '@tabler/icons-react-native/IconBrandGoogle';
import IconLogout from '@tabler/icons-react-native/IconLogout';
import IconTrash from '@tabler/icons-react-native/IconTrash';
import {Colors} from '../../Constants/Colors';
import {PRIVACY_POLICY_URL, TERMS_URL} from '../../core/config/env';
import IconEyeOff from '@tabler/icons-react-native/IconEyeOff';
import IconLock from '@tabler/icons-react-native/IconLock';
import IconBan from '@tabler/icons-react-native/IconBan';
import IconUserPlus from '@tabler/icons-react-native/IconUserPlus';
import IconCheck from '@tabler/icons-react-native/IconCheck';
import IconShieldLock from '@tabler/icons-react-native/IconShieldLock';
import IconFileText from '@tabler/icons-react-native/IconFileText';
import IconSparkles from '@tabler/icons-react-native/IconSparkles';
import {PlusSettingsScreen, openPaywall, usePlus} from '../plus';
import BottomSheet, {SheetButton, SheetRow, SheetSection} from '../../components/BottomSheet';
import {deleteMyAccount, getBlockedUsers, getMySettings, getNearbyVisibility, setNearbyVisibility, unblockUser, updateMySettings} from './profileService';
import type {BlockedUser, SeatInvitesFrom, UserProfile, UserSettings} from './types';

const SEAT_INVITE_OPTIONS: {value: SeatInvitesFrom; label: string; hint: string}[] = [
  {value: 'everyone', label: 'Everyone', hint: 'Any host can invite you to speak'},
  {value: 'followers', label: 'People who follow me', hint: 'Only hosts who follow you'},
  {value: 'nobody', label: 'Nobody', hint: 'You only join the stage by raising your hand'},
];

const PLAY_SUBSCRIPTIONS_URL = 'https://play.google.com/store/account/subscriptions';
const openLink = (url: string) => {Linking.openURL(url).catch(() => {});};
const messageOf = (error: unknown) => (error as {message?: string})?.message ?? 'Please try again.';
const initialsOf = (name?: string | null) => (name || '?').trim().split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase();

type IconComponent = React.ComponentType<{size?: number; color?: string}>;

/** Design's custom pill switch: gold track with a dark knob when on. */
const Toggle = ({on}: {on: boolean}) =>
  <View className={`h-7 w-[46px] justify-center rounded-full px-[3px] ${on ? 'bg-gold' : 'bg-border'}`}>
    <View className={`h-[22px] w-[22px] rounded-full ${on ? 'self-end bg-gold-ink' : 'self-start bg-muted'}`} />
  </View>;

/** Flat list row on the page background; rows after the first get an inset hairline divider. */
const Row = ({icon: Icon, label, hint, value, onPress, toggle, disabled, first, danger}: {
  icon: IconComponent; label: string; hint?: string; value?: string;
  onPress?: () => void; toggle?: boolean; disabled?: boolean; first?: boolean; danger?: boolean;
}) =>
  <Pressable accessibilityRole={toggle === undefined ? 'button' : 'switch'} accessibilityLabel={label}
    accessibilityState={toggle === undefined ? {disabled} : {checked: toggle, disabled}} disabled={disabled || !onPress} onPress={onPress}
    className={`flex-row items-center gap-4 pl-4 active:bg-white/5 ${disabled ? 'opacity-60' : ''}`}>
    <Icon size={20} color={danger ? Colors.coral : Colors.muted} />
    <View className={`min-h-14 min-w-0 flex-1 flex-row items-center gap-3 py-3 pr-4 ${first ? '' : 'border-t border-border/60'}`}>
      <View className="min-w-0 flex-1">
        <Text className={`text-[15px] ${danger ? 'text-coral' : 'text-foreground'}`}>{label}</Text>
        {!!hint && <Text numberOfLines={2} className="mt-0.5 text-[13px] text-muted">{hint}</Text>}
      </View>
      {!!value && <Text className="text-[14px] text-muted">{value}</Text>}
      {toggle !== undefined ? <Toggle on={toggle} /> : onPress && !danger ? <IconChevronRight size={18} color={Colors.mutedLight} /> : null}
    </View>
  </Pressable>;

const Group = ({title, children}: {title: string; children: React.ReactNode}) =>
  <View className="pt-6">
    <Text accessibilityRole="header" className="px-4 pb-1 text-[13px] font-semibold text-muted">{title}</Text>
    {children}
  </View>;

export default function SettingsScreen({profile, visible, onClose, onEditProfile, onLogout, onSettingsChange}: {
  profile: UserProfile | null; visible: boolean; onClose: () => void; onEditProfile: () => void; onLogout: () => Promise<void>;
  /** Lets the profile behind this screen pick up changes such as the Plus badge and theme. */
  onSettingsChange?: (settings: UserSettings) => void;
}) {
  // Local copies so the links keep their narrowed `string` type inside the callbacks below.
  const privacyUrl = PRIVACY_POLICY_URL;
  const termsUrl = TERMS_URL;
  const [nearby, setNearby] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // null until loaded; stays null if the server doesn't have the settings API yet, which hides those rows.
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [blocked, setBlocked] = useState<BlockedUser[] | null>(null);
  const [panel, setPanel] = useState<'invites' | 'blocked' | 'delete' | null>(null);
  const [deleteText, setDeleteText] = useState('');
  const plus = usePlus();
  const [plusOpen, setPlusOpen] = useState(false);
  useEffect(() => {
    if (!visible) return;
    let mounted = true;
    setError(null); setPanel(null);
    getNearbyVisibility().then(value => {if (mounted) setNearby(value.visible);}).catch(cause => {if (mounted) setError(messageOf(cause));});
    getMySettings().then(value => {if (mounted) setSettings(value);}).catch(() => {if (mounted) setSettings(null);});
    getBlockedUsers().then(value => {if (mounted) setBlocked(value);}).catch(() => {if (mounted) setBlocked(null);});
    return () => {mounted = false;};
  }, [visible]);

  useEffect(() => {if (settings) onSettingsChange?.(settings);}, [settings, onSettingsChange]);

  const patchSettings = async (patch: Partial<UserSettings>) => {
    if (!settings || busy) return;
    const previous = settings;
    setBusy(true); setError(null); setSettings({...settings, ...patch});
    try {setSettings(await updateMySettings(patch));}
    catch (cause) {setSettings(previous); setError(messageOf(cause));}
    finally {setBusy(false);}
  };
  const unblock = async (user: BlockedUser) => {
    if (!blocked || busy) return;
    setBusy(true); setError(null); setBlocked(blocked.filter(item => item.id !== user.id));
    try {await unblockUser(user.id);}
    catch (cause) {setBlocked(blocked); setError(messageOf(cause));}
    finally {setBusy(false);}
  };
  const deleteAccount = async () => {
    if (deleteText.trim() !== 'DELETE' || busy) return;
    setBusy(true); setError(null);
    try {
      // Deleting the account doesn't stop a Play subscription; the server says when one is still renewing.
      const result = await deleteMyAccount() as {deleted: boolean; cancelPlaySubscription?: boolean} | undefined;
      if (result?.cancelPlaySubscription) {
        showDialog('Cancel your Hiva Plus subscription',
          'Your account is deleted, but Google Play will keep charging until you cancel the subscription there.',
          [{text: 'Later', style: 'cancel'}, {text: 'Open Google Play', onPress: () => openLink(PLAY_SUBSCRIPTIONS_URL)}]);
      }
      await onLogout().catch(() => {});
    } catch (cause) {setError(messageOf(cause)); setBusy(false);}
  };

  const toggleNearby = async () => {
    if (nearby === null || busy) return;
    const next = !nearby;
    setBusy(true); setError(null); setNearby(next);
    try {setNearby((await setNearbyVisibility(next)).visible);}
    catch (cause) {setNearby(!next); setError(messageOf(cause));}
    finally {setBusy(false);}
  };
  const logout = async () => {setBusy(true); try {await onLogout();} finally {setBusy(false);}};
  const confirmLogout = () => showDialog('Log out?', 'You’ll need to sign in with Google again.',
    [{text: 'Cancel', style: 'cancel'}, {text: 'Log out', style: 'destructive', onPress: logout}]);

  return <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
    <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-background">
      <View className="flex-row items-center gap-1 px-2 pb-2 pt-1">
        <Pressable accessibilityRole="button" accessibilityLabel="Back to profile" onPress={onClose} hitSlop={4}
          className="h-11 w-11 items-center justify-center rounded-full active:bg-white/5">
          <IconChevronLeft size={24} color={Colors.text} />
        </Pressable>
        <Text accessibilityRole="header" className="flex-1 text-[20px] font-bold text-foreground">Settings</Text>
      </View>

      <ScrollView contentContainerClassName="pb-8">
        <Pressable accessibilityRole="button" accessibilityLabel="Edit profile details" onPress={onEditProfile}
          className="flex-row items-center gap-4 px-4 py-3 active:bg-white/5">
          <View className="h-14 w-14 items-center justify-center overflow-hidden rounded-full bg-card">
            {profile?.avatar_url ? <Image source={{uri: profile.avatar_url}} className="h-full w-full" />
              : <Text className="text-[18px] font-bold text-foreground">{initialsOf(profile?.name)}</Text>}
          </View>
          <View className="min-w-0 flex-1">
            <Text numberOfLines={1} className="text-[17px] font-semibold text-foreground">{profile?.name ?? ''}</Text>
            <Text numberOfLines={1} className="mt-0.5 text-[13px] text-muted">Edit profile</Text>
          </View>
          <IconChevronRight size={18} color={Colors.mutedLight} />
        </Pressable>

        {!!error && <Text accessibilityRole="alert" className="px-4 pt-3 text-[13px] text-coral">{error}</Text>}

        {plus.enabled && <Group title="Hiva Plus">
          <Row first icon={IconSparkles} label="Hiva Plus" hint={plus.isPlus ? 'Manage your subscription' : 'More new chats a day'}
            value={plus.isPlus ? 'Active' : 'Get Plus'} onPress={() => (plus.isPlus ? setPlusOpen(true) : openPaywall())} />
        </Group>}

        {settings && <Group title="Rooms">
          <Row first icon={IconUserPlus} label="Seat invites from"
            value={SEAT_INVITE_OPTIONS.find(option => option.value === settings.seatInvitesFrom)?.label} onPress={() => setPanel('invites')} />
        </Group>}

        <Group title="Privacy">
          <Row first icon={IconMapPin} label="Show me in Nearby"
            hint={nearby === null ? 'Loading…' : nearby ? 'People around you can find you' : 'You’re hidden from Nearby'}
            toggle={!!nearby} disabled={nearby === null || busy} onPress={toggleNearby} />
          {settings && <Row icon={IconEyeOff} label="Hide online status" hint="Others won’t see when you’re online"
            toggle={settings.hideOnlineStatus} disabled={busy} onPress={() => patchSettings({hideOnlineStatus: !settings.hideOnlineStatus})} />}
          {settings && <Row icon={IconLock} label="Private profile" hint="Only followers see your posts, rooms and events"
            toggle={settings.privateProfile} disabled={busy} onPress={() => patchSettings({privateProfile: !settings.privateProfile})} />}
          {blocked && <Row icon={IconBan} label="Blocked users" value={String(blocked.length)} onPress={() => setPanel('blocked')} />}
        </Group>

        {(privacyUrl || termsUrl) && <Group title="Legal">
          {privacyUrl && <Row first icon={IconShieldLock} label="Privacy policy" onPress={() => openLink(privacyUrl)} />}
          {termsUrl && <Row first={!privacyUrl} icon={IconFileText} label="Terms of service" onPress={() => openLink(termsUrl)} />}
        </Group>}

        <Group title="Account">
          <Row first icon={IconBrandGoogle} label="Signed in with Google" hint={profile?.email} />
          <Row icon={IconLogout} label="Log out" danger disabled={busy} onPress={confirmLogout} />
          {settings && <Row icon={IconTrash} label="Delete account" danger onPress={() => {setDeleteText(''); setPanel('delete');}} />}
        </Group>
      </ScrollView>

      {plus.enabled && <PlusSettingsScreen visible={plusOpen} onClose={() => setPlusOpen(false)} preferences={settings} onChange={patchSettings} />}

      <BottomSheet visible={panel === 'invites'} onClose={() => setPanel(null)} title="Who can invite you to speak?">
        <SheetSection>
          {SEAT_INVITE_OPTIONS.map(option => <SheetRow key={option.value} label={option.label} description={option.hint} disabled={busy}
            accessibilityLabel={`${option.label}${settings?.seatInvitesFrom === option.value ? ', selected' : ''}`}
            onPress={() => {patchSettings({seatInvitesFrom: option.value}); setPanel(null);}}
            accessory={settings?.seatInvitesFrom === option.value ? <IconCheck size={20} color={Colors.gold} /> : undefined} />)}
        </SheetSection>
      </BottomSheet>

      <BottomSheet visible={panel === 'blocked'} onClose={() => setPanel(null)} title="Blocked users" subtitle={blocked?.length ? 'They can’t see your posts, rooms or message you.' : null}>
        {blocked?.length ? <SheetSection>
          {blocked.map(user => <View key={user.id} className="min-h-[60px] flex-row items-center gap-3 border-b border-sheet px-4 py-2">
            <View className="h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-primary-dark">
              {user.avatarUrl ? <Image source={{uri: user.avatarUrl}} className="h-full w-full" /> : <Text className="text-[13px] font-bold text-primary">{initialsOf(user.name)}</Text>}
            </View>
            <View className="min-w-0 flex-1">
              <Text numberOfLines={1} className="text-[15px] font-semibold text-foreground">{user.name}</Text>
              {!!user.handle && <Text className="text-xs text-muted">@{user.handle}</Text>}
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel={`Unblock ${user.name}`} disabled={busy} onPress={() => unblock(user)}
              className="h-8 justify-center rounded-full border border-border px-3 active:opacity-70"><Text className="text-xs font-bold text-foreground">Unblock</Text></Pressable>
          </View>)}
        </SheetSection> : <Text className="py-8 text-center text-[13px] text-muted">You haven’t blocked anyone.</Text>}
      </BottomSheet>

      <BottomSheet visible={panel === 'delete'} onClose={() => setPanel(null)} dismissible={!busy} title="Delete your account?"
        subtitle="This is permanent. Your profile, posts and follows are removed and you’re signed out. People you chatted with keep the conversation, shown as “Deleted user”."
        footer={<>
          <SheetButton label={busy ? 'Deleting…' : 'Delete account'} variant="destructive" busy={busy} disabled={deleteText.trim() !== 'DELETE'} onPress={deleteAccount} />
          <SheetButton label="Cancel" variant="ghost" onPress={() => setPanel(null)} />
        </>}>
        {!!error && panel === 'delete' && <Text accessibilityRole="alert" className="mb-2 text-[13px] text-coral">{error}</Text>}
        <Text className="mb-2 ml-1 text-[13px] font-semibold text-muted">Type DELETE to confirm</Text>
        <TextInput accessibilityLabel="Type DELETE to confirm" value={deleteText} onChangeText={setDeleteText} autoCapitalize="characters" autoCorrect={false}
          placeholder="DELETE" placeholderTextColor={Colors.muted} className="min-h-12 rounded-xl border border-border bg-card px-4 text-base text-foreground" />
      </BottomSheet>
    </SafeAreaView>
  </Modal>;
}
