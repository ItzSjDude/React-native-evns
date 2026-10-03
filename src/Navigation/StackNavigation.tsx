import React from 'react';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import {LoginScreen, OnboardingScreen} from '../features/auth';
import {HomeScreen} from '../features/home';
import {NearbyScreen} from '../features/nearby';
import {PartyScreen} from '../features/party';
import {MessagesScreen} from '../features/messages';
import {ProfileScreen} from '../features/profile';

export type AuthStackParamList = {
  Login: undefined;
  Onboarding: undefined;
};

export type HomeStackParamList = {
  Home: undefined;
};

export type NearbyStackParamList = {
  Nearby: undefined;
};

export type PartyStackParamList = {
  Party: undefined;
};

export type MessagesStackParamList = {
  Messages: undefined;
};

export type ProfileStackParamList = {
  Profile: undefined;
};

const AuthStackNavigator = createNativeStackNavigator<AuthStackParamList>();
const HomeStackNavigator = createNativeStackNavigator<HomeStackParamList>();
const NearbyStackNavigator =
  createNativeStackNavigator<NearbyStackParamList>();
const PartyStackNavigator =
  createNativeStackNavigator<PartyStackParamList>();
const MessagesStackNavigator =
  createNativeStackNavigator<MessagesStackParamList>();
const ProfileStackNavigator =
  createNativeStackNavigator<ProfileStackParamList>();

export const AuthStack = ({initialRouteName = 'Login'}: {initialRouteName?: keyof AuthStackParamList}) => (
  <AuthStackNavigator.Navigator
    initialRouteName={initialRouteName}
    screenOptions={{headerShown: false}}>
    <AuthStackNavigator.Screen name="Login" component={LoginScreen} />
    <AuthStackNavigator.Screen name="Onboarding" component={OnboardingScreen} />
  </AuthStackNavigator.Navigator>
);

export const HomeStack = () => (
  <HomeStackNavigator.Navigator screenOptions={{headerShown: false}}>
    <HomeStackNavigator.Screen name="Home" component={HomeScreen} />
  </HomeStackNavigator.Navigator>
);

export const Nearby = () => (
  <NearbyStackNavigator.Navigator screenOptions={{headerShown: false}}>
    <NearbyStackNavigator.Screen name="Nearby" component={NearbyScreen} />
  </NearbyStackNavigator.Navigator>
);

export const Party = () => (
  <PartyStackNavigator.Navigator screenOptions={{headerShown: false}}>
    <PartyStackNavigator.Screen name="Party" component={PartyScreen} />
  </PartyStackNavigator.Navigator>
);

export const Messages = () => (
  <MessagesStackNavigator.Navigator screenOptions={{headerShown: false}}>
    <MessagesStackNavigator.Screen
      name="Messages"
      component={MessagesScreen}
    />
  </MessagesStackNavigator.Navigator>
);

export const Profile = () => (
  <ProfileStackNavigator.Navigator screenOptions={{headerShown: false}}>
    <ProfileStackNavigator.Screen name="Profile" component={ProfileScreen} />
  </ProfileStackNavigator.Navigator>
);
