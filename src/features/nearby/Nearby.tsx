import React, {memo, useCallback, useEffect, useRef, useState} from 'react';
import {ActivityIndicator, Alert, AppState, Linking, Pressable, RefreshControl, Switch, Text, View, useWindowDimensions} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useIsFocused, useNavigation, useRoute, type RouteProp} from '@react-navigation/native';
import IconChevronDown from '@tabler/icons-react-native/IconChevronDown';
import IconGenderFemale from '@tabler/icons-react-native/IconGenderFemale';
import IconGenderMale from '@tabler/icons-react-native/IconGenderMale';
import IconGenderTransgender from '@tabler/icons-react-native/IconGenderTransgender';
import IconMapPin from '@tabler/icons-react-native/IconMapPin';
import IconMessageCircle from '@tabler/icons-react-native/IconMessageCircle';
import IconNote from '@tabler/icons-react-native/IconNote';
import IconPencil from '@tabler/icons-react-native/IconPencil';
import BottomSheet from '../../components/BottomSheet';
import RemoteImage from '../../components/RemoteImage';
import {Colors} from '../../Constants/Colors';
import {DirectConversation, startDirectConversation} from '../messages';
import {EventsList} from '../events';
import {DiscoveryFilterBar, usePlus, type DiscoveryFilters} from '../plus';
import {UserProfileModal, type UserPreview} from '../users';
import {getDeviceLocation} from './deviceLocation';
import {distanceLabel} from './distance';
import {nearbyErrorMessage} from './nearbyErrors';
import MyVibesSheet from './MyVibesSheet';
import PassportResults from './PassportResults';
import PresetsBar from './PresetsBar';
import {getLocationVisibility, getNearbyPeople, setLocationVisibility, updateMyLocationFromFix} from './nearbyService';
import {getVibeNoteAlertPreference, getVibeNoteGeofenceCandidates, setVibeNoteAlertPreference, vibeAlertsCapability} from './vibeNoteService';
import {clearVibeNoteRegions, hasVibeNoteBackgroundPermission, replaceVibeNoteRegions, requestVibeNoteBackgroundPermission, vibeNoteGeofenceCapacity} from './vibeNoteGeofencing';
import type {DiscoveryPreset, DiscoveryPresetMode, NearbyPerson} from './types';
import VibeNoteComposer from './VibeNoteComposer';
import VibeNoteRevealSheet from './VibeNoteRevealSheet';
import {NativeAdCard} from '../ads';
import {FlashList} from '@shopify/flash-list';

const RADII = [
  {label: '2 km', meters: 2_000},
  {label: '5 km', meters: 5_000},
  {label: '10 km', meters: 10_000},
  {label: '20 km', meters: 20_000},
  {label: '25 km', meters: 25_000},
] as const;

type ChatTarget = Pick<NearbyPerson, 'id' | 'name' | 'avatarUrl'>;
type OpenChat = {id: string; person: ChatTarget};
type NearbyTab = 'PEOPLE' | 'EVENTS';

const errorText = (error: unknown) => nearbyErrorMessage(error);

