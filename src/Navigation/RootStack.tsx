import React from 'react';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import {MyTicketsScreen, type MyTicketsParams} from '../features/events';
import TabNavigation from './TabNavigation';

export type RootStackParamList = {
  Tabs: undefined;
  MyTickets: MyTicketsParams;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

/** Signed-in root: the tabs, with full-screen routes (e.g. My tickets) pushed over them. */
const RootStack = () => (
  <Stack.Navigator initialRouteName="Tabs" screenOptions={{headerShown: false}}>
    <Stack.Screen name="Tabs" component={TabNavigation} />
    <Stack.Screen name="MyTickets" component={MyTicketsScreen} />
  </Stack.Navigator>
);

export default RootStack;
