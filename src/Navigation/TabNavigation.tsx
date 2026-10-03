import React, {useEffect, useRef, useState} from 'react';
import {Animated, Easing, Pressable, StyleSheet, View} from 'react-native';
import {createBottomTabNavigator, type BottomTabBarProps} from '@react-navigation/bottom-tabs';
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

const CustomTabBar = ({state, descriptors, navigation}: BottomTabBarProps) => {
  const [pillWidth, setPillWidth] = useState(0);
  const position = useRef(new Animated.Value(state.index)).current;
  const itemWidth = (pillWidth - 12) / state.routes.length;

  useEffect(() => {
    Animated.timing(position, {
      toValue: state.index,
      duration: 190,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [position, state.index]);

  return <SafeAreaView edges={['bottom']} style={styles.tabBar}>
    <View style={styles.tabPill} onLayout={event => setPillWidth(event.nativeEvent.layout.width)}>
      {pillWidth > 0 && <Animated.View pointerEvents="none" style={[styles.activeTab, {width: itemWidth, transform: [{translateX: Animated.multiply(position, itemWidth)}]}]} />}
      {state.routes.map((route, index) => {
        const focused = state.index === index;
        const options = descriptors[route.key].options;
        const label = options.tabBarAccessibilityLabel ?? route.name;
        const onPress = () => {
          const event = navigation.emit({type: 'tabPress', target: route.key, canPreventDefault: true});
          if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
        };
        const onLongPress = () => navigation.emit({type: 'tabLongPress', target: route.key});
        return <Pressable
          key={route.key}
          accessibilityRole="tab"
          accessibilityLabel={label}
          accessibilityState={{selected: focused}}
          onPress={onPress}
          onLongPress={onLongPress}
          style={({pressed}) => [styles.tabItem, pressed && styles.pressed]}>
          <AppIcon name={tabIcons[route.name as keyof TabParamList]} size={23} color={focused ? Colors.text : Colors.muted} />
          <Typography size={11} color={focused ? Colors.text : Colors.muted} fontWeight={focused ? '600' : '500'} numsOfLine={1} style={styles.tabLabel}>{route.name}</Typography>
        </Pressable>;
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
  tabPill: {width: '90%', maxWidth: 430, height: 60, borderRadius: 34, borderWidth: 1, borderColor: Colors.borderMuted, backgroundColor: Colors.navBackground, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6},
  activeTab: {position: 'absolute', left: 6, top: 5, bottom: 5, borderRadius: 26, backgroundColor: Colors.primaryDark, borderWidth: 1, borderColor: Colors.primaryBorder},
  tabItem: {flex: 1, height: 56, alignItems: 'center', justifyContent: 'center', gap: 2, zIndex: 1},
  tabLabel: {textAlign: 'center'},
  pressed: {opacity: 0.7},
});
