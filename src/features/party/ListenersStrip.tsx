import React, {memo} from 'react';
import {Pressable, Text, View} from 'react-native';
import IconChevronRight from '@tabler/icons-react-native/IconChevronRight';
import RemoteImage from '../../components/RemoteImage';
import {PartyColors, initialsOf, listenerStrip} from './partyPresentation';
import type {PartyParticipant} from './partyService';

/** Compact "Listeners" row under the stage: overlapping avatars with a +N chip; opens the people panel. */
const ListenersStrip = memo(({audience, onPress}: {audience: PartyParticipant[]; onPress: () => void}) => {
  const {shown, overflow} = listenerStrip(audience.length, 6);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Listeners ${audience.length}, open people list`} onPress={onPress}
      className="mx-4 mb-2 mt-1 min-h-12 flex-row items-center gap-3 rounded-2xl border border-border/70 bg-card/60 px-3 active:opacity-70">
      <Text className="text-[13px] font-semibold text-foreground">Listeners</Text>
      <View className="min-w-0 flex-1 flex-row items-center">
        {audience.slice(0, shown).map((person, i) => (
          <View key={person.userId} style={{marginLeft: i === 0 ? 0 : -8}} className="h-8 w-8 items-center justify-center overflow-hidden rounded-full border-2 border-background bg-primary-dark">
            {person.avatarUrl ? <RemoteImage uri={person.avatarUrl} fadeDuration={0} className="h-full w-full rounded-full" />
              : <Text className="text-[10px] font-bold text-primary">{initialsOf(person.name)}</Text>}
          </View>
        ))}
        {overflow > 0 && <View style={{marginLeft: -8}} className="h-8 min-w-[32px] items-center justify-center rounded-full border-2 border-background bg-card px-1.5"><Text className="text-[11px] font-bold text-muted">+{overflow}</Text></View>}
      </View>
      <IconChevronRight size={18} color={PartyColors.muted} />
    </Pressable>
  );
});

export default ListenersStrip;
