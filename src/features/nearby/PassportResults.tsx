import React, {Fragment, memo, useCallback, useEffect, useRef, useState} from 'react';
import {ActivityIndicator, Pressable, Text, TextInput, View} from 'react-native';
import {FlashList} from '@shopify/flash-list';
import IconSearch from '@tabler/icons-react-native/IconSearch';
import IconWorld from '@tabler/icons-react-native/IconWorld';
import {Colors} from '../../Constants/Colors';
import {CITY_MAX_LENGTH, DiscoveryFilterBar, type DiscoveryFilters} from '../plus';
import {nearbyErrorMessage} from './nearbyErrors';
import {getPassportPeople} from './nearbyService';
import type {PassportPerson} from './types';
import {NativeAdCard} from '../ads';
import PersonRow, {PersonRowSkeleton} from '../../components/PersonRow';

type Props = {
  /** The committed city the list is for. */
  city: string;
  onCityChange: (city: string) => void;
  filters: DiscoveryFilters;
  onFiltersChange: (filters: DiscoveryFilters) => void;
  openingId: string | null;
  onOpenProfile: (person: PassportPerson) => void;
  onMessage: (person: PassportPerson) => void;
};

// FlashList only honours padding on the content container.
const LIST_CONTENT = {paddingHorizontal: 20, paddingBottom: 110};
const personKey = (item: PassportPerson) => item.id;
/** Every 4th row carries a native ad under the person, so it gets its own recycling pool. */
const personType = (_item: PassportPerson, index: number) => index % 4 === 3 ? 'personWithAd' : 'person';

/** Never shows a distance: Passport results are about a city, not a place near you. */
export const PassportRow = memo(({person, city, opening, onPress, onOpenProfile}: {person: PassportPerson; city: string; opening: boolean; onPress: () => void; onOpenProfile: () => void}) => (
  <PersonRow name={person.name} avatarUrl={person.avatarUrl} meta={city}
    accessibilityLabel={`View ${person.name} in ${city}`} onPress={onOpenProfile}
    actionLabel="Say hi" actionAccessibilityLabel={`Message ${person.name}`} actionBusy={opening} onAction={onPress}
    trailing={person.isFollowing ? <View accessibilityLabel="You follow them" className="rounded-full border border-gold-line bg-gold-bg px-2 py-1"><Text className="text-[11px] font-bold text-gold">Following</Text></View> : undefined} />
));

/** Plus-only Social Passport list: people in another city, paged by `hasMore`/offset. Does not use device location. */
export default function PassportResults({city, onCityChange, filters, onFiltersChange, openingId, onOpenProfile, onMessage}: Props) {
  const [draft, setDraft] = useState(city);
  const [people, setPeople] = useState<PassportPerson[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inputError, setInputError] = useState(false);
  const request = useRef(0);
  const target = city.trim();

  useEffect(() => setDraft(city), [city]);

  const load = useCallback(async (offset: number) => {
    const id = ++request.current;
    setLoading(true);
    setError(null);
    try {
      const page = await getPassportPeople(target, filters, offset);
      if (id !== request.current) return;
      setPeople(current => offset ? [...current, ...page.people.filter(next => !current.some(known => known.id === next.id))] : page.people);
      setHasMore(page.hasMore);
    } catch (cause) {
      if (id === request.current) setError(nearbyErrorMessage(cause, 'passport'));
    } finally {
      if (id === request.current) setLoading(false);
    }
  }, [filters, target]);

  useEffect(() => {
    const requestRef = request;
    setPeople([]);
    setHasMore(false);
    if (target) load(0);
    else {request.current++; setLoading(false); setError(null);}
    return () => {requestRef.current++;};
  }, [load, target]);

  const submit = () => {
    const next = draft.trim();
    if (!next && !target) {setInputError(true); return;}
    setInputError(false);
    if (next === target && next) load(0);
    else onCityChange(next);
  };
  // Parent callbacks are inline, so rows call through refs and stay memoized.
  const callbacks = useRef({onMessage, onOpenProfile});
  callbacks.current = {onMessage, onOpenProfile};
  const renderPerson = useCallback(({item, index}: {item: PassportPerson; index: number}) => <Fragment>
    <PassportRow person={item} city={item.city ?? target} opening={openingId === item.id} onPress={() => callbacks.current.onMessage(item)} onOpenProfile={() => callbacks.current.onOpenProfile(item)} />
    {index % 4 === 3 && <NativeAdCard />}</Fragment>, [target, openingId]);
  const more = () => { if (hasMore && !loading && !error && target) load(people.length); };
  const header = <>
    <View className="pt-6">
      <Text className="text-[20px] font-bold text-foreground">Choose a city</Text>
      <Text className="mt-1.5 text-[13px] leading-5 text-muted">This search doesn’t use your current location.</Text>
    </View>
    <View className="mt-5 flex-row items-center gap-2">
      <View className="h-11 min-w-0 flex-1 flex-row items-center rounded-xl bg-card px-3">
        <IconSearch size={18} color={Colors.muted} />
        <TextInput accessibilityLabel="City name" value={draft} onChangeText={value => {setDraft(value); setInputError(false);}} maxLength={CITY_MAX_LENGTH} onSubmitEditing={submit} returnKeyType="search"
          placeholder="Search a city" placeholderTextColor={Colors.muted} autoCorrect={false}
          className="ml-2 h-11 min-w-0 flex-1 text-[15px] text-foreground" />
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="Search city" onPress={submit} className="h-11 items-center justify-center rounded-full bg-gold px-5 active:opacity-70">
        <Text className="text-[13px] font-bold text-text-dark">Search</Text>
      </Pressable>
    </View>
    {inputError && <Text accessibilityRole="alert" className="mt-2 text-[13px] text-coral">Enter a city to search.</Text>}
    {!!target && <View className="mb-3 mt-8 flex-row items-center justify-between">
      <Text className="min-w-0 flex-1 pr-2 text-[20px] font-bold text-foreground" numberOfLines={1}>People in {target}</Text>
      <DiscoveryFilterBar hideCity filters={{...filters, city: undefined}} onChange={next => onFiltersChange({...next, city: filters.city})} subtitle={`People in ${target}`} />
    </View>}
    {error && <Pressable accessibilityRole="button" accessibilityLabel="Retry city search" onPress={() => load(people.length)} className="mb-4 min-h-11 justify-center rounded-xl bg-card p-3"><Text className="text-sm text-coral">{error} Tap to retry.</Text></Pressable>}
  </>;

  return <FlashList
    data={people}
    keyExtractor={personKey}
    getItemType={personType}
    renderItem={renderPerson}
    keyboardShouldPersistTaps="handled"
    showsVerticalScrollIndicator={false}
    contentContainerStyle={LIST_CONTENT}
    onEndReachedThreshold={0.4}
    onEndReached={more}
    ListHeaderComponent={header}
    ListFooterComponent={people.length && loading ? <ActivityIndicator className="my-4" color={Colors.gold} /> : undefined}
    ListEmptyComponent={loading ? <View accessibilityRole="progressbar" accessibilityLabel="Loading people" accessibilityState={{busy: true}}>{[0, 1, 2, 3].map(key => <PersonRowSkeleton key={key} chips={false} />)}</View> : target && !error ? (
      <View className="items-center px-6 pt-20">
        <IconWorld size={36} color={Colors.muted} strokeWidth={1.5} />
        <Text className="mt-4 text-center text-[16px] font-semibold text-foreground">No one found in {target}</Text>
        <Text className="mt-1.5 text-center text-[13px] leading-5 text-muted">Try another city or change your filters.</Text>
      </View>
    ) : undefined}
  />;
}
