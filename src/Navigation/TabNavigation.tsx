import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import {
  createBottomTabNavigator,
  type BottomTabBarProps,
} from '@react-navigation/bottom-tabs';
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import {SafeAreaView} from 'react-native-safe-area-context';

import {HomeScreen} from '../features/home';
import {NearbyScreen} from '../features/nearby';
import {PartyScreen} from '../features/party';
import {MessagesScreen, useFollowUpOpened} from '../features/messages';
import {MyTicketsView} from '../features/events';
import {resolveNotificationTarget, useNotifications} from '../features/notifications';
import {navigateWhenReady} from './navigationRef';
import {ProfileScreen, useMyAvatarUrl} from '../features/profile';

import {Colors} from '../Constants/Colors';
import AppIcon, {type IconName} from '../Constants/Icons';
import RemoteImage from '../components/RemoteImage';

export type TabParamList = {
  Home: undefined;
  Nearby: {vibeNoteId?: string} | undefined;
  Party: undefined;
  Chat: {initialView?: 'all' | 'unread' | 'requests' | 'events' | 'parties' | 'direct' | 'archived'; initialConversationId?: string} | undefined;
  Me: undefined;
};

const Tab = createBottomTabNavigator<TabParamList>();

const tabIcons: Record<keyof TabParamList, IconName> = {
  Home: 'home',
  Nearby: 'nearby',
  Party: 'party',
  Chat: 'messages',
  Me: 'profile',
};

const positions = [0, 1, 2, 3, 4];

type TabButtonProps = {
  name: keyof TabParamList;
  index: number;
  focused: boolean;
  activeWidth: number;
  inactiveWidth: number;
  position: SharedValue<number>;
  onPress: () => void;
  onLongPress: () => void;
  label: string;
  accessibilityLabel: string;
  avatarUrl?: string | null;
};

const TabButton = ({
  name,
  label,
  index,
  focused,
  activeWidth,
  inactiveWidth,
  position,
  onPress,
  onLongPress,
  accessibilityLabel,
  avatarUrl,
}: TabButtonProps) => {
  const widths = positions.map(value =>
    value === index ? activeWidth : inactiveWidth,
  );

  const visibility = positions.map(value =>
    value === index ? 1 : 0,
  );

  const containerStyle = useAnimatedStyle(() => ({
    width: interpolate(
      position.value,
      positions,
      widths,
      Extrapolation.CLAMP,
    ),
  }));

  const activeStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      position.value,
      positions,
      visibility,
      Extrapolation.CLAMP,
    ),
  }));

  return (
    <Animated.View style={[styles.tabSlot, containerStyle]}>
      <Animated.View
        pointerEvents="none"
        style={[styles.activeTab, {backgroundColor: Colors.gold, borderColor: Colors.gold}, activeStyle]}
      />

      <Pressable
        accessibilityRole="tab"
        accessibilityLabel={accessibilityLabel}
        accessibilityState={{selected: focused}}
        hitSlop={{left: 2, right: 2}}
        onPress={onPress}
        onLongPress={onLongPress}
        className="h-[46px] w-full flex-row items-center justify-center gap-1 px-[5px] active:opacity-70">
        {name === 'Me' && avatarUrl ? (
          <RemoteImage
            uri={avatarUrl}
            priority="high"
            className={`h-6 w-6 rounded-full border-[1.5px] ${focused ? 'border-gold-ink' : 'border-transparent'}`}
          />
        ) : (
          <AppIcon
            name={tabIcons[name]}
            size={24}
            color={focused ? Colors.goldInk : Colors.muted}
            filled={focused}
          />
        )}

        {focused && (
          <Text className="text-sm font-semibold text-gold-ink">
            {label}
          </Text>
        )}
      </Pressable>
    </Animated.View>
  );
};

