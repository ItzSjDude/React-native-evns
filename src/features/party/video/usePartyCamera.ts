import {useCallback, useEffect, useRef, useState} from 'react';
import {Alert, AppState, Linking, PermissionsAndroid, Platform} from 'react-native';
import {Track, type LocalParticipant, type LocalVideoTrack} from 'livekit-client';
import {setPartyState} from '../partyService';

const denied = (cause: unknown) => /notallowed|permission|denied/i.test(`${(cause as Error)?.name} ${(cause as Error)?.message}`);
const showDenied = () => Alert.alert('Camera access needed', 'Allow camera access in Settings to turn on your video.', [
  {text: 'Cancel', style: 'cancel'}, {text: 'Open Settings', onPress: () => {Linking.openSettings().catch(() => {});}},
]);

/**
 * Camera control for a video party. The camera is off by default and is only ever on while the
 * user is seated, the room is expanded and the app is in the foreground; every other state
 * (step-down, move to audience, minimize, background, unmount) releases the capture device.
 */
export function usePartyCamera(args: {
  partyId: string; participant: LocalParticipant; enabled: boolean; /** Video party and seated. */ canPublish: boolean;
  /** Room is expanded on screen. */ visible: boolean; refresh: () => Promise<unknown>;
  onError: (message: string) => void; onPaused: (message: string) => void;
}) {
  const {partyId, participant, enabled, canPublish, visible, refresh, onError, onPaused} = args;
  const [pending, setPending] = useState(false);
  const [foreground, setForeground] = useState(AppState.currentState !== 'background' && AppState.currentState !== 'inactive');
  const generation = useRef(0);
  const mounted = useRef(true);
  const facing = useRef<'user' | 'environment'>('user');
  const [mirrored, setMirrored] = useState(true);
  const enabledRef = useRef(enabled); enabledRef.current = enabled;
  const callbacks = useRef({onError, onPaused}); callbacks.current = {onError, onPaused};
  const participantRef = useRef(participant); participantRef.current = participant;
  useEffect(() => {
    const listener = AppState.addEventListener('change', state => setForeground(state === 'active'));
    return () => listener.remove();
  }, []);
  // Release the camera whenever the unmount path is taken (leave, room ended, disconnect).
  useEffect(() => () => {
    mounted.current = false; generation.current++;
    if (enabledRef.current) participantRef.current.setCameraEnabled?.(false)?.catch?.(() => {});
  }, []);

  const allowed = canPublish && visible && foreground;
  useEffect(() => {
    if (allowed) return;
    generation.current++;
    setPending(false);
    if (!enabledRef.current) return;
    participantRef.current.setCameraEnabled(false).catch(() => callbacks.current.onError('Could not stop the camera. Disconnect the room.'));
    if (canPublish) {
      setPartyState(partyId, {videoEnabled: false}).then(refresh).catch(() => {});
      callbacks.current.onPaused('Camera turned off. Tap the camera button to turn it back on.');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowed, canPublish, partyId]);

  const toggle = useCallback(async () => {
    const turn = ++generation.current;
    if (enabled || pending) {
      setPending(false);
      try {await participant.setCameraEnabled(false);} catch {onError('Could not turn the camera off. Disconnect the room.'); return;}
      setPartyState(partyId, {videoEnabled: false}).then(refresh).catch(() => onError('Camera is off on this device. Room status will sync when the connection returns.'));
      return;
    }
    if (!allowed) return;
    setPending(true);
    try {
      if (Platform.OS === 'android' && !await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.CAMERA)) {
        const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CAMERA);
        if (result !== PermissionsAndroid.RESULTS.GRANTED) {showDenied(); return;}
      }
      await setPartyState(partyId, {videoEnabled: true});
      if (turn !== generation.current || !mounted.current) return;
      await participant.setCameraEnabled(true);
      if (turn !== generation.current || !mounted.current) {await participant.setCameraEnabled(false); return;}
      facing.current = 'user'; setMirrored(true);
      await refresh();
    } catch (cause) {
      await participant.setCameraEnabled(false).catch(() => {});
      setPartyState(partyId, {videoEnabled: false}).catch(() => {});
      if (!mounted.current) return;
      if (denied(cause)) showDenied(); else onError((cause as Error)?.message || 'Could not turn on the camera.');
    } finally {if (mounted.current && turn === generation.current) setPending(false);}
  }, [allowed, enabled, onError, participant, partyId, pending, refresh]);

  const switchCamera = useCallback(async () => {
    const track = participant.getTrackPublication(Track.Source.Camera)?.videoTrack as LocalVideoTrack | undefined;
    if (!track) return;
    const next = facing.current === 'user' ? 'environment' : 'user';
    try {
      const native = track.mediaStreamTrack as unknown as {_switchCamera?: () => void};
      if (native._switchCamera) native._switchCamera(); else await track.restartTrack({facingMode: next});
      facing.current = next; setMirrored(next === 'user');
    } catch {onError('Could not switch cameras.');}
  }, [onError, participant]);

  return {toggle, switchCamera, pending, mirrored};
}