const PersonRow = memo(function PersonRow({person, opening, onMessage, onOpenProfile}: {
  person: NearbyPerson;
  opening: boolean;
  onMessage: (person: NearbyPerson) => void;
  onOpenProfile: (person: NearbyPerson) => void;
}) {
  const GenderIcon = person.gender === 'male' ? IconGenderMale : person.gender === 'female' ? IconGenderFemale : person.gender === 'non_binary' ? IconGenderTransgender : null;
  const genderColor = person.gender === 'male' ? '#4DA3FF' : person.gender === 'female' ? '#FF5C9A' : Colors.primary;
  return (
    <View className="min-h-[72px] flex-row items-center border-b border-border py-3">
      <Pressable accessibilityRole="button" accessibilityLabel={`View ${person.name}, ${distanceLabel(person)}`} onPress={() => onOpenProfile(person)}
        className="min-w-0 flex-1 flex-row items-center active:opacity-70">
        {person.avatarUrl
          ? <RemoteImage accessibilityLabel={`${person.name}'s profile photo`} uri={person.avatarUrl} fadeDuration={0} className="h-12 w-12 rounded-full bg-border" />
          : <View className="h-12 w-12 items-center justify-center rounded-full bg-primary-dark"><Text className="text-base font-bold text-primary">{person.name.slice(0, 1).toUpperCase()}</Text></View>}
        <View className="ml-3 min-w-0 flex-1">
          <View className="flex-row items-center gap-1.5">
            <Text numberOfLines={1} className="shrink text-[15px] font-semibold text-foreground">{person.name}</Text>
            {GenderIcon && <GenderIcon size={16} color={genderColor} />}
          </View>
          {!!person.bio && <Text numberOfLines={1} className="mt-0.5 text-[12px] text-muted">{person.bio}</Text>}
          <View className="mt-1 flex-row items-center gap-1">
            <IconMapPin size={13} color={Colors.muted} />
            <Text className="text-[12px] text-muted">{distanceLabel(person)}</Text>
            {!!person.sharedEvents?.length && <Text numberOfLines={1} className="ml-1 flex-1 text-[12px] text-primary">· Both at {person.sharedEvents[0].title}</Text>}
          </View>
        </View>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={`Message ${person.name}`} accessibilityState={{disabled: opening, busy: opening}}
        disabled={opening} onPress={() => onMessage(person)} hitSlop={{top: 6, bottom: 6, left: 4, right: 4}}
        className="ml-2 h-9 min-w-9 items-center justify-center rounded-full bg-primary-dark active:opacity-70">
        {opening ? <ActivityIndicator size="small" color={Colors.primary} /> : <View className="flex-row items-center gap-1.5 px-2"><IconMessageCircle size={17} color={Colors.primary} /><Text className="text-[12px] font-semibold text-primary">Say hi</Text></View>}
      </Pressable>
    </View>
  );
});

const noPeople: NearbyPerson[] = [];
const personKey = (person: NearbyPerson) => person.id;
/** Every 4th row carries a native ad under the person, so it gets its own recycling pool. */
const personType = (_person: NearbyPerson, index: number) => index % 4 === 3 ? 'personWithAd' : 'person';
// FlashList only honours padding on the content container.
const LIST_CONTENT = {paddingHorizontal: 20, paddingBottom: 112};

function PeopleLoading() {
  return <View accessibilityRole="progressbar" accessibilityLabel="Loading nearby people" accessibilityState={{busy: true}} className="gap-2">
    {[0, 1, 2].map(key => <View key={key} className="h-[72px] flex-row items-center border-b border-border">
      <View className="h-12 w-12 rounded-full bg-border" />
      <View className="ml-3 flex-1 gap-2"><View className="h-3 w-2/5 rounded-full bg-border" /><View className="h-2.5 w-3/5 rounded-full bg-border" /></View>
      <View className="ml-2 h-9 w-[76px] rounded-full bg-border" />
    </View>)}
  </View>;
}

