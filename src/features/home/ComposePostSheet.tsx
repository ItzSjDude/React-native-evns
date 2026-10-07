import React, {useEffect, useRef, useState} from 'react';
import {ActivityIndicator, Image, Pressable, Text, TextInput, View} from 'react-native';
import IconPhotoPlus from '@tabler/icons-react-native/IconPhotoPlus';
import IconRefresh from '@tabler/icons-react-native/IconRefresh';
import IconX from '@tabler/icons-react-native/IconX';
import BottomSheet, {SheetButton} from '../../components/BottomSheet';
import {Colors} from '../../Constants/Colors';
import Typography from '../../Constants/Typography';
import {imagePicker, isPurposeRejected, uploadErrorMessage, uploadMedia, type LocalMediaFile} from '../../core/media';
import {POST_BODY_MAX_LENGTH, type ApiPostMedia} from './types';

/** `post.schema.js#create` allows at most 4 media items. */
export const MAX_POST_PHOTOS = 4;

type ComposePhoto = {
  id: string;
  file: LocalMediaFile;
  status: 'uploading' | 'done' | 'error';
  fileUrl?: string;
  error?: string;
};

type ComposePostSheetProps = {
  visible: boolean;
  draft: string;
  /** Set when a previous attempt failed; the draft is restored alongside it. */
  error: string | null;
  onChangeDraft: (value: string) => void;
  onClose: () => void;
  /** `media` holds the uploaded https URLs; pass both to `createPost(body, media)`. */
  onSubmit: (body: string, media: ApiPostMedia[]) => void;
};

let nextPhotoId = 0;

