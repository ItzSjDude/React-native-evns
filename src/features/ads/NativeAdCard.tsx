import React, {useEffect, useState} from 'react';
import {Image, Text, View} from 'react-native';
import {NativeAd, NativeAdView, NativeAsset, NativeAssetType, NativeMediaView} from 'react-native-google-mobile-ads';
import {Colors} from '../../Constants/Colors';
import {useAds} from './AdsProvider';
import {NATIVE_AD_UNIT_ID} from './adConfig';

export default function NativeAdCard() {
  const {ready} = useAds();
  const [ad, setAd] = useState<NativeAd | null>(null);

  useEffect(() => {
    if (!ready || !NATIVE_AD_UNIT_ID) return;
    let mounted = true;
    let loaded: NativeAd | null = null;
    NativeAd.createForAdRequest(NATIVE_AD_UNIT_ID)
      .then(value => {
        loaded = value;
        if (mounted) setAd(value);
        else value.destroy();
      })
      .catch(() => {});
    return () => {
      mounted = false;
      loaded?.destroy();
    };
  }, [ready]);

  if (!ad) return null;
  return <NativeAdView nativeAd={ad} style={{marginVertical: 12, borderRadius: 18, overflow: 'hidden', backgroundColor: Colors.card, borderColor: Colors.border, borderWidth: 1}}>
    <View style={{padding: 14}}>
      <Text accessibilityLabel="Advertisement" style={{color: Colors.muted, fontSize: 11, fontWeight: '700', letterSpacing: 0.4, marginBottom: 8}}>SPONSORED</Text>
      <NativeAsset assetType={NativeAssetType.HEADLINE}><Text numberOfLines={2} style={{color: Colors.text, fontSize: 16, fontWeight: '700'}}>{ad.headline}</Text></NativeAsset>
      {ad.mediaContent && <NativeMediaView resizeMode="cover" style={{width: '100%', aspectRatio: 16 / 9, marginTop: 10, borderRadius: 12, overflow: 'hidden'}} />}
      {!!ad.body && <NativeAsset assetType={NativeAssetType.BODY}><Text numberOfLines={3} style={{color: Colors.muted, fontSize: 13, lineHeight: 19, marginTop: 8}}>{ad.body}</Text></NativeAsset>}
      <View style={{flexDirection: 'row', alignItems: 'center', marginTop: 12}}>
        {ad.icon?.url ? <NativeAsset assetType={NativeAssetType.ICON}><Image source={{uri: ad.icon.url}} style={{width: 36, height: 36, borderRadius: 8, marginRight: 10}} /></NativeAsset> : null}
        <NativeAsset assetType={NativeAssetType.ADVERTISER}><Text numberOfLines={1} style={{flex: 1, color: Colors.text, fontSize: 12, fontWeight: '600'}}>{ad.advertiser ?? 'Sponsored'}</Text></NativeAsset>
        {!!ad.callToAction && <NativeAsset assetType={NativeAssetType.CALL_TO_ACTION}><Text style={{color: Colors.textDark, backgroundColor: Colors.gold, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 9, overflow: 'hidden', fontSize: 12, fontWeight: '700'}}>{ad.callToAction}</Text></NativeAsset>}
      </View>
    </View>
  </NativeAdView>;
}
