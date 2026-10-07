import React, {useEffect, useState} from 'react';
import {PermissionsAndroid, Platform, Text, View} from 'react-native';
import {AudioSession} from '@livekit/react-native';
import IconVolume from '@tabler/icons-react-native/IconVolume';
import IconEar from '@tabler/icons-react-native/IconEar';
import IconHeadphones from '@tabler/icons-react-native/IconHeadphones';
import IconBluetooth from '@tabler/icons-react-native/IconBluetooth';
import IconDeviceMobile from '@tabler/icons-react-native/IconDeviceMobile';
import IconCheck from '@tabler/icons-react-native/IconCheck';
import BottomSheet, {SheetRow, SheetSection} from '../../components/BottomSheet';
import {PartyColors} from './partyPresentation';

const outputs: Record<string, {label: string; icon: typeof IconVolume}> = {
  speaker: {label: 'Speaker', icon: IconVolume},
  force_speaker: {label: 'Speaker', icon: IconVolume},
  earpiece: {label: 'Phone earpiece', icon: IconEar},
  headset: {label: 'Wired headphones', icon: IconHeadphones},
  bluetooth: {label: 'Bluetooth', icon: IconBluetooth},
  default: {label: 'Automatic', icon: IconDeviceMobile},
};

export default function AudioOutputSheet({visible, onClose}: {visible: boolean; onClose: () => void}) {
  const [available, setAvailable] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!visible) return;
    let mounted = true;
    const load = () => AudioSession.getAudioOutputs().then(next => {if (mounted) setAvailable(next);}).catch(() => {if (mounted) setError('Could not list audio devices.');});
    setError(null); load(); const timer = setInterval(load, 2000);
    return () => {mounted = false; clearInterval(timer);};
  }, [visible]);
  const select = async (output: string) => {
    setBusy(true); setError(null);
    try {
      if (output === 'bluetooth' && Platform.OS === 'android' && Number(Platform.Version) >= 31) {
        const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT);
        if (result !== PermissionsAndroid.RESULTS.GRANTED) throw new Error('Allow nearby device access to use Bluetooth.');
      }
      await AudioSession.selectAudioOutput(output); setSelected(output); onClose();
    } catch (cause) {setError((cause as Error).message || 'Could not switch audio device.');}
    finally {setBusy(false);}
  };
  return <BottomSheet visible={visible} onClose={onClose} title="Audio output" subtitle="Choose where you hear the room.">
    {!!error && <View className="mb-3 rounded-xl bg-coral/10 px-3 py-2"><Text accessibilityRole="alert" className="text-[13px] text-coral">{error}</Text></View>}
    <SheetSection>
      {available.map(output => {
        const item = outputs[output] || {label: output, icon: IconVolume};
        return <SheetRow key={output} icon={item.icon} label={item.label} disabled={busy} onPress={() => select(output)}
          accessibilityLabel={`${item.label}${selected === output ? ', selected' : ''}`}
          accessory={selected === output ? <IconCheck size={20} color={PartyColors.accent} /> : undefined} />;
      })}
      {Platform.OS === 'ios' && <SheetRow icon={IconBluetooth} label="Bluetooth / AirPlay" description="Open the system device picker" disabled={busy} chevron
        onPress={() => AudioSession.showAudioRoutePicker().catch(() => setError('Could not open device picker.'))} />}
    </SheetSection>
    {!available.length && Platform.OS !== 'ios' && <Text className="py-2 text-center text-[13px] text-muted">Looking for devices…</Text>}
  </BottomSheet>;
}
