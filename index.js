/**
 * @format
 */

import { AppRegistry } from 'react-native';
import { registerGlobals } from '@livekit/react-native';
import './global.css';
import { name as appName } from './app.json';

registerGlobals();

const App = require('./App').default;
AppRegistry.registerComponent(appName, () => App);
