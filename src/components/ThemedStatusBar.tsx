import React from 'react';
import {StatusBar, useColorScheme} from 'react-native';

/** Light icons on the dark theme, dark icons on the light theme. */
export default function ThemedStatusBar() {
  return <StatusBar barStyle={useColorScheme() === 'light' ? 'dark-content' : 'light-content'} />;
}
