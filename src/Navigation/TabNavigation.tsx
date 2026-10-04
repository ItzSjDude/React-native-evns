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

import {
  HomeStack,
  Nearby,
  Party,
  Messages,
  Profile,
} from './StackNavigation';

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
  Party: 'people',
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
        style={[styles.activeGlow, activeStyle]}
      />

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
        style={({pressed}) => [
          styles.tabItem,
          pressed && styles.pressed,
        ]}>
        <AppIcon
          name={tabIcons[name]}
          size={24}
          color={focused ? Colors.text : Colors.muted}
        />

        {focused && (
          <Text style={styles.tabLabel}>
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
      style={styles.tabBar}>
      <View
        style={[
          styles.tabPill,
          screenWidth < 360 && styles.tabPillCompact,
        ]}
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
    screenOptions={{
      headerShown: false,
      animation: 'fade',
    }}>
    <Tab.Screen
      name="Home"
      component={HomeStack}
    />

    <Tab.Screen
      name="Nearby"
      component={Nearby}
    />

    <Tab.Screen
      name="Party"
      component={Party}
    />

    <Tab.Screen
      name="Chat"
      component={Messages}
    />

    <Tab.Screen
      name="Me"
      component={Profile}
    />
  </Tab.Navigator>
);

export default TabNavigation;

const styles = StyleSheet.create({
  tabBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    backgroundColor: Colors.transparent,
  },

  tabPill: {
    width: '74%',
    height: 55,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: '#514B62',
    backgroundColor: '#11101B',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },

  tabPillCompact: {
    width: '90%',
  },

  tabSlot: {
    height: 50,
    justifyContent: 'center',
  },

  tabItem: {
    height: 50,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: 5,
  },

  activeGlow: {
    position: 'absolute',
    left: -4,
    right: -4,
    top: 1,
    bottom: 1,
    borderRadius: 25,
    borderWidth: 3,
    borderColor: 'rgba(148, 127, 226, 0.20)',
  },

  activeTab: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 5,
    bottom: 5,
    borderRadius: 20,
    backgroundColor: '#13111F',
    borderWidth: 1.5,
    borderColor: '#73679D',
  },

  tabLabel: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '600',
  },

  pressed: {
    opacity: 0.7,
  },
});