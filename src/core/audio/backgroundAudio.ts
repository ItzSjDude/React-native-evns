import {NativeModules, Platform} from 'react-native';
type BackgroundAudioModule = {start: (microphone: boolean) => Promise<void>; stop: () => Promise<void>};
const module = NativeModules.PartyBackgroundAudio as BackgroundAudioModule | undefined;
export async function startPartyAudioService(microphone: boolean) {
  if (Platform.OS === 'android') {
    if (!module) throw new Error('Background audio requires the updated Android build.');
    await module.start(microphone);
  }
}
export async function stopPartyAudioService() {
  if (Platform.OS === 'android') await module?.stop();
}