export default function Nearby() {
  const isFocused = useIsFocused();
  const navigation = useNavigation<{navigate: (route: string, params?: {initialView?: 'events'; initialConversationId?: string}) => void; setParams: (params: {vibeNoteId?: string}) => void}>();
  const route = useRoute<RouteProp<{Nearby: {vibeNoteId?: string} | undefined}, 'Nearby'>>();
  const {width} = useWindowDimensions();
  const {enabled: plusEnabled, isPlus} = usePlus();
  const [visible, setVisible] = useState<boolean | null>(null);
  const [radius, setRadius] = useState(2_000);
  const [distanceOpen, setDistanceOpen] = useState(false);
  const [filters, setFilters] = useState<DiscoveryFilters>({});
  const [mode, setMode] = useState<DiscoveryPresetMode>('NEARBY');
  const [nearbyTab, setNearbyTab] = useState<NearbyTab>('PEOPLE');
  const [myVibesOpen, setMyVibesOpen] = useState(false);
  const [revealNoteId, setRevealNoteId] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const [passportCity, setPassportCity] = useState('');
  const [people, setPeople] = useState<NearbyPerson[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [chat, setChat] = useState<OpenChat | null>(null);
  const [viewing, setViewing] = useState<{id: string; initial: UserPreview} | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [locationDenied, setLocationDenied] = useState(false);
  const [vibeAlertsEnabled, setVibeAlertsEnabled] = useState(false);
  const [vibeAlertsAvailable, setVibeAlertsAvailable] = useState<boolean | null>(null);
  const [vibeAlertsBusy, setVibeAlertsBusy] = useState(false);
  const [vibeAlertsPermission, setVibeAlertsPermission] = useState(false);
  const request = useRef(0);
  const positionInFlight = useRef<Promise<boolean> | null>(null);
  const filtersRef = useRef<DiscoveryFilters | undefined>(undefined);
  const radiusRef = useRef(radius);
  filtersRef.current = isPlus ? filters : undefined;
  radiusRef.current = radius;

  useEffect(() => {
    const noteId = route.params?.vibeNoteId;
    if (!noteId) return;
    setRevealNoteId(noteId);
    navigation.setParams({vibeNoteId: undefined});
  }, [navigation, route.params?.vibeNoteId]);

  const loadPeople = useCallback(async (meters: number, pull = false) => {
    const id = ++request.current;
    if (pull) setRefreshing(true); else setLoading(true);
    setError(null);
    try {
      const result = await getNearbyPeople(meters, filtersRef.current);
      if (id === request.current) setPeople(result);
    } catch (cause) {
      if (id === request.current) {
        setError(errorText(cause));
        if (!pull) setPeople([]);
      }
    } finally {
      if (id === request.current) {setLoading(false); setRefreshing(false);}
    }
  }, []);

  const updatePosition = useCallback((askPermission: boolean) => {
    if (positionInFlight.current) return positionInFlight.current;
    const pending = (async () => {
      const coordinates = await getDeviceLocation(askPermission);
      if (!coordinates) throw new Error('Location permission is off. Allow location access in device settings.');
      await updateMyLocationFromFix(coordinates);
      setLocationDenied(false);
      return true;
    })();
    positionInFlight.current = pending;
    pending.finally(() => {if (positionInFlight.current === pending) positionInFlight.current = null;}).catch(() => {});
    return pending;
  }, []);

  const syncVibeNoteRegions = useCallback(async () => {
    const fix = await getDeviceLocation(false);
    if (!fix) throw new Error('Allow location access to receive Nearby Vibe alerts.');
    await updateMyLocationFromFix(fix);
    const regions = await getVibeNoteGeofenceCandidates(vibeNoteGeofenceCapacity);
    await replaceVibeNoteRegions(regions);
  }, []);

  useEffect(() => {
    if (!isFocused) return;
    let active = true;
    if (vibeAlertsCapability.peek() === false) {setVibeAlertsAvailable(false); return;}
    getVibeNoteAlertPreference().then(async preference => {
      if (!active) return;
      setVibeAlertsAvailable(true);
      setVibeAlertsEnabled(preference.enabled);
      const permitted = await hasVibeNoteBackgroundPermission();
      if (!active) return;
      setVibeAlertsPermission(permitted);
      if (preference.enabled && permitted) await syncVibeNoteRegions().catch(() => {});
      else if (!permitted) await clearVibeNoteRegions().catch(() => {});
    }).catch(cause => {
      if (!active) return;
      const missing = (cause as {status?: number})?.status === 404;
      if (missing) vibeAlertsCapability.check().catch(() => {});
      setVibeAlertsAvailable(missing ? false : null);
      setVibeAlertsEnabled(false);
    });
    return () => {active = false;};
  }, [isFocused, syncVibeNoteRegions]);

  useEffect(() => {
    if (!isFocused || !vibeAlertsEnabled || !vibeAlertsPermission) return;
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') syncVibeNoteRegions().catch(() => {});
    });
    return () => subscription.remove();
  }, [isFocused, syncVibeNoteRegions, vibeAlertsEnabled, vibeAlertsPermission]);

  const toggleVibeAlerts = () => {
    if (vibeAlertsBusy || !vibeAlertsAvailable) return;
    if (vibeAlertsEnabled) {
      setVibeAlertsBusy(true);
      clearVibeNoteRegions().then(() => {
        setVibeAlertsEnabled(false);
        return setVibeNoteAlertPreference(false);
      })
        .catch(cause => Alert.alert('Could not update alerts', errorText(cause)))
        .finally(() => setVibeAlertsBusy(false));
      return;
    }
    Alert.alert('Turn on Nearby Vibe alerts?', 'Hiva checks your location in the background to alert you when you enter an active Vibe Note area. It does not keep a movement history. You can still use Nearby without this permission.', [
      {text: 'Not now', style: 'cancel'},
      {text: 'Continue', onPress: () => {
        setVibeAlertsBusy(true);
        (async () => {
          if (!await requestVibeNoteBackgroundPermission()) {
            Alert.alert('Allow background location', 'Choose “Always” on iPhone or “Allow all the time” on Android to receive alerts while Hiva is closed.', [
              {text: 'Not now', style: 'cancel'},
              {text: 'Open settings', onPress: () => {Linking.openSettings();}},
            ]);
            return;
          }
          await setVibeNoteAlertPreference(true);
          await syncVibeNoteRegions();
          setVibeAlertsEnabled(true);
          setVibeAlertsPermission(true);
        })().catch(async cause => {
          await clearVibeNoteRegions().catch(() => {});
          await setVibeNoteAlertPreference(false).catch(() => {});
          Alert.alert('Alerts could not be enabled', errorText(cause));
        }).finally(() => setVibeAlertsBusy(false));
      }},
    ]);
  };

  useEffect(() => {
    if (!isFocused || mode === 'PASSPORT' || nearbyTab !== 'PEOPLE') return;
    let active = true;
    const requestRef = request;
    (async () => {
      setLoading(true);
      setError(null);
      setVisible(null);
      setPeople([]);
      try {
        const state = await getLocationVisibility();
        if (!active) return;
        setVisible(state.visible);
        if (!state.visible) {setPeople([]); setLoading(false); return;}
        try {
          await updatePosition(false);
          if (active) await loadPeople(radiusRef.current);
        } catch (cause) {
          if (active) {
            const message = errorText(cause);
            if (/permission|settings/i.test(message)) setLocationDenied(true);
            setPeople([]);
            setError(message);
            setLoading(false);
          }
        }
      } catch (cause) {
        if (active) {setError(errorText(cause)); setLoading(false);}
      }
    })();
    return () => {active = false; requestRef.current++;};
  }, [isFocused, loadPeople, mode, nearbyTab, updatePosition]);

  useEffect(() => {if (mode === 'PASSPORT' && !isPlus) setMode('NEARBY');}, [isPlus, mode]);

  const chooseSection = (next: NearbyTab) => {
    if (next === 'EVENTS') {
      request.current++;
      setLoading(false);
      setRefreshing(false);
      setError(null);
      setNearbyTab('EVENTS');
      return;
    }
    if (mode === 'PASSPORT') setVisible(null);
    setNearbyTab('PEOPLE');
    setMode('NEARBY');
  };

  const applyPreset = (preset: DiscoveryPreset) => {
    const next: DiscoveryFilters = {interest: preset.interest ?? undefined, language: preset.language ?? undefined, activeNow: preset.activeNow || undefined};
    setFilters(next);
    filtersRef.current = isPlus ? next : undefined;
    setRadius(preset.radiusMeters);
    radiusRef.current = preset.radiusMeters;
    if (preset.mode === 'PASSPORT') setPassportCity(preset.city ?? '');
    setNearbyTab('PEOPLE');
    setMode(preset.mode);
    // A mode switch triggers its effect; only fetch directly when the active Nearby mode stays mounted.
    if (preset.mode === 'NEARBY' && mode === 'NEARBY' && visible) loadPeople(preset.radiusMeters);
  };

  const goVisible = async () => {
    if (busy) return;
    setBusy(true); setError(null); setLocationDenied(false);
    try {
      await updatePosition(true);
      setVisible(true);
      await loadPeople(radiusRef.current);
    } catch (cause) {
      const message = errorText(cause);
      if (/permission|settings/i.test(message)) setLocationDenied(true);
      else setError(message);
    } finally {setBusy(false);}
  };

  const goInvisible = async () => {
    if (busy) return;
    setBusy(true); setError(null);
    try {
      await setLocationVisibility(false);
      request.current++;
      setVisible(false); setPeople([]); setLoading(false); setRefreshing(false);
    } catch (cause) {setError(errorText(cause));}
    finally {setBusy(false);}
  };

  const refresh = async () => {
    if (!visible || refreshing) return;
    setRefreshing(true);
    try {
      await updatePosition(false);
      if (vibeAlertsEnabled && vibeAlertsPermission) await syncVibeNoteRegions();
      await loadPeople(radiusRef.current, true);
    }
    catch (cause) {
      const message = errorText(cause);
      if (/permission|settings/i.test(message)) {setLocationDenied(true); setPeople([]);}
      setError(message);
      setRefreshing(false);
    }
  };

  const chooseRadius = (meters: number) => {
    setRadius(meters); radiusRef.current = meters;
    loadPeople(meters);
  };

  const openingRef = useRef(openingId);
  openingRef.current = openingId;
  const openConversation = useCallback(async (person: ChatTarget) => {
    if (openingRef.current) return;
    openingRef.current = person.id;
    setOpeningId(person.id); setError(null);
    try {
      const conversation = await startDirectConversation(person.id);
      setChat({id: conversation.id, person});
    } catch (cause) {setError(errorText(cause));}
    finally {openingRef.current = null; setOpeningId(null);}
  }, []);
  const openProfile = useCallback((person: ChatTarget) => setViewing({id: person.id, initial: {name: person.name, avatarUrl: person.avatarUrl}}), []);
  const renderPerson = useCallback(({item, index}: {item: NearbyPerson; index: number}) => <>
    <PersonRow person={item} opening={openingId === item.id} onMessage={openConversation} onOpenProfile={openProfile} />
    {index % 4 === 3 && <NativeAdCard />}
  </>, [openConversation, openProfile, openingId]);

  const retry = async () => {
    setError(null);
    if (visible) {
      try {
        await updatePosition(false);
        await loadPeople(radiusRef.current);
      }
      catch (cause) {
        const message = errorText(cause);
        if (/permission|settings/i.test(message)) {setLocationDenied(true); setPeople([]);}
        setError(message);
      }
      return;
    }
    setLoading(true);
    try {
      const state = await getLocationVisibility();
      setVisible(state.visible);
      if (state.visible) {
        await updatePosition(false);
        await loadPeople(radiusRef.current);
      }
    } catch (cause) {setError(errorText(cause));}
    finally {setLoading(false);}
  };

  const nextRadius = RADII.findIndex(option => option.meters === radius);
  const widenRadius = () => {
    const next = RADII[Math.min(nextRadius + 1, RADII.length - 1)];
    if (next && next.meters !== radius) chooseRadius(next.meters);
  };

  const checkingLocation = visible === null && loading && !error;
  const locationAction = visible === true ? 'Turn off' : locationDenied ? 'Open settings' : visible === null ? error ? 'Retry' : 'Check' : 'Turn on';
  const locationStatus = visible === true ? 'Nearby visibility on' : locationDenied ? 'Location access off' : visible === null ? error ? 'Location unavailable' : checkingLocation ? 'Checking location…' : 'Nearby status unknown' : 'Nearby visibility off';
  const manageLocation = () => {
    if (visible === true) {goInvisible(); return;}
    if (locationDenied) {Linking.openSettings(); return;}
    if (visible === null) {retry(); return;}
    goVisible();
  };

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <View className="px-5 pt-2">
        <View className={width < 360 ? 'items-stretch' : 'flex-row items-center justify-between'}>
          <Text accessibilityRole="header" className="font-display-semibold text-[28px] tracking-[-0.8px] text-foreground">Explore</Text>
          <View className={`flex-row items-center gap-1 ${width < 360 ? 'self-end' : ''}`}>
            <Pressable accessibilityRole="button" accessibilityLabel="Your vibes" onPress={() => setMyVibesOpen(true)}
              className="min-h-11 flex-row items-center justify-center gap-1 rounded-full px-2 active:bg-card">
              <IconNote size={16} color={Colors.primary} />
              <Text numberOfLines={1} className="text-[12px] font-semibold text-primary">Your vibes</Text>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Drop a vibe" onPress={() => setComposing(true)} hitSlop={{top: 8, bottom: 8}}
              className="-mr-5 h-8 w-[100px] flex-row items-center justify-center gap-1 rounded-l-full bg-gold pl-3 pr-5 active:opacity-80">
              <IconPencil size={15} color={Colors.textDark} />
              <Text numberOfLines={1} className="text-[12px] font-bold text-text-dark">Drop a vibe</Text>
            </Pressable>
          </View>
        </View>
        <Text numberOfLines={1} className="mt-1 text-[13px] text-muted">Meet people nearby and discover events.</Text>
        <Pressable accessibilityRole="button" accessibilityLabel={visible === true ? 'Turn off nearby visibility' : locationDenied ? 'Open location settings' : visible === null ? error ? 'Retry location' : 'Check nearby visibility' : 'Turn on nearby visibility'}
          accessibilityState={{disabled: busy || checkingLocation, busy: busy || checkingLocation}}
          disabled={busy || checkingLocation} onPress={manageLocation}
          className="mt-3 min-h-11 flex-row items-center rounded-xl bg-card px-3 active:opacity-75">
          <IconMapPin size={18} color={locationDenied ? Colors.coral : Colors.primary} />
          <Text numberOfLines={1} className="ml-2 flex-1 text-[13px] font-semibold text-foreground">{locationStatus}</Text>
          {busy || checkingLocation ? <ActivityIndicator size="small" color={Colors.primary} />
            : <Text className="ml-3 text-[13px] font-semibold text-primary">{locationAction}</Text>}
        </Pressable>
        {vibeAlertsAvailable === false ? null
          : <View className="mt-2 min-h-[56px] flex-row items-center rounded-xl bg-card px-3">
            <View className="min-w-0 flex-1 pr-3">
              <Text className="text-[13px] font-semibold text-foreground">Nearby Vibe alerts</Text>
              <Text className="mt-0.5 text-[11px] leading-4 text-muted">{vibeAlertsEnabled && !vibeAlertsPermission ? 'Location permission is off; turn alerts off and on to restore it' : 'Alert me when I enter an active vibe area'}</Text>
            </View>
            {vibeAlertsBusy ? <ActivityIndicator size="small" color={Colors.primary} /> : <Switch
              accessibilityLabel="Nearby Vibe alerts"
              value={vibeAlertsEnabled}
              onValueChange={toggleVibeAlerts}
              disabled={!vibeAlertsAvailable}
              trackColor={{false: Colors.border, true: Colors.primary}}
              thumbColor={Colors.white}
            />}
          </View>}
        <View accessibilityRole="tablist" className="mt-3 flex-row gap-7 border-b border-border">
          {(['PEOPLE', 'EVENTS'] as const).map(option => {
            const selected = nearbyTab === option;
            const label = option === 'PEOPLE' ? 'People' : 'Events';
            return <Pressable key={option} accessibilityRole="tab" accessibilityLabel={label}
              accessibilityState={{selected}} onPress={() => chooseSection(option)} hitSlop={{top: 3, bottom: 3}}
              className="min-h-11 flex-row items-center justify-center gap-1 px-0.5 active:opacity-70">
              <Text numberOfLines={1} className={`text-[14px] font-semibold ${selected ? 'text-foreground' : 'text-muted'}`}>{label}</Text>
              {selected && <View className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full bg-primary" />}
            </Pressable>;
          })}
        </View>
      </View>

      {nearbyTab === 'EVENTS' ? <View className="flex-1"><EventsList onOpenEventChat={conversationId => navigation.navigate('Chat', {initialView: 'events', initialConversationId: conversationId})} /></View>
        : mode === 'PASSPORT' ? <View className="flex-1">
        <View className="flex-row items-center justify-between px-5 pt-2">
          <Pressable accessibilityRole="button" accessibilityLabel="Back to nearby people" onPress={() => setMode('NEARBY')} className="min-h-10 justify-center pr-3">
            <Text className="text-[13px] font-semibold text-primary">‹ Nearby people</Text>
          </Pressable>
          {plusEnabled && <PresetsBar current={{mode, city: passportCity, radiusMeters: radius, filters}} onApply={applyPreset} />}
        </View>
        <PassportResults city={passportCity} onCityChange={setPassportCity} filters={filters}
        onFiltersChange={next => {setFilters(next); filtersRef.current = isPlus ? next : undefined;}}
        openingId={openingId} onOpenProfile={openProfile}
        onMessage={openConversation} />
      </View> : <FlashList showsVerticalScrollIndicator={false}
        data={visible === true && !loading ? people : noPeople} keyExtractor={personKey} getItemType={personType} renderItem={renderPerson}
        refreshControl={visible ? <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={Colors.gold} colors={[Colors.gold]} progressBackgroundColor={Colors.card} /> : undefined}
        contentContainerStyle={LIST_CONTENT}
        ListHeaderComponent={<>
        {visible === null && loading ? <View className="items-center pt-16"><ActivityIndicator color={Colors.primary} /></View> : visible === null && error ? (
          <View className="items-center px-5 pt-20">
            <Text accessibilityRole="alert" className="text-center text-[16px] font-semibold text-foreground">Explore couldn’t load</Text>
            <Text className="mt-2 text-center text-[13px] leading-5 text-muted">{error}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Retry Explore" onPress={retry} className="mt-5 min-h-10 justify-center rounded-full bg-primary-dark px-5">
              <Text className="text-[13px] font-semibold text-primary">Try again</Text>
            </Pressable>
          </View>
        ) : visible !== true ? (
          <View className="items-center px-5 pt-20">
            <View className="h-14 w-14 items-center justify-center rounded-full bg-primary-dark"><IconMapPin size={28} color={Colors.primary} /></View>
            <Text className="mt-5 text-center text-[20px] font-bold text-foreground">Meet people near you</Text>
            <Text className="mt-2 text-center text-[14px] leading-[21px] text-muted">{locationDenied ? 'Allow location in Settings, then come back to Explore.' : 'Turn on nearby above to see people around you. Only your approximate area is shown.'}</Text>
          </View>
        ) : (
          <>
            <Text className="mt-5 text-[20px] font-bold text-foreground">People near you</Text>
            <View className={`mt-3 flex-row items-center gap-2 ${width < 360 ? 'flex-wrap' : ''}`}>
              <Pressable accessibilityRole="button" accessibilityLabel={`Within ${RADII.find(option => option.meters === radius)?.label ?? 'selected distance'}, change distance`}
                onPress={() => setDistanceOpen(true)} className="min-h-10 flex-row items-center gap-1.5 rounded-full bg-card px-3 active:opacity-75">
                <IconMapPin size={15} color={Colors.muted} />
                <Text className="text-[13px] font-semibold text-foreground">Within {RADII.find(option => option.meters === radius)?.label ?? '2 km'}</Text>
                <IconChevronDown size={14} color={Colors.muted} />
              </Pressable>
              <DiscoveryFilterBar hideCity showClearAction={false} filters={filters} onChange={next => {
                setFilters(next); filtersRef.current = isPlus ? next : undefined; loadPeople(radiusRef.current);
              }} subtitle="People near you" />
              {plusEnabled && <PresetsBar current={{mode, city: passportCity, radiusMeters: radius, filters}} onApply={applyPreset} />}
            </View>

            {!loading && people.length > 0 && <Text className="mt-4 text-[12px] text-muted">{people.length} {people.length === 1 ? 'person' : 'people'} nearby</Text>}

            {error ? <View className="mb-3 rounded-2xl border border-coral/30 bg-card p-4">
              <Text accessibilityRole="alert" className="text-[13px] leading-5 text-coral">{error}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Retry nearby people" onPress={retry} hitSlop={4} className="mt-2 min-h-9 justify-center self-start">
                <Text className="text-[13px] font-semibold text-primary">Try again</Text>
              </Pressable>
              {locationDenied && <Pressable accessibilityRole="button" accessibilityLabel="Open location settings" onPress={() => Linking.openSettings()} className="min-h-9 justify-center self-start">
                <Text className="text-[13px] font-semibold text-primary">Open location settings</Text>
              </Pressable>}
            </View> : null}
            {loading ? <View className="mt-4"><PeopleLoading /></View> : null}
          </>
        )}
        </>}
        ListEmptyComponent={visible === true && !loading && !error ? (
          <View className="mt-5 rounded-2xl bg-card px-4 py-4">
            <Text className="text-[16px] font-semibold text-foreground">No one within {RADII.find(option => option.meters === radius)?.label ?? 'this distance'} yet</Text>
            <Text className="mt-1 text-[13px] leading-5 text-muted">{nextRadius < RADII.length - 1 ? 'A wider search might find more people.' : 'Check back later for new people nearby.'}</Text>
            {nextRadius < RADII.length - 1 && <Pressable accessibilityRole="button" accessibilityLabel="Widen search range" onPress={widenRadius} className="mt-2 min-h-10 justify-center self-start pr-4 active:opacity-75">
              <Text className="text-[13px] font-semibold text-primary">Try {RADII[nextRadius + 1].label} →</Text>
            </Pressable>}
          </View>
        ) : undefined}
        ListFooterComponent={error && visible === false ? <Pressable accessibilityRole="button" accessibilityLabel="Retry Explore" onPress={retry} hitSlop={4} className="mt-4 min-h-10 justify-center rounded-xl bg-card px-4">
          <Text accessibilityRole="alert" className="text-[13px] leading-5 text-coral">{error}  <Text className="font-semibold text-primary">Try again</Text></Text>
        </Pressable> : undefined} />}

      <BottomSheet visible={distanceOpen} onClose={() => setDistanceOpen(false)} title="Search distance" subtitle="Show people near your current location.">
        <View className="flex-row gap-2 pb-2 pt-2">
          {RADII.map(option => {
            const selected = radius === option.meters;
            return <Pressable key={option.meters} accessibilityRole="button" accessibilityLabel={`Search within ${option.label}`} accessibilityState={{selected}}
              onPress={() => {setDistanceOpen(false); chooseRadius(option.meters);}}
              className={`min-h-11 min-w-0 flex-1 items-center justify-center rounded-full px-1 active:opacity-75 ${selected ? 'bg-gold' : 'bg-card'}`}>
              <Text numberOfLines={1} className={`text-[13px] font-semibold ${selected ? 'text-text-dark' : 'text-foreground'}`}>{option.label}</Text>
            </Pressable>;
          })}
        </View>
      </BottomSheet>

      {viewing && <UserProfileModal userId={viewing.id} initial={viewing.initial} visible onClose={() => setViewing(null)}
        onBlocked={id => {setViewing(null); setPeople(current => current.filter(person => person.id !== id));}} />}
      {chat && <DirectConversation conversationId={chat.id} contactId={chat.person.id} contactName={chat.person.name}
        contactAvatarUrl={chat.person.avatarUrl} onClose={() => setChat(null)} />}
      <MyVibesSheet visible={myVibesOpen} onClose={() => setMyVibesOpen(false)} />
      <VibeNoteComposer visible={composing} onClose={() => setComposing(false)} onPosted={() => setComposing(false)} />
      <VibeNoteRevealSheet noteId={revealNoteId} onClose={() => setRevealNoteId(null)} />
    </SafeAreaView>
  );
}
