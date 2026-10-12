import React, {useCallback, useEffect, useState} from 'react';
import {ActivityIndicator, Linking, Pressable, ScrollView, Text, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useIsFocused} from '@react-navigation/native';
import IconAdjustmentsHorizontal from '@tabler/icons-react-native/IconAdjustmentsHorizontal';
import IconEye from '@tabler/icons-react-native/IconEye';
import IconGenderFemale from '@tabler/icons-react-native/IconGenderFemale';
import IconGenderMale from '@tabler/icons-react-native/IconGenderMale';
import IconGenderTransgender from '@tabler/icons-react-native/IconGenderTransgender';
import IconLock from '@tabler/icons-react-native/IconLock';
import IconMapPin from '@tabler/icons-react-native/IconMapPin';
import IconPencil from '@tabler/icons-react-native/IconPencil';
import {Colors} from '../../Constants/Colors';
import {openPaywall, usePlus} from '../plus';
import {requestLocationPermission} from './deviceLocation';
import type {ExploreCard, ExploreGender} from './types';
import VibeNoteComposer from './VibeNoteComposer';

// ponytail: static cards, swap for the nearby query once Say hi has real user ids.
const cards: ExploreCard[] = [
  {id: 'aarav', name: 'aarav', gender: 'male', bio: 'Coffee, trekking and bad puns.'},
  {id: 'meera', name: 'meera', gender: 'female', bio: 'Designer by day, gamer by night.'},
  {id: 'sam', name: 'sam', gender: 'nonbinary', bio: 'Looking for gig buddies.'},
  {id: 'riya', name: 'riya', gender: 'female', bio: 'Weekend cyclist. Ask me for chai spots.'},
];

const genderGlyph: Record<ExploreGender, {Icon: typeof IconGenderMale; color: string}> = {
  male: {Icon: IconGenderMale, color: '#4DA3FF'},
  female: {Icon: IconGenderFemale, color: '#FF5C9A'},
  nonbinary: {Icon: IconGenderTransgender, color: Colors.primary},
};

const radii = [
  {label: '10 km', plus: false},
  {label: '20 km', plus: false},
  {label: '40 km', plus: false},
  {label: '60+ km', plus: true},
] as const;

type Permission = 'checking' | 'granted' | 'denied';

const Explore = () => {
  const isFocused = useIsFocused();
  const {isPlus} = usePlus();
  const [permission, setPermission] = useState<Permission>('checking');
  const [radius, setRadius] = useState<string>(radii[0].label);
  const [composing, setComposing] = useState(false);

  const askLocation = useCallback(async () => {
    const granted = await requestLocationPermission().catch(() => false);
    setPermission(granted ? 'granted' : 'denied');
    return granted;
  }, []);

  // Ask every time the tab is opened, so a grant made in Settings is picked up.
  useEffect(() => {
    if (isFocused) askLocation();
  }, [isFocused, askLocation]);

  const choose = (option: (typeof radii)[number]) => {
    if (option.plus && !isPlus) { openPaywall('filters'); return; }
    setRadius(option.label);
  };

  const allowLocation = async () => {
    // iOS won't prompt again after a denial, so send the person to Settings instead.
    if (!(await askLocation())) Linking.openSettings();
  };

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <View className="px-5 pt-3">
        <View className="flex-row items-center justify-between">
          <Text accessibilityRole="header" className="font-display-semibold text-[34px] tracking-[-0.8px] text-foreground">Explore</Text>
          <View className="flex-row items-center gap-3">
            {/* ponytail: visibility toggle not wired yet. */}
            <Pressable accessibilityRole="button" accessibilityLabel="Visibility" className="h-11 w-11 items-center justify-center rounded-full border-2 border-border active:opacity-70">
              <IconEye size={20} color={Colors.text} />
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Drop a vibe" onPress={() => setComposing(true)} className="h-11 flex-row items-center gap-1.5 rounded-full bg-gold px-4 active:opacity-70">
              <IconPencil size={16} color={Colors.white} />
              <Text className="text-[14px] font-bold text-white">Drop a vibe</Text>
            </Pressable>
          </View>
        </View>
        <Text className="mt-1 text-[16px] text-muted">Find people around you</Text>

        {permission === 'granted' && <View className="mt-5 flex-row items-center">
          <View className="flex-1 flex-row flex-wrap gap-1.5">
            {radii.map(option => {
              const selected = radius === option.label;
              const locked = option.plus && !isPlus;
              return <Pressable key={option.label} accessibilityRole="button" accessibilityLabel={locked ? `${option.label}, requires Hiva Plus` : option.label} accessibilityState={{selected}} onPress={() => choose(option)}
                className={`h-9 flex-row items-center gap-1.5 rounded-full px-3.5 ${selected ? 'bg-gold' : 'bg-card'} active:opacity-70`}>
                <Text className={`text-[14px] font-semibold ${selected ? 'text-white' : 'text-foreground'}`}>{option.label}</Text>
                {locked && <IconLock size={13} color={Colors.muted} />}
              </Pressable>;
            })}
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Filters" onPress={() => { if (!isPlus) openPaywall('filters'); }} className="ml-2 h-10 w-10 items-center justify-center rounded-full bg-card active:opacity-70">
            <IconAdjustmentsHorizontal size={20} color={Colors.text} />
          </Pressable>
        </View>}
      </View>

      {permission === 'granted' && <ScrollView contentContainerClassName="px-5 pb-[110px] pt-5" showsVerticalScrollIndicator={false}>
        {cards.map(card => {
          const {Icon, color} = genderGlyph[card.gender];
          return <View key={card.id} className="mb-4 flex-row items-center rounded-[20px] bg-card px-4 py-4">
            <View className="h-14 w-14 items-center justify-center rounded-full bg-[#262631]">
              <Text className="text-[20px] font-bold text-foreground">{card.name.slice(0, 1).toUpperCase()}</Text>
            </View>
            <View className="ml-4 flex-1 pr-3">
              <View className="flex-row items-center gap-1.5">
                <Text className="text-[17px] font-semibold text-foreground">{card.name}</Text>
                <Icon size={18} color={color} />
              </View>
              <Text className="mt-1 text-[15px] leading-[21px] text-muted">{card.bio}</Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel={`Say hi to ${card.name}`} className="h-11 justify-center rounded-full bg-primary-dark px-5 active:opacity-70">
              <Text className="text-[15px] font-bold text-primary">Say hi!</Text>
            </Pressable>
          </View>;
        })}
      </ScrollView>}

      {permission === 'checking' && <View className="flex-1 items-center justify-center"><ActivityIndicator color={Colors.gold} /></View>}

      {permission === 'denied' && <View className="flex-1 items-center justify-center px-8 pb-[110px]">
        <View className="h-16 w-16 items-center justify-center rounded-full bg-primary-dark"><IconMapPin size={30} color={Colors.primary} /></View>
        <Text className="mt-5 text-center text-[18px] font-semibold text-foreground">Allow location to explore people</Text>
        <Text className="mt-2 text-center text-sm leading-5 text-muted">Hiva uses your location to find people within your range.</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Allow location" onPress={allowLocation} className="mt-6 h-12 items-center justify-center rounded-full bg-gold px-8 active:opacity-70">
          <Text className="text-[15px] font-bold text-white">Allow location</Text>
        </Pressable>
      </View>}

      <VibeNoteComposer visible={composing} onClose={() => setComposing(false)} onPosted={() => setComposing(false)} />
    </SafeAreaView>
  );
};

export default Explore;
