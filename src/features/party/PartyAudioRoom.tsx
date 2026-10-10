import React, { useContext, useEffect, useRef, useState } from 'react';
import { Alert, Modal, Platform, Pressable, Text, View } from 'react-native';
import { SafeAreaView, SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { AudioSession, AndroidAudioTypePresets, LiveKitRoom } from '@livekit/react-native';
import { loadSession } from '../auth';
import AudioRoomStage from './AudioRoomStage';
import { roomOptionsFor } from './video/videoConfig';
import { roomTitle } from './partyPresentation';
import { endParty, leaveParty, type JoinedParty } from './partyService';
import { startPartyAudioService, stopPartyAudioService } from '../../core/audio/backgroundAudio';
export default function PartyAudioRoom({ session, onClose, expanded, onMinimize, onExpand, leaveRequest }: {
  session: JoinedParty; onClose: () => void; expanded: boolean; onMinimize: () => void; onExpand: () => void;
  leaveRequest?: React.MutableRefObject<(() => void) | null>;
}) {
  const insets = useContext(SafeAreaInsetsContext) ?? { top: 0, right: 0, bottom: 0, left: 0 };
  const [audioReady, setAudioReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [host, setHost] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [closing, setClosing] = useState(false);
  const closeRequest = useRef<(() => void) | null>(null);
  const onCloseRef = useRef(onClose); onCloseRef.current = onClose;
  useEffect(() => {
    let mounted = true;
    loadSession().then(stored => { if (mounted) setHost((session.party.hostId || session.party.host?.id) === stored?.user.id); }).catch(() => { });
    const timer = setTimeout(() => { if (mounted) setError('Audio setup took too long. Retry or close the room.'); }, 15000);
    (async () => {
      try {
        if (Platform.OS === 'android') await AudioSession.configureAudio({ android: { audioTypeOptions: AndroidAudioTypePresets.communication } });
        await AudioSession.startAudioSession();
        if (!mounted) { await AudioSession.stopAudioSession(); return; }
        await startPartyAudioService(false);
        if (mounted) { clearTimeout(timer); setError(null); setAudioReady(true); }
      } catch { if (mounted) { clearTimeout(timer); setError('Could not start device audio. Retry or close the room.'); } }
    })();
    return () => { mounted = false; clearTimeout(timer); stopPartyAudioService().catch(() => { }); AudioSession.stopAudioSession().catch(() => { }); };
  }, [attempt, session.party.hostId, session.party.host?.id]);
  const requestClose = () => {
    if (closeRequest.current) { closeRequest.current(); return; }
    Alert.alert(host ? 'End party for everyone?' : 'Leave party?', host ? 'This closes the room for everyone.' : 'You can join again later.', [
      { text: 'Stay', style: 'cancel' },
      {
        text: host ? 'End party' : 'Leave', style: 'destructive', onPress: async () => {
          setClosing(true);
          try { await (host ? endParty(session.party.id) : leaveParty(session.party.id)); onCloseRef.current(); }
          catch { setError('Could not update the room. Retry, or disconnect from this device.'); }
          finally { setClosing(false); }
        }
      },
      { text: 'Disconnect this device', onPress: () => onCloseRef.current() },
    ]);
  };
  const requestCloseRef = useRef(requestClose); requestCloseRef.current = requestClose;
  useEffect(() => {
    if (!leaveRequest) return;
    leaveRequest.current = () => requestCloseRef.current();
    return () => { leaveRequest.current = null; };
  }, [leaveRequest]);
  if (!audioReady && !expanded) return <View
    style={{ bottom: insets.bottom + 76 }}
    className="absolute left-4 right-4 flex-row items-center gap-2 rounded-[22px] border border-border bg-card py-2 pl-4 pr-1"
  >
    <Pressable accessibilityRole="button" accessibilityLabel={`Return to ${session.party.kind === 'VIDEO' ? 'video' : 'audio'} party`} onPress={onExpand} className="min-h-11 min-w-0 flex-1 justify-center active:opacity-70">
      <Text numberOfLines={1} className="text-sm font-semibold text-foreground">{roomTitle(session.party)}</Text>
      <Text accessibilityRole={error ? 'alert' : undefined} numberOfLines={1} className="mt-0.5 text-xs text-muted">{error ? 'Audio problem · Open to retry' : 'Preparing audio…'}</Text>
    </Pressable>
  </View>;
  if (!audioReady) return <Modal visible animationType="slide" presentationStyle="fullScreen" onRequestClose={requestClose}>
    <SafeAreaView className="flex-1 items-center justify-center bg-background px-8">
      <Text accessibilityRole={error ? 'alert' : undefined} className="text-center text-sm text-foreground">{error || 'Preparing audio…'}</Text>
      {!!error && <Pressable accessibilityRole="button" disabled={closing} onPress={() => { setError(null); setAttempt(value => value + 1); }} className="mt-6 h-11 justify-center rounded-full bg-gold px-6"><Text className="font-semibold text-text-dark">Retry audio</Text></Pressable>}
      <Pressable accessibilityRole="button" disabled={closing} onPress={requestClose} className="mt-4 h-11 justify-center rounded-full bg-card px-6"><Text className="text-foreground">Close room</Text></Pressable>
    </SafeAreaView>
  </Modal>;
  return <LiveKitRoom serverUrl={session.media.url} token={session.media.token} connect audio={false} video={false}
    options={roomOptionsFor(session.party.kind)} onConnected={() => setError(null)} onError={cause => setError(cause.message || 'Audio connection failed.')}>
    <AudioRoomStage session={session} onClose={onClose} closeRequest={closeRequest} connectionError={error} expanded={expanded} onMinimize={onMinimize} onExpand={onExpand} />
  </LiveKitRoom>;
}
