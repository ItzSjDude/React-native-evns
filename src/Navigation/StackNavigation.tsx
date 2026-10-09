import React from 'react';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import {ConfirmAgeScreen, LoginScreen, OnboardingScreen, UnderageScreen} from '../features/auth';

export type AuthStackParamList = {
  Login: undefined;
  Onboarding: undefined;
  ConfirmAge: undefined;
  Underage: undefined;
};

const AuthStackNavigator = createNativeStackNavigator<AuthStackParamList>();

export const AuthStack = ({initialRouteName = 'Login'}: {initialRouteName?: keyof AuthStackParamList}) => (
  <AuthStackNavigator.Navigator
    initialRouteName={initialRouteName}
    screenOptions={{headerShown: false}}>
    <AuthStackNavigator.Screen name="Login" component={LoginScreen} />
    <AuthStackNavigator.Screen name="Onboarding" component={OnboardingScreen} />
    <AuthStackNavigator.Screen name="ConfirmAge" component={ConfirmAgeScreen} options={{gestureEnabled: false}} />
    <AuthStackNavigator.Screen name="Underage" component={UnderageScreen} options={{gestureEnabled: false}} />
  </AuthStackNavigator.Navigator>
);
