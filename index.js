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

AppRegistry.registerHeadlessTask('HivaVibeNoteGeofenceEntry', () => async ({enteredNoteIds}) => {
  if (!Array.isArray(enteredNoteIds) || enteredNoteIds.length === 0) return;
  const {configureApiAuth} = require('./src/core/api/apiClient');
  const {clearStoredSession, loadSession, refreshOnce} = require('./src/features/auth');
  configureApiAuth({
    getAccessToken: async () => (await loadSession())?.accessToken ?? null,
    refreshAccessToken: async failedAccessToken => {
      const session = await loadSession();
      if (!session) throw {status: 401, message: 'Session expired.'};
      return (session.accessToken === failedAccessToken ? await refreshOnce(session) : session).accessToken;
    },
    onSessionInvalid: async failedAccessToken => {
      if ((await loadSession())?.accessToken === failedAccessToken) await clearStoredSession();
    },
  });
  const {NativeModules} = require('react-native');
  const {getDeviceLocation} = require('./src/features/nearby/deviceLocation');
  const {updateMyLocation} = require('./src/features/nearby/nearbyService');
  const fix = await getDeviceLocation(false);
  if (!fix) return;
  await updateMyLocation(fix.lat, fix.lng, {
    source: 'vibe_note_geofence',
    enteredNoteIds: enteredNoteIds.slice(0, 100),
    ...(fix.accuracyMeters === undefined ? {} : {accuracyMeters: fix.accuracyMeters}),
    ...(fix.observedAt === undefined ? {} : {observedAt: fix.observedAt}),
  });
  await NativeModules.VibeNoteGeofence?.clearPendingEntries?.();
});
