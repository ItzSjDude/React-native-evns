import React from 'react';
import {Pressable, Text, View} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {SafeAreaView} from 'react-native-safe-area-context';
import IconArrowLeft from '@tabler/icons-react-native/IconArrowLeft';
import IconBell from '@tabler/icons-react-native/IconBell';
import {Colors} from '../../Constants/Colors';
import type {RootNavigationParamList} from '../../Navigation/navigationRef';

type NotificationsNavigation = NativeStackNavigationProp<RootNavigationParamList>;

const Notifications = () => {
  const navigation = useNavigation<NotificationsNavigation>();

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <View className="h-[68px] flex-row items-center border-b border-border px-5">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go back"
          onPress={() => navigation.goBack()}
          className="h-11 w-11 items-center justify-center rounded-full active:bg-card">
          <IconArrowLeft size={24} color={Colors.text} strokeWidth={2} />
        </Pressable>
        <Text className="ml-3 text-[22px] font-bold text-foreground">Notifications</Text>
      </View>

      <View className="flex-1 items-center justify-center px-8 pb-20">
        <View className="h-[72px] w-[72px] items-center justify-center rounded-full bg-primary-dark">
          <IconBell size={34} color={Colors.primary} strokeWidth={1.8} />
        </View>
        <Text className="mt-5 text-center text-[20px] font-bold text-foreground">You’re all caught up</Text>
        <Text className="mt-2 text-center text-[15px] leading-[22px] text-muted">
          New activity from your friends and communities will appear here.
        </Text>
      </View>
    </SafeAreaView>
  );
};

export default Notifications;
