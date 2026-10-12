import {apiRequest, type ApiError} from '../api/apiClient';
import {ALLOWED_MEDIA_TYPES, MAX_MEDIA_BYTES, type LocalMediaFile, type MediaPurpose, type UploadedMedia, type UploadUrlRequest, type UploadUrlResponse} from './types';

export function requestUploadUrl(input: UploadUrlRequest): Promise<UploadUrlResponse> {
  return apiRequest<UploadUrlResponse>('/media/upload-url', {
    auth: 'required', method: 'POST', body: JSON.stringify(input),
  });
}

/**
 * Request a presigned URL, PUT the file bytes straight to the bucket, and
 * return the resulting public URL. Errors are thrown in the ApiError shape.
 */
export async function uploadMedia(file: LocalMediaFile, purpose: MediaPurpose): Promise<UploadedMedia> {
  if (!(ALLOWED_MEDIA_TYPES as readonly string[]).includes(file.type)) {
    throw {status: 400, message: 'That file type is not supported.'} satisfies ApiError;
  }
  if (file.size && file.size > MAX_MEDIA_BYTES) {
    throw {status: 400, message: 'File exceeds the 10MB limit.'} satisfies ApiError;
  }

  const target = await requestUploadUrl({contentType: file.type, purpose, ...(file.size ? {sizeBytes: file.size} : {})});

  let body: Blob;
  try {
    body = await (await fetch(file.uri)).blob();
  } catch {
    throw {status: 0, message: 'Could not read the selected file.'} satisfies ApiError;
  }

  let response: Response;
  try {
    response = await fetch(target.uploadUrl, {
      method: 'PUT',
      headers: {'Content-Type': file.type, ...target.requiredHeaders},
      body,
    });
  } catch {
    throw {status: 0, message: 'Upload failed. Check your connection and try again.'} satisfies ApiError;
  }
  if (!response.ok) {
    throw {status: response.status, message: `Upload failed (${response.status}). Please try again.`} satisfies ApiError;
  }
  return {key: target.key, fileUrl: target.fileUrl};
}

/** True when `POST /media/upload-url` rejected the `purpose` (e.g. `post` before the backend fix is deployed). */
export function isPurposeRejected(error: unknown): boolean {
  const apiError = error as Partial<ApiError> | null;
  if (!apiError || (apiError.status !== 400 && apiError.status !== 422)) return false;
  const mentionsPurpose = (text?: string) => /purpose/i.test(text ?? '');
  return mentionsPurpose(apiError.message) || (apiError.details ?? []).some(detail => mentionsPurpose(detail.field) || mentionsPurpose(detail.message));
}

/** User-facing message for a failed upload. */
export function uploadErrorMessage(error: unknown, fallback = 'Photo upload failed. Please try again.'): string {
  if (isPurposeRejected(error)) return 'Photo uploads for this aren’t enabled on the server yet. Please try again later.';
  return (error as {message?: string})?.message || fallback;
}
