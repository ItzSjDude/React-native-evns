/**
 * Mirrors gathr-api `POST /media/upload-url` (validators/notification.schema.js `uploadUrl`).
 * `post` is only accepted once the backend fix on feat/platform-fixes is deployed.
 */
export type MediaPurpose = 'avatar' | 'workspace' | 'event' | 'chat' | 'payment' | 'post' | 'misc';

/** MIME types the backend accepts (services/media.service.js ALLOWED_TYPES). */
export const ALLOWED_MEDIA_TYPES = [
  'image/jpeg', 'image/png', 'image/webp', 'image/heic',
  'audio/m4a', 'audio/mp4', 'audio/webm',
] as const;
export type MediaContentType = (typeof ALLOWED_MEDIA_TYPES)[number];

/** Backend cap; advisory only, the presigned PUT cannot enforce it. */
export const MAX_MEDIA_BYTES = 10 * 1024 * 1024;

export type UploadUrlRequest = {
  contentType: string;
  purpose: MediaPurpose;
  sizeBytes?: number;
};

export type UploadUrlResponse = {
  uploadUrl: string;
  key: string;
  fileUrl: string;
  /** Must be sent verbatim on the PUT; Content-Type is part of the signature. */
  requiredHeaders: Record<string, string>;
  expiresIn: number;
};

/** A file on the device, as returned by an image picker or recorder. */
export type LocalMediaFile = {
  uri: string;
  type: string;
  size?: number;
  name?: string;
};

export type UploadedMedia = {key: string; fileUrl: string};

/** Picker abstraction so features do not depend on a specific native library. */
export type ImagePicker = {
  available: boolean;
  /** Resolves null when the user cancels. */
  pickImage: () => Promise<LocalMediaFile | null>;
  /** Multi-select up to `limit` photos; resolves [] when the user cancels. */
  pickImages: (limit: number) => Promise<LocalMediaFile[]>;
};
