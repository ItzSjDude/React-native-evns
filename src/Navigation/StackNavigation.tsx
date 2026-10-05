import React from 'react';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import {LoginScreen, OnboardingScreen} from '../features/auth';
import TabNavigation from './TabNavigation';
import {NotificationsScreen} from '../features/notifications';

export type AuthStackParamList = {
  Login: undefined;
  Onboarding: undefined;
};

const AuthStackNavigator = createNativeStackNavigator<AuthStackParamList>();

export const AuthStack = ({initialRouteName = 'Login'}: {initialRouteName?: keyof AuthStackParamList}) => (
  <AuthStackNavigator.Navigator
    initialRouteName={initialRouteName}
    screenOptions={{headerShown: false}}>
    <AuthStackNavigator.Screen name="Login" component={LoginScreen} />
    <AuthStackNavigator.Screen name="Onboarding" component={OnboardingScreen} />
  </AuthStackNavigator.Navigator>
);

export type AppStackParamList = {
  Tabs: undefined;
  Notifications: undefined;
};

const AppStackNavigator = createNativeStackNavigator<AppStackParamList>();

export const AppStack = () => (
  <AppStackNavigator.Navigator screenOptions={{headerShown: false}}>
    <AppStackNavigator.Screen name="Tabs" component={TabNavigation} />
    <AppStackNavigator.Screen name="Notifications" component={NotificationsScreen} />
  </AppStackNavigator.Navigator>
);
