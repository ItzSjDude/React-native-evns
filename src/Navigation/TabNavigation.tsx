import React, {useEffect, useState} from 'react';
import {Pressable, StyleSheet, View, useWindowDimensions} from 'react-native';
import {createBottomTabNavigator, type BottomTabBarProps} from '@react-navigation/bottom-tabs';
import Animated, {Easing, Extrapolation, interpolate, useAnimatedStyle, useSharedValue, withTiming, type SharedValue} from 'react-native-reanimated';
import {SafeAreaView} from 'react-native-safe-area-context';
import {HomeStack, Nearby, Party, Messages, Profile} from './StackNavigation';
import {Colors} from '../Constants/Colors';
import AppIcon, {type IconName} from '../Constants/Icons';
import Typography from '../Constants/Typography';

export type TabParamList = {
  Home: undefined;
  Nearby: undefined;
  Party: undefined;
  Messages: undefined;
  Profile: undefined;
};

const Tab = createBottomTabNavigator<TabParamList>();
const tabIcons: Record<keyof TabParamList, IconName> = {
  Home: 'home', Nearby: 'nearby', Party: 'party', Messages: 'messages', Profile: 'profile',
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

const TabButton = ({name, index, focused, activeWidth, inactiveWidth, position, onPress, onLongPress, accessibilityLabel}: TabButtonProps) => {
  const widths = positions.map(value => value === index ? activeWidth : inactiveWidth);
  const visibility = positions.map(value => value === index ? 1 : 0);
  const containerStyle = useAnimatedStyle(() => ({
    width: interpolate(position.value, positions, widths, Extrapolation.CLAMP),
  }));
  const activeStyle = useAnimatedStyle(() => ({
    opacity: interpolate(position.value, positions, visibility, Extrapolation.CLAMP),
  }));
  const labelStyle = useAnimatedStyle(() => ({
    width: interpolate(position.value, positions, visibility.map(value => value * Math.max(0, activeWidth - 40)), Extrapolation.CLAMP),
    opacity: interpolate(position.value, positions, visibility, Extrapolation.CLAMP),
  }));

  return <Animated.View style={[styles.tabSlot, containerStyle]}>
    <Animated.View pointerEvents="none" style={[styles.activeTab, activeStyle]} />
    <Pressable
      accessibilityRole="tab"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{selected: focused}}
      onPress={onPress}
      onLongPress={onLongPress}
      style={({pressed}) => [styles.tabItem, pressed && styles.pressed]}>
      <AppIcon name={tabIcons[name]} size={24} color={focused ? Colors.text : Colors.muted} />
      <Animated.View style={[styles.labelClip, labelStyle]}>
        <Typography size={14} color={Colors.text} fontWeight="600" numsOfLine={1}>{name}</Typography>
      </Animated.View>
    </Pressable>
  </Animated.View>;
};

const CustomTabBar = ({state, descriptors, navigation}: BottomTabBarProps) => {
  const {width: screenWidth} = useWindowDimensions();
  const [pillWidth, setPillWidth] = useState(0);
  const position = useSharedValue(state.index);
  const availableWidth = pillWidth || screenWidth * (screenWidth < 360 ? 0.94 : 0.84);
  const activeWidth = Math.min(112, Math.max(0, availableWidth - 16 - 4 * 44));
  const inactiveWidth = Math.max(44, (availableWidth - 16 - activeWidth) / (state.routes.length - 1));

  useEffect(() => {
    position.value = withTiming(state.index, {duration: 190, easing: Easing.out(Easing.cubic)});
  }, [position, state.index]);

  return <SafeAreaView edges={['bottom']} style={styles.tabBar}>
    <View style={[styles.tabPill, screenWidth < 360 && styles.tabPillCompact]} onLayout={event => setPillWidth(event.nativeEvent.layout.width)}>
      {state.routes.map((route, index) => {
        const focused = state.index === index;
        const options = descriptors[route.key].options;
        const onPress = () => {
          const event = navigation.emit({type: 'tabPress', target: route.key, canPreventDefault: true});
          if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
        };
        return <TabButton
          key={route.key}
          name={route.name as keyof TabParamList}
          index={index}
          focused={focused}
          activeWidth={activeWidth}
          inactiveWidth={inactiveWidth}
          position={position}
          onPress={onPress}
          onLongPress={() => navigation.emit({type: 'tabLongPress', target: route.key})}
          accessibilityLabel={options.tabBarAccessibilityLabel ?? route.name}
        />;
      })}
    </View>
  </SafeAreaView>;
};

const renderTabBar = (props: BottomTabBarProps) => <CustomTabBar {...props} />;

const TabNavigation = () => (
  <Tab.Navigator
    initialRouteName="Home"
    tabBar={renderTabBar}
    screenOptions={{headerShown: false, animation: 'fade'}}>
    <Tab.Screen name="Home" component={HomeStack} />
    <Tab.Screen name="Nearby" component={Nearby} />
    <Tab.Screen name="Party" component={Party} />
    <Tab.Screen name="Messages" component={Messages} />
    <Tab.Screen name="Profile" component={Profile} />
  </Tab.Navigator>
);

export default TabNavigation;

const styles = StyleSheet.create({
  tabBar: {position: 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center', backgroundColor: Colors.transparent},
  tabPill: {width: '84%', height: 52, borderRadius: 38, borderWidth: 1, borderColor: Colors.borderMuted, backgroundColor: Colors.navBackground, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 7},
  tabPillCompact: {width: '94%'},
  tabSlot: {height: 46, justifyContent: 'center'},
  tabItem: {height: 46, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', paddingHorizontal: 5},
  activeTab: {position: 'absolute', left: 0, right: 0, top: 3, bottom: 3, borderRadius: 22, backgroundColor: Colors.primaryDark, borderWidth: 1, borderColor: Colors.primaryBorder},
  labelClip: {overflow: 'hidden', marginLeft: 3},
  pressed: {opacity: 0.7},
});
