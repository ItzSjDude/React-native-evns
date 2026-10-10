import React, {useEffect, useState} from 'react';
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
import {MessagesScreen} from '../features/messages';
import {ProfileScreen} from '../features/profile';

import {Colors} from '../Constants/Colors';
import AppIcon, {type IconName} from '../Constants/Icons';

export type TabParamList = {
  Home: undefined;
  Nearby: undefined;
  Party: undefined;
  Chat: undefined;
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
  accessibilityLabel: string;
};

const TabButton = ({
  name,
  index,
  focused,
  activeWidth,
  inactiveWidth,
  position,
  onPress,
  onLongPress,
  accessibilityLabel,
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
        style={[styles.activeTab, activeStyle]}
      />

      <Pressable
        accessibilityRole="tab"
        accessibilityLabel={accessibilityLabel}
        accessibilityState={{selected: focused}}
        hitSlop={{left: 2, right: 2}}
        onPress={onPress}
        onLongPress={onLongPress}
        className="h-[50px] w-full flex-row items-center justify-center gap-1 px-[5px] active:opacity-70">
        <AppIcon
          name={tabIcons[name]}
          size={24}
          color={focused ? Colors.text : Colors.muted}
          filled={focused}
        />

        {focused && (
          <Text className="text-sm font-semibold text-foreground">
            {name}
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

  const position = useSharedValue(state.index);

  const availableWidth =
    pillWidth ||
    screenWidth * (screenWidth < 360 ? 0.9 : 0.74);

  const activeWidth = Math.min(
    115,
    Math.max(0, availableWidth - 12 - 4 * 43),
  );

  const inactiveWidth = Math.max(
    43,
    (availableWidth - 12 - activeWidth) /
      (state.routes.length - 1),
  );

  useEffect(() => {
    position.value = withTiming(state.index, {
      duration: 190,
      easing: Easing.out(Easing.cubic),
    });
  }, [position, state.index]);

  return (
    <SafeAreaView
      edges={['bottom']}
      className="absolute bottom-0 left-0 right-0 items-center bg-transparent">
      <View
        className={`h-[55px] flex-row items-center justify-center rounded-[28px] border border-[#514B62] bg-[#11101B] px-[5px] ${screenWidth < 360 ? 'w-[90%]' : 'w-[74%]'}`}
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
              index={index}
              focused={focused}
              activeWidth={activeWidth}
              inactiveWidth={inactiveWidth}
              position={position}
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

const TabNavigation = () => (
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
    />

    <Tab.Screen
      name="Party"
      component={PartyScreen}
    />

    <Tab.Screen
      name="Chat"
      component={MessagesScreen}
    />

    <Tab.Screen
      name="Me"
      component={ProfileScreen}
    />
  </Tab.Navigator>
);

export default TabNavigation;

// Reanimated needs native style objects for the tab width and fading overlays.
const styles = StyleSheet.create({
  tabSlot: {height: 50, justifyContent: 'center'},
  activeTab: {position: 'absolute', left: 0, right: 0, top: 5, bottom: 5, borderRadius: 20, backgroundColor: '#13111F', borderWidth: 1.5, borderColor: '#73679D'},
});
