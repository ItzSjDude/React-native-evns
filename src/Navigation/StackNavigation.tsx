import React from 'react';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import {LoginScreen, OnboardingScreen} from '../features/auth';

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
