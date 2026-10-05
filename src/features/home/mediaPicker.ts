import {PermissionsAndroid, Platform} from 'react-native';
import {launchCamera, launchImageLibrary, type ImagePickerResponse, type CameraOptions, type ImageLibraryOptions} from 'react-native-image-picker';
import type {SelectedPostImage} from './types';

const pickerOptions: ImageLibraryOptions & CameraOptions = {
  mediaType: 'photo',
  selectionLimit: 1,
  quality: 0.8,
};

const getImageFromResponse = (response: ImagePickerResponse): SelectedPostImage | null => {
  if (response.didCancel) return null;
  if (response.errorCode) {
    throw new Error(response.errorMessage ?? 'Could not select an image.');
  }

  const asset = response.assets?.[0];
  if (!asset?.uri) throw new Error('The selected image could not be read.');

  return {
    uri: asset.uri,
    type: asset.type ?? 'image/jpeg',
    fileName: asset.fileName,
  };
};

const ensureCameraPermission = async (): Promise<void> => {
  if (Platform.OS !== 'android') return;

  const permission = PermissionsAndroid.PERMISSIONS.CAMERA;
  if (await PermissionsAndroid.check(permission)) return;

  const result = await PermissionsAndroid.request(permission);
  if (result === PermissionsAndroid.RESULTS.GRANTED) return;

  throw new Error(
    result === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN
      ? 'Camera permission is blocked. Enable it in Settings to take a photo.'
      : 'Camera permission is required to take a photo.',
  );
};

export const pickPostImage = async (source: 'camera' | 'gallery'): Promise<SelectedPostImage | null> => {
  if (source === 'camera') await ensureCameraPermission();

  const response = source === 'camera'
    ? await launchCamera({...pickerOptions, saveToPhotos: false})
    : await launchImageLibrary(pickerOptions);

  return getImageFromResponse(response);
};
