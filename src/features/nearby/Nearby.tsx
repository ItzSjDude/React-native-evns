import React, {useCallback, useEffect, useRef, useState} from 'react';
import {ActivityIndicator, FlatList, Image, Pressable, RefreshControl, Text, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useIsFocused} from '@react-navigation/native';
import IconEyeOff from '@tabler/icons-react-native/IconEyeOff';
import IconMapPin from '@tabler/icons-react-native/IconMapPin';
import IconMessageCircle from '@tabler/icons-react-native/IconMessageCircle';
import IconRadar from '@tabler/icons-react-native/IconRadar';
import IconRefresh from '@tabler/icons-react-native/IconRefresh';
import {Colors} from '../../Constants/Colors';
import {DirectConversation, startDirectConversation} from '../messages';
import {UserProfileModal, type UserPreview} from '../users';
import {getDeviceLocation} from './deviceLocation';
import {getLocationVisibility, getNearbyPeople, setLocationVisibility, updateMyLocation} from './nearbyService';
import type {NearbyPerson} from './types';

const radii = [
  {label: '2 km', meters: 2000},
  {label: '5 km', meters: 5000},
  {label: '10 km', meters: 10000},
] as const;

const messageOf = (error: unknown) => (error as {message?: string})?.message ?? 'Please try again.';
const distanceOf = (meters: number) => meters < 1000 ? `${Math.max(1, Math.round(meters))} m away` : `${(meters / 1000).toFixed(1)} km away`;

type OpenChat = {id: string; person: NearbyPerson};

const PersonRow = ({person, opening, onPress, onOpenProfile}: {person: NearbyPerson; opening: boolean; onPress: () => void; onOpenProfile: () => void}) => (
  <Pressable accessibilityRole="button" accessibilityLabel={`View ${person.name}, ${distanceOf(person.distanceMeters)}`} onPress={onOpenProfile} className="mb-3 flex-row items-center rounded-[20px] bg-card px-4 py-4 active:opacity-70">
    {person.avatarUrl ? <Image source={{uri: person.avatarUrl}} className="h-12 w-12 rounded-full" /> : (
      <View className="h-12 w-12 items-center justify-center rounded-full bg-primary-dark">
        <Text className="text-base font-bold text-foreground">{person.name.slice(0, 1).toUpperCase()}</Text>
      </View>
    )}
    <View className="ml-3 min-w-0 flex-1">
      <Text className="text-[16px] font-semibold text-foreground" numberOfLines={1}>{person.name}</Text>
      <View className="mt-1 flex-row items-center gap-1">
        <IconMapPin size={14} color={Colors.muted} />
        <Text className="text-[13px] text-muted">{distanceOf(person.distanceMeters)}</Text>
      </View>
      {!!person.sharedEvents?.length && <Text className="mt-1 text-xs text-primary" numberOfLines={1}>Both at {person.sharedEvents[0].title}</Text>}
    </View>
    <Pressable accessibilityRole="button" accessibilityLabel={`Message ${person.name}`} onPress={onPress} disabled={opening} hitSlop={6}
      className="ml-2 h-10 w-10 items-center justify-center rounded-full bg-primary-dark active:opacity-70">
      {opening ? <ActivityIndicator size="small" color={Colors.primary} /> : <IconMessageCircle size={21} color={Colors.primary} />}
    </Pressable>
  </Pressable>
);

