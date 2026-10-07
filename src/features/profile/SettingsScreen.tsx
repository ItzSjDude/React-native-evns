import React, {useEffect, useState} from 'react';
import {Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import Svg, {Defs, LinearGradient as SvgGradient, Stop, Circle} from 'react-native-svg';
import IconChevronLeft from '@tabler/icons-react-native/IconChevronLeft';
import IconChevronRight from '@tabler/icons-react-native/IconChevronRight';
import IconMapPin from '@tabler/icons-react-native/IconMapPin';
import IconBrandGoogle from '@tabler/icons-react-native/IconBrandGoogle';
import IconLogout from '@tabler/icons-react-native/IconLogout';
import {Colors} from '../../Constants/Colors';
import IconEyeOff from '@tabler/icons-react-native/IconEyeOff';
import IconLock from '@tabler/icons-react-native/IconLock';
import IconBan from '@tabler/icons-react-native/IconBan';
import IconUserPlus from '@tabler/icons-react-native/IconUserPlus';
import IconCheck from '@tabler/icons-react-native/IconCheck';
import BottomSheet, {SheetButton, SheetRow, SheetSection} from '../../components/BottomSheet';
import {deleteMyAccount, getBlockedUsers, getMySettings, getNearbyVisibility, setNearbyVisibility, unblockUser, updateMySettings} from './profileService';
import type {BlockedUser, SeatInvitesFrom, UserProfile, UserSettings} from './types';

const SEAT_INVITE_OPTIONS: {value: SeatInvitesFrom; label: string; hint: string}[] = [
  {value: 'everyone', label: 'Everyone', hint: 'Any host can invite you to speak'},
  {value: 'followers', label: 'People who follow me', hint: 'Only hosts who follow you'},
  {value: 'nobody', label: 'Nobody', hint: 'You only join the stage by raising your hand'},
];

const messageOf = (error: unknown) => (error as {message?: string})?.message ?? 'Please try again.';
const initialsOf = (name?: string | null) => (name || '?').trim().split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase();

type IconComponent = React.ComponentType<{size?: number; color?: string}>;

/** Design's custom pill switch: gold track with a dark knob when on. */
const Toggle = ({on}: {on: boolean}) =>
  <View className={`h-7 w-[46px] justify-center rounded-full px-[3px] ${on ? 'bg-gold' : 'bg-border'}`}>
    <View className={`h-[22px] w-[22px] rounded-full ${on ? 'self-end bg-gold-ink' : 'self-start bg-muted'}`} />
  </View>;

const Row = ({icon: Icon, tint, tintBg, label, hint, value, onPress, toggle, disabled, first}: {
  icon: IconComponent; tint: string; tintBg: string; label: string; hint?: string; value?: string;
  onPress?: () => void; toggle?: boolean; disabled?: boolean; first?: boolean;
}) =>
  <Pressable accessibilityRole={toggle === undefined ? 'button' : 'switch'} accessibilityLabel={label}
    accessibilityState={toggle === undefined ? {disabled} : {checked: toggle, disabled}} disabled={disabled || !onPress} onPress={onPress}
    className={`min-h-14 flex-row items-center gap-3 px-3.5 py-2 active:bg-white/5 ${first ? '' : 'border-t border-[#211D2C]'} ${disabled ? 'opacity-60' : ''}`}>
    <View style={{backgroundColor: tintBg}} className="h-[34px] w-[34px] items-center justify-center rounded-[10px]"><Icon size={17} color={tint} /></View>
    <View className="min-w-0 flex-1">
      <Text className="text-[14px] font-semibold text-foreground">{label}</Text>
      {!!hint && <Text className="mt-0.5 text-xs text-muted">{hint}</Text>}
    </View>
    {!!value && <Text className="text-[13px] text-[#A9A3B8]">{value}</Text>}
    {toggle !== undefined ? <Toggle on={toggle} /> : onPress ? <IconChevronRight size={16} color={Colors.muted} /> : null}
  </Pressable>;

const Group = ({title, children}: {title: string; children: React.ReactNode}) =>
  <View className="gap-2">
    <Text className="pl-1 text-xs font-extrabold tracking-[1px] text-muted">{title}</Text>
    <View className="overflow-hidden rounded-[20px] border border-border bg-[#15121E]">{children}</View>
  </View>;

const RingAvatar = ({profile}: {profile: UserProfile | null}) =>
  <View className="h-14 w-14 items-center justify-center">
    <Svg width={56} height={56} style={StyleSheet.absoluteFill}>
      <Defs>
        <SvgGradient id="ring" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#F5B544" /><Stop offset="0.35" stopColor="#FF5D8F" /><Stop offset="0.7" stopColor="#8B7CF6" /><Stop offset="1" stopColor="#3DDC97" />
        </SvgGradient>
      </Defs>
      <Circle cx={28} cy={28} r={26.5} stroke="url(#ring)" strokeWidth={3} fill="none" />
    </Svg>
    <View className="h-[46px] w-[46px] items-center justify-center overflow-hidden rounded-full bg-[#3A2F63]">
      {profile?.avatar_url ? <Image source={{uri: profile.avatar_url}} className="h-full w-full" />
        : <Text className="text-[17px] font-extrabold text-[#E6E0FF]">{initialsOf(profile?.name)}</Text>}
    </View>
  </View>;

export default function SettingsScreen({profile, visible, onClose, onEditProfile, onLogout}: {
  profile: UserProfile | null; visible: boolean; onClose: () => void; onEditProfile: () => void; onLogout: () => Promise<void>;
}) {
  const [nearby, setNearby] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmLogout, setConfirmLogout] = useState(false);
  // null until loaded; stays null if the server doesn't have the settings API yet, which hides those rows.
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [blocked, setBlocked] = useState<BlockedUser[] | null>(null);
  const [panel, setPanel] = useState<'invites' | 'blocked' | 'delete' | null>(null);
  const [deleteText, setDeleteText] = useState('');
  useEffect(() => {
    if (!visible) return;
    let mounted = true;
    setError(null); setConfirmLogout(false); setPanel(null);
    getNearbyVisibility().then(value => {if (mounted) setNearby(value.visible);}).catch(cause => {if (mounted) setError(messageOf(cause));});
    getMySettings().then(value => {if (mounted) setSettings(value);}).catch(() => {if (mounted) setSettings(null);});
    getBlockedUsers().then(value => {if (mounted) setBlocked(value);}).catch(() => {if (mounted) setBlocked(null);});
    return () => {mounted = false;};
  }, [visible]);

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
      await deleteMyAccount();
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

  return <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
    <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-background">
      <View className="flex-row items-center gap-3 border-b border-[#1A1724] px-4 pb-3 pt-2">
        <Pressable accessibilityRole="button" accessibilityLabel="Back to profile" onPress={onClose}
          className="h-11 w-11 items-center justify-center rounded-[14px] border border-border bg-[#15121E] active:opacity-70">
          <IconChevronLeft size={20} color={Colors.text} />
        </Pressable>
        <Text accessibilityRole="header" className="flex-1 text-[22px] font-extrabold text-foreground">Settings</Text>
      </View>

      <ScrollView contentContainerClassName="gap-[18px] px-4 pb-6 pt-3.5">
        <Pressable accessibilityRole="button" accessibilityLabel="Edit profile details" onPress={onEditProfile}
          className="flex-row items-center gap-3 rounded-[22px] border border-[#3A2F63] bg-[#1A1430] p-3.5 active:opacity-80">
          <RingAvatar profile={profile} />
          <View className="min-w-0 flex-1">
            <Text numberOfLines={1} className="text-[16px] font-extrabold text-foreground">{profile?.name ?? ''}</Text>
            <Text className="mt-0.5 text-xs text-purple-soft">Name, handle, bio aur interests</Text>
          </View>
          <IconChevronRight size={18} color={Colors.muted} />
        </Pressable>

        {!!error && <View className="rounded-xl bg-coral/10 px-3 py-2"><Text accessibilityRole="alert" className="text-[13px] text-coral">{error}</Text></View>}

        {settings && <Group title="ROOMS">
          <Row first icon={IconUserPlus} tint={Colors.purpleSoft} tintBg="#1F1A3A" label="Seat invites from"
            value={SEAT_INVITE_OPTIONS.find(option => option.value === settings.seatInvitesFrom)?.label} onPress={() => setPanel('invites')} />
        </Group>}

        <Group title="PRIVACY">
          <Row first icon={IconMapPin} tint="#3DDC97" tintBg="#123224" label="Show me in Nearby"
            hint={nearby === null ? 'Loading…' : nearby ? 'People around you can find you' : 'You’re hidden from Nearby'}
            toggle={!!nearby} disabled={nearby === null || busy} onPress={toggleNearby} />
          {settings && <Row icon={IconEyeOff} tint="#C9C2DA" tintBg="#211D2C" label="Hide online status" hint="Others won’t see when you’re online"
            toggle={settings.hideOnlineStatus} disabled={busy} onPress={() => patchSettings({hideOnlineStatus: !settings.hideOnlineStatus})} />}
          {settings && <Row icon={IconLock} tint="#C9C2DA" tintBg="#211D2C" label="Private profile" hint="Only followers see your posts, rooms and events"
            toggle={settings.privateProfile} disabled={busy} onPress={() => patchSettings({privateProfile: !settings.privateProfile})} />}
          {blocked && <Row icon={IconBan} tint="#C9C2DA" tintBg="#211D2C" label="Blocked users" value={String(blocked.length)} onPress={() => setPanel('blocked')} />}
        </Group>

        <Group title="ACCOUNT">
          <Row first icon={IconBrandGoogle} tint="#C9C2DA" tintBg="#211D2C" label="Signed in with Google" hint={profile?.email} />
        </Group>

        {confirmLogout ? <View className="gap-2.5 rounded-[18px] border border-[#4A2226] bg-[#22121A] p-4">
          <Text className="text-center text-[15px] font-extrabold text-foreground">Log out?</Text>
          <Text className="text-center text-[13px] text-muted">You’ll need to sign in with Google again.</Text>
          <View className="mt-1 flex-row gap-2.5">
            <Pressable accessibilityRole="button" accessibilityLabel="Cancel" onPress={() => setConfirmLogout(false)} className="h-11 flex-1 items-center justify-center rounded-full border border-border active:opacity-70">
              <Text className="text-[14px] font-bold text-foreground">Cancel</Text>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Confirm log out" disabled={busy} onPress={logout} className="h-11 flex-1 items-center justify-center rounded-full bg-[#FF8A8A] active:opacity-80">
              <Text className="text-[14px] font-extrabold text-[#22121A]">{busy ? 'Logging out…' : 'Log out'}</Text>
            </Pressable>
          </View>
        </View> : <Pressable accessibilityRole="button" accessibilityLabel="Log out" onPress={() => setConfirmLogout(true)}
          className="h-[52px] flex-row items-center justify-center gap-2 rounded-[18px] border border-[#4A2226] bg-[#22121A] active:opacity-80">
          <IconLogout size={18} color="#FF8A8A" /><Text className="text-[15px] font-extrabold text-[#FF8A8A]">Log out</Text>
        </Pressable>}
        {settings && <Pressable accessibilityRole="button" accessibilityLabel="Delete account" onPress={() => {setDeleteText(''); setPanel('delete');}} className="h-11 items-center justify-center active:opacity-70">
          <Text className="text-[13px] font-semibold text-muted">Account delete karo</Text>
        </Pressable>}
      </ScrollView>

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
