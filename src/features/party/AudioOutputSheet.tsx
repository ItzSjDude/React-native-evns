import React, {useEffect, useState} from 'react';
import {Modal, PermissionsAndroid, Platform, Pressable, Text, View} from 'react-native';
import {AudioSession} from '@livekit/react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
const labels: Record<string,string>={speaker:'Speaker',earpiece:'Earpiece',headset:'Wired headphones',bluetooth:'Bluetooth',default:'Automatic / headphones',force_speaker:'Speaker'};
export default function AudioOutputSheet({visible,onClose}: {visible: boolean; onClose: () => void}) {
  const [outputs,setOutputs]=useState<string[]>([]);
  const [error,setError]=useState<string | null>(null);
  const [busy,setBusy]=useState(false);
  useEffect(()=>{
    if(!visible)return;
    let mounted=true;
    const load=()=>AudioSession.getAudioOutputs().then(next=>{if(mounted)setOutputs(next);}).catch(()=>{if(mounted)setError('Could not list audio devices.');});
    setError(null);load();const timer=setInterval(load,2000);
    return()=>{mounted=false;clearInterval(timer);};
  },[visible]);
  const select=async(output: string)=>{
    setBusy(true);setError(null);
    try {
      if(output==='bluetooth' && Platform.OS==='android' && Number(Platform.Version)>=31) {
        const result=await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT);
        if(result!==PermissionsAndroid.RESULTS.GRANTED)throw new Error('Allow nearby device access to use Bluetooth.');
      }
      await AudioSession.selectAudioOutput(output);onClose();
    } catch(cause){setError((cause as Error).message || 'Could not switch audio device.');}
    finally{setBusy(false);}
  };
  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
    <View className="flex-1 justify-end bg-black/65"><Pressable accessibilityLabel="Dismiss audio devices" onPress={onClose} className="flex-1" />
      <SafeAreaView edges={['bottom']} className="rounded-t-[28px] bg-card px-5 py-4">
        <Text className="mb-3 text-lg font-bold text-foreground">Audio output</Text>
        {!!error && <Text accessibilityRole="alert" className="mb-3 text-sm text-coral">{error}</Text>}
        {outputs.map(output=><Pressable key={output} accessibilityRole="button" disabled={busy} onPress={()=>select(output)} className="min-h-12 justify-center"><Text className="text-base text-foreground">{labels[output] || output}</Text></Pressable>)}
        {Platform.OS==='ios' && <Pressable accessibilityRole="button" disabled={busy} onPress={()=>AudioSession.showAudioRoutePicker().catch(()=>setError('Could not open device picker.'))} className="min-h-12 justify-center"><Text className="text-base text-primary">Bluetooth / AirPlay devices</Text></Pressable>}
        <Pressable accessibilityRole="button" onPress={onClose} className="h-11 items-center justify-center"><Text className="text-muted">Done</Text></Pressable>
      </SafeAreaView>
    </View>
  </Modal>;
}
