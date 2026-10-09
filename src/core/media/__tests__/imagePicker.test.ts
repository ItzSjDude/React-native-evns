import {launchImageLibrary} from 'react-native-image-picker';
import {imagePicker, isPurposeRejected, uploadErrorMessage} from '..';

const launch = launchImageLibrary as jest.Mock;

beforeEach(() => { jest.clearAllMocks(); });

test('is available and opens the library for a single downscaled photo', async () => {
  launch.mockResolvedValueOnce({assets: [{uri: 'file:///cache/a.jpg', type: 'image/jpg', fileSize: 1234, fileName: 'a.jpg'}]});
  expect(imagePicker.available).toBe(true);
  await expect(imagePicker.pickImage()).resolves.toEqual({uri: 'file:///cache/a.jpg', type: 'image/jpeg', size: 1234, name: 'a.jpg'});
  expect(launch).toHaveBeenCalledWith({mediaType: 'photo', quality: 0.8, maxWidth: 2048, maxHeight: 2048, includeBase64: false, selectionLimit: 1});
});

test('returns null when cancelled (the default mock)', async () => {
  await expect(imagePicker.pickImage()).resolves.toBeNull();
});

test('multi-select respects the limit and infers missing types', async () => {
  launch.mockResolvedValueOnce({assets: [{uri: 'file:///x/1.png'}, {uri: 'file:///x/2.webp', type: 'image/webp'}, {uri: 'file:///x/3.jpg'}]});
  const files = await imagePicker.pickImages(2);
  expect(launch).toHaveBeenCalledWith(expect.objectContaining({selectionLimit: 2}));
  expect(files).toEqual([{uri: 'file:///x/1.png', type: 'image/png'}, {uri: 'file:///x/2.webp', type: 'image/webp'}]);
});

test('turns picker errors into a user-facing ApiError', async () => {
  launch.mockResolvedValueOnce({errorCode: 'permission', errorMessage: 'denied'});
  await expect(imagePicker.pickImage()).rejects.toEqual({status: 0, message: 'Allow photo access in Settings to choose a picture.'});
});

test('detects a rejected upload purpose', () => {
  const rejected = {status: 400, message: 'Invalid request body', details: [{field: 'purpose', message: 'Invalid enum value'}]};
  expect(isPurposeRejected(rejected)).toBe(true);
  expect(isPurposeRejected({status: 400, message: 'File exceeds the 10MB limit.'})).toBe(false);
  expect(isPurposeRejected({status: 500, message: 'purpose'})).toBe(false);
  expect(uploadErrorMessage({status: 0, message: 'Offline'})).toBe('Offline');
  expect(uploadErrorMessage(rejected)).toMatch(/aren.t enabled on the server yet/);
});