const CustomTabBar = ({
  state,
  descriptors,
  navigation,
}: BottomTabBarProps) => {
  const {width: screenWidth} = useWindowDimensions();
  const [pillWidth, setPillWidth] = useState(0);
  const avatarUrl = useMyAvatarUrl();

  const position = useSharedValue(state.index);

  const availableWidth =
    pillWidth ||
    screenWidth * (screenWidth < 360 ? 0.94 : 0.86);

  // Unselected tabs are a fixed 44dp slot (keeps the touch target) and the pill hugs its tabs, so the icons sit together instead of spreading across a full-width bar.
  const inactiveWidth = 44;

  const activeWidth = Math.min(
    80,
    Math.max(0, availableWidth - 12 - (state.routes.length - 1) * inactiveWidth),
  );

  useEffect(() => {
    position.value = withTiming(state.index, {
      duration: 220,
      easing: Easing.out(Easing.cubic),
    });
  }, [position, state.index]);

  return (
    <SafeAreaView
      edges={['bottom']}
      className="absolute bottom-0 left-0 right-0 items-center bg-transparent">
      <View
        className={`h-[50px] flex-row items-center justify-center self-center rounded-[25px] border border-border-muted dark:border-[#514B62] bg-nav-background dark:bg-[#11101B] px-[5px]`}
        onLayout={event =>
          setPillWidth(event.nativeEvent.layout.width)
        }>
        {state.routes.map((route, index) => {
          const focused = state.index === index;
          const options = descriptors[route.key].options;

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });

            if (!focused && !event.defaultPrevented) {
              navigation.navigate(route.name);
            }
          };

          return (
            <TabButton
              key={route.key}
              name={route.name as keyof TabParamList}
              label={typeof options.tabBarLabel === 'string' ? options.tabBarLabel : route.name}
              index={index}
              focused={focused}
              activeWidth={activeWidth}
              inactiveWidth={inactiveWidth}
              position={position}
              avatarUrl={avatarUrl}
              onPress={onPress}
              onLongPress={() =>
                navigation.emit({
                  type: 'tabLongPress',
                  target: route.key,
                })
              }
              accessibilityLabel={
                options.tabBarAccessibilityLabel ??
                route.name
              }
            />
          );
        })}
      </View>
    </SafeAreaView>
  );
};

const renderTabBar = (props: BottomTabBarProps) => (
  <CustomTabBar {...props} />
);

// A tapped follow-up reminder lands on the Messages tab. Chat is a tab of the root navigator, which the typed ref does not list.
const openMessagesTab = () => (navigateWhenReady as (name: string, params?: object) => void)('Tabs', {screen: 'Chat'});

// A TICKET bubble lives inside the chat Modal, which covers any stack screen and cannot host a second Modal on iOS.
// So the same full-screen MyTicketsView is laid over the chat inside that Modal; back returns to the conversation.
const renderTicketPass = (ticketId: string, onClose: () => void) => (
  <View style={StyleSheet.absoluteFill} className="bg-background">
    <MyTicketsView ticketId={ticketId} onBack={onClose} onExitTicket={onClose} />
  </View>
);

const TabNavigation = () => {
  useFollowUpOpened(openMessagesTab);
  // Party rooms open through the notification navigator (Home), so Messages needs no party import.
  const {navigateTo} = useNotifications();
  const navigateRef = useRef(navigateTo);
  navigateRef.current = navigateTo;
  const renderMessages = useCallback(
    ({route}: {route: {params?: TabParamList['Chat']}}) => <MessagesScreen initialView={route.params?.initialView}
      initialConversationId={route.params?.initialConversationId} renderTicketPass={renderTicketPass}
      onOpenParty={partyId => navigateRef.current(resolveNotificationTarget(undefined, {partyId}))} />,
    [],
  );
  return (
  <Tab.Navigator
    initialRouteName="Home"
    tabBar={renderTabBar}
    detachInactiveScreens={false}
    screenOptions={{
      headerShown: false,
      animation: 'none',
    }}>
    <Tab.Screen
      name="Home"
      component={HomeScreen}
    />

    <Tab.Screen
      name="Nearby"
      component={NearbyScreen}
      options={{tabBarLabel: 'Explore'}}
    />

    <Tab.Screen
      name="Party"
      component={PartyScreen}
    />

    <Tab.Screen name="Chat">{renderMessages}</Tab.Screen>

    <Tab.Screen
      name="Me"
      component={ProfileScreen}
    />
  </Tab.Navigator>
  );
};

export default TabNavigation;

// Reanimated needs native style objects for the tab width and fading overlays.
const styles = StyleSheet.create({
  tabSlot: {height: 46, justifyContent: 'center'},
  activeTab: {position: 'absolute', left: 0, right: 0, top: 6, bottom: 6, borderRadius: 16, borderWidth: 1.5},
});