const ComposePostSheet = ({visible, draft, error, onChangeDraft, onClose, onSubmit}: ComposePostSheetProps) => {
  const [photos, setPhotos] = useState<ComposePhoto[]>([]);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  // Photos from the last submit, restored if the parent reopens the sheet with an error.
  const lastSubmitted = useRef<ComposePhoto[] | null>(null);

  useEffect(() => {
    if (!visible) return;
    if (error && lastSubmitted.current) setPhotos(current => (current.length ? current : lastSubmitted.current ?? []));
    lastSubmitted.current = null;
  }, [visible, error]);

  const patchPhoto = (id: string, patch: Partial<ComposePhoto>) =>
    setPhotos(current => current.map(photo => (photo.id === id ? {...photo, ...patch} : photo)));

  const upload = async (id: string, file: LocalMediaFile) => {
    patchPhoto(id, {status: 'uploading', error: undefined});
    try {
      const {fileUrl} = await uploadMedia(file, 'post');
      patchPhoto(id, {status: 'done', fileUrl});
    } catch (cause) {
      const message = isPurposeRejected(cause)
        ? 'The server doesn’t accept post photos yet (upload purpose "post" was rejected). Try again after the next backend update.'
        : uploadErrorMessage(cause);
      patchPhoto(id, {status: 'error', error: message});
      setPhotoError(message);
    }
  };

  const addPhotos = async () => {
    const room = MAX_POST_PHOTOS - photos.length;
    if (!imagePicker.available || picking || room <= 0) return;
    setPhotoError(null);
    setPicking(true);
    let files: LocalMediaFile[] = [];
    try {
      files = await imagePicker.pickImages(room);
    } catch (cause) {
      setPhotoError(uploadErrorMessage(cause, 'Could not open your photos.'));
    } finally {
      setPicking(false);
    }
    const added = files.slice(0, room).map(file => ({id: `photo-${++nextPhotoId}`, file, status: 'uploading' as const}));
    if (!added.length) return;
    setPhotos(current => [...current, ...added].slice(0, MAX_POST_PHOTOS));
    added.forEach(photo => { upload(photo.id, photo.file); });
  };

  const removePhoto = (id: string) => {
    setPhotos(current => current.filter(photo => photo.id !== id));
    setPhotoError(null);
  };

  const body = draft.trim();
  const remaining = POST_BODY_MAX_LENGTH - draft.length;
  const uploading = photos.some(photo => photo.status === 'uploading');
  const failed = photos.some(photo => photo.status === 'error');
  const media: ApiPostMedia[] = photos.flatMap(photo => (photo.status === 'done' && photo.fileUrl ? [{url: photo.fileUrl, type: 'IMAGE' as const}] : []));
  const canPost = (Boolean(body) || media.length > 0) && body.length <= POST_BODY_MAX_LENGTH && !uploading && !failed;
  const canAdd = imagePicker.available && !picking && photos.length < MAX_POST_PHOTOS;

  const submit = () => {
    if (!canPost) return;
    lastSubmitted.current = photos;
    setPhotos([]);
    setPhotoError(null);
    onSubmit(body, media);
  };

  const status = uploading ? 'Uploading photos…' : failed ? 'Remove or retry failed photos to post.' : null;

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title="Create a post"
      subtitle="Share what's on your mind with everyone."
      footer={<SheetButton label={uploading ? 'Uploading…' : 'Post'} busy={uploading} disabled={!canPost} onPress={submit} />}>
      {error ? <Typography size={13} color={Colors.coral} className="mb-[10px]">{error}</Typography> : null}
      <View className="rounded-[16px] border border-border-muted bg-background px-[12px] py-[8px]">
        <TextInput
          accessibilityLabel="Post text"
          value={draft}
          onChangeText={onChangeDraft}
          placeholder="What's happening?"
          placeholderTextColor={Colors.muted}
          multiline
          autoFocus
          maxLength={POST_BODY_MAX_LENGTH}
          textAlignVertical="top"
          className="min-h-[120px] max-h-[260px] text-[16px] text-foreground"
        />
      </View>
      {photos.length ? <View className="mt-[10px] flex-row flex-wrap gap-2">
        {photos.map((photo, index) => <View key={photo.id} className="h-[76px] w-[76px] overflow-hidden rounded-[12px] border border-border-muted bg-card">
          <Image accessibilityLabel={`Attached photo ${index + 1}`} source={{uri: photo.file.uri}} className="h-full w-full" />
          {photo.status === 'uploading' ? <View className="absolute inset-0 items-center justify-center bg-black/50"><ActivityIndicator color={Colors.primary} /></View> : null}
          {photo.status === 'error' ? <Pressable accessibilityRole="button" accessibilityLabel={`Retry photo ${index + 1}`} onPress={() => upload(photo.id, photo.file)}
            className="absolute inset-0 items-center justify-center bg-coral/40 active:opacity-70">
            <IconRefresh size={22} color={Colors.text} />
          </Pressable> : null}
          <Pressable accessibilityRole="button" accessibilityLabel={`Remove photo ${index + 1}`} hitSlop={6} onPress={() => removePhoto(photo.id)}
            className="absolute right-1 top-1 h-6 w-6 items-center justify-center rounded-full bg-black/70 active:opacity-70">
            <IconX size={14} color={Colors.text} />
          </Pressable>
        </View>)}
      </View> : null}
      {photoError ? <Text accessibilityRole="alert" className="mt-[8px] text-[13px] text-coral">{photoError}</Text> : null}
      <View className="mt-[8px] flex-row items-center justify-between">
        {imagePicker.available ? <Pressable accessibilityRole="button" accessibilityLabel="Add photos" accessibilityState={{disabled: !canAdd}} disabled={!canAdd} onPress={addPhotos}
          className={`min-h-11 flex-row items-center gap-1.5 rounded-full px-1 ${canAdd ? 'active:opacity-70' : 'opacity-40'}`}>
          <IconPhotoPlus size={20} color={Colors.primary} />
          <Text className="text-[13px] font-semibold text-primary">Photo {photos.length}/{MAX_POST_PHOTOS}</Text>
        </Pressable> : <View />}
        <Typography size={12} color={remaining <= 0 ? Colors.coral : Colors.muted} className="text-right">
          {draft.length}/{POST_BODY_MAX_LENGTH}
        </Typography>
      </View>
      {status ? <Typography size={12} color={Colors.muted} className="mt-[4px]">{status}</Typography> : null}
    </BottomSheet>
  );
};

export default ComposePostSheet;
