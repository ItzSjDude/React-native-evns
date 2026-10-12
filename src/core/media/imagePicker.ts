import {launchImageLibrary, type Asset, type ImageLibraryOptions} from 'react-native-image-picker';
import type {ApiError} from '../api/apiClient';
import type {ImagePicker, LocalMediaFile} from './types';

/**
 * Library-only picking. Android uses the system Photo Picker (no storage
 * permission needed); iOS uses PHPicker (NSPhotoLibraryUsageDescription).
 * Images are downscaled/recompressed so uploads stay well under MAX_MEDIA_BYTES.
 */
const BASE_OPTIONS: ImageLibraryOptions = {
  mediaType: 'photo',
  quality: 0.8,
  maxWidth: 2048,
  maxHeight: 2048,
  includeBase64: false,
};

const EXTENSION_TYPES: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', heic: 'image/heic', heif: 'image/heic',
};

const typeOf = (asset: Asset): string => {
  const declared = asset.type?.toLowerCase();
  if (declared === 'image/jpg') return 'image/jpeg';
  if (declared === 'image/heif') return 'image/heic';
  if (declared) return declared;
  const extension = (asset.fileName ?? asset.uri ?? '').split('?')[0]!.split('.').pop()?.toLowerCase() ?? '';
  return EXTENSION_TYPES[extension] ?? 'image/jpeg';
};

export const toLocalMediaFile = (asset: Asset): LocalMediaFile | null => {
  if (!asset.uri) return null;
  return {
    uri: asset.uri,
    type: typeOf(asset),
    ...(asset.fileSize ? {size: asset.fileSize} : {}),
    ...(asset.fileName ? {name: asset.fileName} : {}),
  };
};

async function pick(selectionLimit: number): Promise<LocalMediaFile[]> {
  const response = await launchImageLibrary({...BASE_OPTIONS, selectionLimit});
  if (response.didCancel) return [];
  if (response.errorCode) {
    throw {
      status: 0,
      message: response.errorCode === 'permission'
        ? 'Allow photo access in Settings to choose a picture.'
        : 'Could not open your photos. Please try again.',
    } satisfies ApiError;
  }
  return (response.assets ?? []).map(toLocalMediaFile).filter((file): file is LocalMediaFile => file !== null).slice(0, selectionLimit);
}

export const imagePicker: ImagePicker = {
  available: true,
  pickImage: async () => (await pick(1))[0] ?? null,
  pickImages: async limit => (limit > 0 ? pick(limit) : []),
};
