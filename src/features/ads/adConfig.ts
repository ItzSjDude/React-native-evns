import {Platform} from 'react-native';
import {TestIds} from 'react-native-google-mobile-ads';

// Production inventory stays off until Hiva's AdMob native ad unit IDs are configured.
const adsConfig = (require('../../../app.json') as {['react-native-google-mobile-ads']?: {android_native_ad_unit_id?: string; ios_native_ad_unit_id?: string}})['react-native-google-mobile-ads'];
export const NATIVE_AD_UNIT_ID = __DEV__ ? TestIds.NATIVE : Platform.select({android: adsConfig?.android_native_ad_unit_id, ios: adsConfig?.ios_native_ad_unit_id}) ?? '';
