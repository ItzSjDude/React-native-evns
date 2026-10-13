import React, {Fragment, useCallback, useEffect, useRef, useState} from 'react';
import {ActivityIndicator, FlatList, Image, Pressable, Text, TextInput, View} from 'react-native';
import IconMessageCircle from '@tabler/icons-react-native/IconMessageCircle';
import IconSearch from '@tabler/icons-react-native/IconSearch';
import IconWorld from '@tabler/icons-react-native/IconWorld';
import {Colors} from '../../Constants/Colors';
import {CITY_MAX_LENGTH, DiscoveryFilterBar, type DiscoveryFilters} from '../plus';
import {nearbyErrorMessage} from './nearbyErrors';
import {getPassportPeople} from './nearbyService';
import type {PassportPerson} from './types';
import {NativeAdCard} from '../ads';

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

/** Never shows a distance: Passport results are about a city, not a place near you. */
export const PassportRow = ({person, city, opening, onPress, onOpenProfile}: {person: PassportPerson; city: string; opening: boolean; onPress: () => void; onOpenProfile: () => void}) => (
  <Pressable accessibilityRole="button" accessibilityLabel={`View ${person.name} in ${city}`} onPress={onOpenProfile} className="min-h-[72px] flex-row items-center border-b border-border py-3 active:opacity-70">
    {person.avatarUrl ? <Image source={{uri: person.avatarUrl}} className="h-12 w-12 rounded-full" /> : (
      <View className="h-12 w-12 items-center justify-center rounded-full bg-primary-dark">
        <Text className="text-base font-bold text-primary">{person.name.slice(0, 1).toUpperCase()}</Text>
      </View>
    )}
    <View className="ml-3 min-w-0 flex-1">
      <Text className="text-[15px] font-semibold text-foreground" numberOfLines={1}>{person.name}</Text>
      <Text className="mt-0.5 text-[13px] text-muted" numberOfLines={1}>{city}</Text>
    </View>
    <Pressable accessibilityRole="button" accessibilityLabel={`Message ${person.name}`} onPress={onPress} disabled={opening} hitSlop={6}
      className="ml-2 h-9 flex-row items-center justify-center gap-1.5 rounded-full bg-primary-dark px-3 active:opacity-70">
      {opening ? <ActivityIndicator size="small" color={Colors.primary} /> : <><IconMessageCircle size={17} color={Colors.primary} /><Text className="text-[12px] font-semibold text-primary">Say hi</Text></>}
    </Pressable>
  </Pressable>
);

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
    {error && <Pressable accessibilityRole="button" accessibilityLabel="Retry city search" onPress={() => load(people.length)} className="mb-4 rounded-xl bg-card p-3"><Text className="text-sm text-coral">{error} Tap to retry.</Text></Pressable>}
  </>;

  return <FlatList
    data={people}
    keyExtractor={item => item.id}
    renderItem={({item, index}) => <Fragment><PassportRow person={item} city={item.city ?? target} opening={openingId === item.id} onPress={() => onMessage(item)} onOpenProfile={() => onOpenProfile(item)} />{index % 4 === 3 && <NativeAdCard />}</Fragment>}
    keyboardShouldPersistTaps="handled"
    showsVerticalScrollIndicator={false}
    contentContainerClassName="flex-grow px-5 pb-[110px]"
    onEndReachedThreshold={0.4}
    onEndReached={more}
    ListHeaderComponent={header}
    ListFooterComponent={people.length && loading ? <ActivityIndicator className="my-4" color={Colors.gold} /> : undefined}
    ListEmptyComponent={loading ? <View className="items-center pt-20"><ActivityIndicator color={Colors.primary} /></View> : target && !error ? (
      <View className="items-center px-6 pt-20">
        <IconWorld size={36} color={Colors.muted} strokeWidth={1.5} />
        <Text className="mt-4 text-center text-[16px] font-semibold text-foreground">No one found in {target}</Text>
        <Text className="mt-1.5 text-center text-[13px] leading-5 text-muted">Try another city or change your filters.</Text>
      </View>
    ) : undefined}
  />;
}
