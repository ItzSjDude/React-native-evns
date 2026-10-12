import type {RoomOptions} from 'livekit-client';

/**
 * Voice-room defaults. The encoder cap is lower than LiveKit's 48 kb/s music
 * default, with headroom above its 24 kb/s speech preset for clear voices.
 * RTP/transport headers and RED add overhead: this is not a wire-rate limit.
 */
export const PARTY_AUDIO_ROOM_OPTIONS: RoomOptions = {
  adaptiveStream: true,
  dynacast: true,
  audioCaptureDefaults: {
    channelCount: 1,
    autoGainControl: true,
    echoCancellation: true,
    noiseSuppression: true,
  },
  publishDefaults: {
    audioPreset: {maxBitrate: 32_000},
    forceStereo: false,
    // Send fewer audio packets during silence, without adding speech latency.
    dtx: true,
    // Retain packet-loss recovery for mobile networks, despite its overhead.
    red: true,
    // Avoid repeated microphone capture and Bluetooth route changes on mute.
    stopMicTrackOnMute: false,
  },
};
