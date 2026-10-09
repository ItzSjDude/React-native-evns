import {VideoPresets43, type RoomOptions} from 'livekit-client';
import {PARTY_AUDIO_ROOM_OPTIONS} from '../audioConfig';

/**
 * Video party defaults. The backend cannot see capture settings, so cost control lives here:
 * capture is capped at 480p (640x480), 24 fps and ~500 kb/s, and the camera is never published on
 * join (the room is connected with video={false}; speakers turn it on themselves).
 */
export const PARTY_VIDEO_ROOM_OPTIONS: RoomOptions = {
  ...PARTY_AUDIO_ROOM_OPTIONS,
  videoCaptureDefaults: {resolution: VideoPresets43.h480.resolution, facingMode: 'user'},
  publishDefaults: {
    ...PARTY_AUDIO_ROOM_OPTIONS.publishDefaults,
    videoEncoding: {maxBitrate: 500_000, maxFramerate: 24},
    simulcast: false,
  },
};

export const roomOptionsFor = (kind: 'AUDIO' | 'VIDEO' | undefined): RoomOptions =>
  kind === 'VIDEO' ? PARTY_VIDEO_ROOM_OPTIONS : PARTY_AUDIO_ROOM_OPTIONS;
