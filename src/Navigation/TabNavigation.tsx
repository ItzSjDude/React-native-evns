import React from 'react';
import {Pressable, StyleSheet, View} from 'react-native';
import {createBottomTabNavigator} from '@react-navigation/bottom-tabs';
import {SafeAreaView} from 'react-native-safe-area-context';
import {HomeStack, Nearby, Party, Messages, Profile} from './StackNavigation';
import {Colors} from '../Constants/Colors';
import AppIcon from '../Constants/Icons';
import Typography from '../Constants/Typography';

export type TabParamList = {
  Home: undefined;
  Nearby: undefined;
  Party: undefined;
  Messages: undefined;
  Profile: undefined;
};

const Tab = createBottomTabNavigator<TabParamList>();

const CustomTabBar = ({state, navigation}: any) => {
  return <SafeAreaView edges={['bottom']} style={styles.tabBar}>
    <View style={styles.tabPill}>
      {state.routes.map((route: any, index: number) => {
        const focused = state.index === index;
        const onPress = () => navigation.navigate(route.name);
        return <Pressable accessibilityRole="button" accessibilityState={{selected: focused}} key={route.key} onPress={onPress} style={[styles.tabItem, focused && styles.activeTab]}>
          <AppIcon name={route.name.toLowerCase() as 'home' | 'nearby' | 'party' | 'messages' | 'profile'} color={focused ? Colors.text : Colors.muted} />
          {focused && <Typography size={14} color={Colors.text} fontWeight="600" style={styles.activeLabel}>{route.name}</Typography>}
        </Pressable>;
      })}
    </View>
  </SafeAreaView>;
};

const TabNavigation = () => (
  <Tab.Navigator
    initialRouteName="Home"
    tabBar={CustomTabBar}
    screenOptions={() => ({
      headerShown: false,
    })}>
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
  tabPill: {width: '84%', height: 50, borderRadius: 38, borderWidth: 1, borderColor: Colors.borderMuted, backgroundColor: Colors.navBackground, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', paddingHorizontal: 7},
  tabItem: {height: 36, minWidth: 53, borderRadius: 29, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', paddingHorizontal: 6},
  activeTab: {backgroundColor: Colors.primaryDark, borderWidth: 1, borderColor: Colors.primaryBorder, shadowColor: Colors.primary, shadowOpacity: 0.7, shadowRadius: 9, shadowOffset: {width: 0, height: 0}, elevation: 7},
  activeLabel: {marginLeft: 4},
});
