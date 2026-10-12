import React, {useCallback, useEffect, useRef, useState} from 'react';
import {ActivityIndicator, FlatList, Image, Pressable, Text, TextInput, View} from 'react-native';
import IconMessageCircle from '@tabler/icons-react-native/IconMessageCircle';
import IconWorld from '@tabler/icons-react-native/IconWorld';
import {Colors} from '../../Constants/Colors';
import {CITY_MAX_LENGTH, DiscoveryFilterBar, type DiscoveryFilters} from '../plus';
import {nearbyErrorMessage} from './nearbyErrors';
import {getPassportPeople} from './nearbyService';
import type {PassportPerson} from './types';

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
  <Pressable accessibilityRole="button" accessibilityLabel={`View ${person.name}, Passport ${city}`} onPress={onOpenProfile} className="mb-3 flex-row items-center rounded-[20px] bg-card px-4 py-4 active:opacity-70">
    {person.avatarUrl ? <Image source={{uri: person.avatarUrl}} className="h-12 w-12 rounded-full" /> : (
      <View className="h-12 w-12 items-center justify-center rounded-full bg-primary-dark">
        <Text className="text-base font-bold text-foreground">{person.name.slice(0, 1).toUpperCase()}</Text>
      </View>
    )}
    <View className="ml-3 min-w-0 flex-1">
      <Text className="text-[16px] font-semibold text-foreground" numberOfLines={1}>{person.name}</Text>
      <View className="mt-1 flex-row items-center gap-1">
        <IconWorld size={14} color={Colors.primary} />
        <Text className="text-[13px] text-primary" numberOfLines={1}>{`Passport · ${city}`}</Text>
      </View>
    </View>
    <Pressable accessibilityRole="button" accessibilityLabel={`Message ${person.name}`} onPress={onPress} disabled={opening} hitSlop={6}
      className="ml-2 h-10 w-10 items-center justify-center rounded-full bg-primary-dark active:opacity-70">
      {opening ? <ActivityIndicator size="small" color={Colors.gold} /> : <IconMessageCircle size={21} color={Colors.primary} />}
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

  const submit = () => onCityChange(draft.trim());
  const more = () => { if (hasMore && !loading && !error && target) load(people.length); };
  const header = <>
    <View className="mb-3 mt-6 flex-row items-center gap-2">
      <TextInput accessibilityLabel="Passport city" value={draft} onChangeText={setDraft} maxLength={CITY_MAX_LENGTH} onSubmitEditing={submit} returnKeyType="search"
        placeholder="Which city?" placeholderTextColor={Colors.muted} autoCorrect={false}
        className="h-11 min-w-0 flex-1 rounded-xl border border-border bg-card px-3 text-[15px] text-foreground" />
      <Pressable accessibilityRole="button" accessibilityLabel="Search city" onPress={submit} className="h-11 items-center justify-center rounded-full bg-gold px-5 active:opacity-70">
        <Text className="text-[13px] font-bold text-text-dark">Search</Text>
      </Pressable>
    </View>
    <View className="mb-6"><DiscoveryFilterBar hideCity filters={{...filters, city: undefined}} onChange={next => onFiltersChange({...next, city: filters.city})} /></View>
    {!!target && <View className="mb-3 flex-row items-center justify-between">
      <Text className="text-xl font-bold text-foreground">People in {target}</Text>
      <View className="flex-row items-center gap-1 rounded-full bg-primary-dark px-3 py-1.5"><IconWorld size={13} color={Colors.primary} /><Text className="text-xs font-semibold text-primary">{`Passport · ${target}`}</Text></View>
    </View>}
    {error && <Pressable accessibilityRole="button" accessibilityLabel="Retry passport" onPress={() => load(people.length)} className="mb-4 rounded-xl bg-card p-3"><Text className="text-sm text-coral">{error} Tap to retry.</Text></Pressable>}
  </>;

  return <FlatList
    data={people}
    keyExtractor={item => item.id}
    renderItem={({item}) => <PassportRow person={item} city={item.city ?? target} opening={openingId === item.id} onPress={() => onMessage(item)} onOpenProfile={() => onOpenProfile(item)} />}
    keyboardShouldPersistTaps="handled"
    showsVerticalScrollIndicator={false}
    contentContainerClassName="flex-grow px-5 pb-[110px]"
    onEndReachedThreshold={0.4}
    onEndReached={more}
    ListHeaderComponent={header}
    ListFooterComponent={people.length && loading ? <ActivityIndicator className="my-4" color={Colors.gold} /> : undefined}
    ListEmptyComponent={loading ? <View className="items-center pt-16"><ActivityIndicator color={Colors.gold} /></View> : !error ? (
      <View className="items-center px-6 pt-16">
        <IconWorld size={44} color={Colors.muted} strokeWidth={1.5} />
        <Text className="mt-4 text-center text-base font-semibold text-foreground">{target ? `No one found in ${target}` : 'Pick a city'}</Text>
        <Text className="mt-2 text-center text-sm leading-5 text-muted">{target ? 'Try another city or fewer filters.' : 'Search a city to meet people there, wherever you are.'}</Text>
      </View>
    ) : undefined}
  />;
}
