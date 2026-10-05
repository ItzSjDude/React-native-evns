import {
  PermissionsAndroid,
  Platform,
} from 'react-native';
import {
  launchCamera,
  launchImageLibrary,
  type ImagePickerResponse,
  type CameraOptions,
  type ImageLibraryOptions,
} from 'react-native-image-picker';
import type {SelectedPostImage} from './types';

const pickerOptions: ImageLibraryOptions & CameraOptions = {
  mediaType: 'photo',
  quality: 0.8,
};

const getImagesFromResponse = (
  response: ImagePickerResponse,
): SelectedPostImage[] => {
  if (response.didCancel) return [];

  if (response.errorCode) {
    throw new Error(
      response.errorMessage ?? 'Could not select an image.',
    );
  }

  const images = (response.assets ?? [])
    .filter(asset => Boolean(asset.uri))
    .map(asset => ({
      uri: asset.uri as string,
      type: asset.type ?? 'image/jpeg',
      fileName: asset.fileName,
    }));

  if (images.length === 0) {
    throw new Error('The selected image could not be read.');
  }

  return images;
};

const ensureCameraPermission = async (): Promise<void> => {
  if (Platform.OS !== 'android') return;

  const permission = PermissionsAndroid.PERMISSIONS.CAMERA;

  if (await PermissionsAndroid.check(permission)) {
    return;
  }

  const result = await PermissionsAndroid.request(permission);

  if (result === PermissionsAndroid.RESULTS.GRANTED) {
    return;
  }

  throw new Error(
    result === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN
      ? 'Camera permission is blocked. Enable it in Settings to take a photo.'
      : 'Camera permission is required to take a photo.',
  );
};

const ensureGalleryPermission = async (): Promise<void> => {
  if (Platform.OS !== 'android') return;

  // Android 13+
  if (Platform.Version >= 33) {
    const permission =
      PermissionsAndroid.PERMISSIONS.READ_MEDIA_IMAGES;

    if (await PermissionsAndroid.check(permission)) {
      return;
    }

    const result = await PermissionsAndroid.request(permission);

    if (result === PermissionsAndroid.RESULTS.GRANTED) {
      return;
    }

    throw new Error(
      result === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN
        ? 'Photo permission is blocked. Enable it in Settings to select photos.'
        : 'Photo permission is required to select photos.',
    );
  }

  // Android 12 and below
  const permission =
    PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE;

  if (await PermissionsAndroid.check(permission)) {
    return;
  }

  const result = await PermissionsAndroid.request(permission);

  if (result === PermissionsAndroid.RESULTS.GRANTED) {
    return;
  }

  throw new Error(
    result === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN
      ? 'Storage permission is blocked. Enable it in Settings to select photos.'
      : 'Storage permission is required to select photos.',
  );
};

export const pickPostImage = async (
  source: 'camera' | 'gallery',
): Promise<SelectedPostImage[]> => {
  if (source === 'camera') {
    await ensureCameraPermission();
  } else {
    await ensureGalleryPermission();
  }

  const response =
    source === 'camera'
      ? await launchCamera({
          ...pickerOptions,
          saveToPhotos: false,
        })
      : await launchImageLibrary({
          ...pickerOptions,
          selectionLimit: 0,
        });

  return getImagesFromResponse(response);
};