const Nearby = () => {
  const isFocused = useIsFocused();
  const [visible, setVisible] = useState<boolean | null>(null);
  const [radius, setRadius] = useState(2000);
  const [people, setPeople] = useState<NearbyPerson[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [chat, setChat] = useState<OpenChat | null>(null);
  const [viewing, setViewing] = useState<{id: string; initial: UserPreview} | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [locationNotice, setLocationNotice] = useState<string | null>(null);
  const request = useRef(0);
  const positionInFlight = useRef<Promise<boolean> | null>(null);
  const radiusRef = useRef(radius);
  const visibleRef = useRef(visible);
  radiusRef.current = radius;
  visibleRef.current = visible;

  const loadPeople = useCallback(async (meters: number, pull = false) => {
    const id = ++request.current;
    if (pull) setRefreshing(true); else setLoading(true);
    setError(null);
    try {
      const results = await getNearbyPeople(meters);
      if (id === request.current) setPeople(results);
    } catch (cause) {
      if (id === request.current) setError(messageOf(cause));
    } finally {
      if (id === request.current) { setLoading(false); setRefreshing(false); }
    }
  }, []);

  const updatePosition = useCallback((askPermission: boolean) => {
    if (positionInFlight.current) return positionInFlight.current;
    const pending = (async () => {
      const coordinates = await getDeviceLocation(askPermission);
      if (!coordinates) {
        setLocationNotice('Allow location access to update your position.');
        return false;
      }
      await updateMyLocation(coordinates.lat, coordinates.lng);
      setLocationNotice(null);
      return true;
    })();
    positionInFlight.current = pending;
    pending.finally(() => { if (positionInFlight.current === pending) positionInFlight.current = null; }).catch(() => {});
    return pending;
  }, []);

  useEffect(() => {
    if (!isFocused) return;
    let active = true;
    const requestRef = request;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const state = await getLocationVisibility();
        if (!active) return;
        let positionReady = false;
        if (state.visible) {
          try { positionReady = await updatePosition(false); } catch (cause) { if (active) setLocationNotice(messageOf(cause)); }
        }
        if (!active) return;
        setVisible(state.visible);
        visibleRef.current = state.visible;
        if (state.visible && positionReady) await loadPeople(radiusRef.current);
        else { setPeople([]); setLoading(false); }
      } catch (cause) {
        if (active) { setError(messageOf(cause)); setLoading(false); }
      }
    })();
    const timer = setInterval(async () => {
      if (!active || !visibleRef.current) return;
      try { if (await updatePosition(false)) await loadPeople(radiusRef.current, true); }
      catch (cause) { if (active) setLocationNotice(messageOf(cause)); }
    }, 5 * 60 * 1000);
    return () => { active = false; clearInterval(timer); requestRef.current++; };
  }, [isFocused, loadPeople, updatePosition]);

  const toggleVisibility = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      if (visible) {
        visibleRef.current = false;
        await positionInFlight.current?.catch(() => {});
        await setLocationVisibility(false);
        request.current++;
        setVisible(false);
        visibleRef.current = false;
        setPeople([]);
        setLoading(false);
        setRefreshing(false);
        setLocationNotice(null);
      } else if (await updatePosition(true)) {
        setVisible(true);
        visibleRef.current = true;
        await loadPeople(radiusRef.current);
      }
    } catch (cause) {
      visibleRef.current = visible;
      setError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  };

  const refresh = async () => {
    if (!visible || refreshing) return;
    setRefreshing(true);
    try { if (await updatePosition(false)) await loadPeople(radiusRef.current, true); }
    catch (cause) { setLocationNotice(messageOf(cause)); }
    finally { setRefreshing(false); }
  };

  const allowLocation = async () => {
    if (busy) return;
    setBusy(true);
    try { if (await updatePosition(true)) await loadPeople(radiusRef.current); }
    catch (cause) { setLocationNotice(messageOf(cause)); }
    finally { setBusy(false); }
  };

  const openConversation = async (person: NearbyPerson) => {
    if (openingId) return;
    setOpeningId(person.id);
    setError(null);
    try {
      const conversation = await startDirectConversation(person.id);
      setChat({id: conversation.id, person});
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setOpeningId(null);
    }
  };

  const retry = async () => {
    if (visible) { await loadPeople(radiusRef.current); return; }
    setLoading(true);
    try {
      const state = await getLocationVisibility();
      setVisible(state.visible);
      setError(null);
      if (state.visible && await updatePosition(false)) await loadPeople(radiusRef.current);
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setLoading(false);
    }
  };

  const showList = visible === true;
  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <View className="px-5 pt-5">
        <Text className="text-[30px] font-bold text-foreground">Nearby</Text>
        <Text className="mt-1 text-sm text-muted">Find people around you</Text>
      </View>

      <FlatList
        data={showList && !locationNotice ? people : []}
        keyExtractor={item => item.id}
        renderItem={({item}) => <PersonRow person={item} opening={openingId === item.id} onPress={() => openConversation(item)}
          onOpenProfile={() => setViewing({id: item.id, initial: {name: item.name, avatarUrl: item.avatarUrl}})} />}
        showsVerticalScrollIndicator={false}
        contentContainerClassName="flex-grow px-5 pb-[110px]"
        refreshControl={showList ? <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={Colors.primary} colors={[Colors.primary]} /> : undefined}
        ListHeaderComponent={<>
          <View className="mb-7 mt-6 flex-row items-center rounded-[20px] bg-card p-4">
            <View className="h-11 w-11 items-center justify-center rounded-full bg-primary-dark"><IconRadar size={24} color={Colors.primary} /></View>
            <View className="ml-3 flex-1">
              <Text className="text-[15px] font-semibold text-foreground">{visible === null ? 'Checking visibility' : visible ? "You're visible" : 'Discovery is off'}</Text>
              <Text className="mt-1 text-xs leading-[17px] text-muted">{visible ? 'People nearby can find you while your location is fresh.' : 'Go visible to find people and let them find you.'}</Text>
            </View>
            {visible !== null && <Pressable accessibilityRole="button" accessibilityLabel={visible ? 'Go invisible' : 'Go visible'} disabled={busy} onPress={toggleVisibility} className={`ml-3 min-h-10 items-center justify-center rounded-full px-3 ${visible ? 'border border-border' : 'bg-gold'} ${busy ? 'opacity-50' : 'active:opacity-70'}`}>
              {busy ? <ActivityIndicator size="small" color={visible ? Colors.primary : Colors.textDark} /> : visible ? <IconEyeOff size={19} color={Colors.text} /> : <Text className="text-[13px] font-bold text-text-dark">Go visible</Text>}
            </Pressable>}
          </View>

          {showList && !locationNotice && <>
            <View className="mb-6 flex-row gap-2">
              {radii.map(option => <Pressable key={option.meters} accessibilityRole="button" accessibilityState={{selected: radius === option.meters}} onPress={() => { setRadius(option.meters); radiusRef.current = option.meters; loadPeople(option.meters); }} className={`h-9 min-w-[70px] items-center justify-center rounded-full px-4 ${radius === option.meters ? 'bg-gold' : 'bg-card'} active:opacity-70`}>
                <Text className={`text-[13px] font-semibold ${radius === option.meters ? 'text-text-dark' : 'text-muted'}`}>{option.label}</Text>
              </Pressable>)}
            </View>
            <View className="mb-3 flex-row items-center justify-between">
              <Text className="text-xl font-bold text-foreground">People around you</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Refresh nearby people" onPress={refresh} className="h-10 w-10 items-center justify-center rounded-full active:bg-card"><IconRefresh size={20} color={Colors.muted} /></Pressable>
            </View>
          </>}
          {showList && locationNotice && <View className="rounded-[20px] bg-card px-5 py-5">
            <Text className="text-[16px] font-semibold text-foreground">Update your location</Text>
            <Text className="mt-2 text-sm leading-5 text-muted">{locationNotice} Your old position may no longer be nearby.</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Allow location access" onPress={allowLocation} disabled={busy} className="mt-5 h-11 items-center justify-center rounded-full bg-gold active:opacity-70">
              {busy ? <ActivityIndicator size="small" color={Colors.textDark} /> : <Text className="text-sm font-bold text-text-dark">Allow location</Text>}
            </Pressable>
          </View>}
          {error && <Pressable accessibilityRole="button" accessibilityLabel="Retry nearby" onPress={retry} className="mb-4 rounded-xl bg-card p-3"><Text className="text-sm text-coral">{error} Tap to retry.</Text></Pressable>}
        </>}
        ListEmptyComponent={loading ? <View className="items-center pt-16"><ActivityIndicator color={Colors.primary} /></View> : showList && !error && !locationNotice ? (
          <View className="items-center px-6 pt-16">
            <IconRadar size={44} color={Colors.muted} strokeWidth={1.5} />
            <Text className="mt-4 text-center text-base font-semibold text-foreground">No one nearby yet</Text>
            <Text className="mt-2 text-center text-sm leading-5 text-muted">Try a wider range or check back soon.</Text>
          </View>
        ) : undefined}
      />
      {viewing && <UserProfileModal userId={viewing.id} initial={viewing.initial} visible onClose={() => setViewing(null)}
        onBlocked={id => {setViewing(null); setPeople(current => current.filter(person => person.id !== id));}} />}
      {chat && <DirectConversation conversationId={chat.id} contactId={chat.person.id} contactName={chat.person.name} contactAvatarUrl={chat.person.avatarUrl} onClose={() => setChat(null)} />}
    </SafeAreaView>
  );
};

export default Nearby;
