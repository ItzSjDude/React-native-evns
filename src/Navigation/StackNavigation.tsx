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
  HomeScreen: undefined;
};

export type NearbyStackParamList = {
  NearbyScreen: undefined;
};

export type PartyStackParamList = {
  PartyScreen: undefined;
};

export type MessagesStackParamList = {
  MessagesScreen: undefined;
};

export type ProfileStackParamList = {
  ProfileScreen: undefined;
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
    <HomeStackNavigator.Screen name="HomeScreen" component={HomeScreen} />
  </HomeStackNavigator.Navigator>
);

export const Nearby = () => (
  <NearbyStackNavigator.Navigator screenOptions={{headerShown: false}}>
    <NearbyStackNavigator.Screen name="NearbyScreen" component={NearbyScreen} />
  </NearbyStackNavigator.Navigator>
);

export const Party = () => (
  <PartyStackNavigator.Navigator screenOptions={{headerShown: false}}>
    <PartyStackNavigator.Screen name="PartyScreen" component={PartyScreen} />
  </PartyStackNavigator.Navigator>
);

export const Messages = () => (
  <MessagesStackNavigator.Navigator screenOptions={{headerShown: false}}>
    <MessagesStackNavigator.Screen
      name="MessagesScreen"
      component={MessagesScreen}
    />
  </MessagesStackNavigator.Navigator>
);

export const Profile = () => (
  <ProfileStackNavigator.Navigator screenOptions={{headerShown: false}}>
    <ProfileStackNavigator.Screen name="ProfileScreen" component={ProfileScreen} />
  </ProfileStackNavigator.Navigator>
);
