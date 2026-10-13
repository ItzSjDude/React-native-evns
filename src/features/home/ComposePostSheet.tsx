import React, {useEffect, useRef, useState} from 'react';
import {SLIDE_MODAL_ANIMATION} from '../../Constants/NavigationTransitions';
import {ActivityIndicator, Image, KeyboardAvoidingView, Modal, Pressable, ScrollView, Text, TextInput, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import IconPhoto from '@tabler/icons-react-native/IconPhoto';
import IconRefresh from '@tabler/icons-react-native/IconRefresh';
import IconX from '@tabler/icons-react-native/IconX';
import ThemedStatusBar from '../../components/ThemedStatusBar';
import {Colors} from '../../Constants/Colors';
import Typography from '../../Constants/Typography';
import {imagePicker, isPurposeRejected, uploadErrorMessage, uploadMedia, type LocalMediaFile} from '../../core/media';
import {avatarTint} from './feedTheme';
import {POST_BODY_MAX_LENGTH, type ApiPostMedia} from './types';

/** `post.schema.js#create` allows at most 4 media items. */
export const MAX_POST_PHOTOS = 4;
/** Like Threads, the character counter only appears once the limit is close. */
const COUNTER_THRESHOLD = 100;

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
  /** Shown beside the avatar; falls back to "You" with initials when absent. */
  viewerName?: string | null;
  viewerAvatarUrl?: string | null;
};

const initialsOf = (name: string) => name.trim().split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase() || '?';

const ComposeAvatar = ({name, url, size}: {name: string; url?: string | null; size: number}) => {
  const tint = avatarTint(name);
  const frame = {width: size, height: size, borderRadius: size / 2, backgroundColor: tint.background};
  return url
    ? <Image source={{uri: url}} accessibilityLabel={`${name}'s avatar`} style={frame} />
    : <View style={frame} className="items-center justify-center">
      {size >= 24 ? <Text style={{fontSize: size * 0.36, color: tint.text}} className="font-bold">{initialsOf(name)}</Text> : null}
    </View>;
};

let nextPhotoId = 0;

const ComposePostSheet = ({visible, draft, error, onChangeDraft, onClose, onSubmit, viewerName, viewerAvatarUrl}: ComposePostSheetProps) => {
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
  const name = viewerName?.trim() || 'You';

  return (
    <Modal visible={visible} animationType={SLIDE_MODAL_ANIMATION} statusBarTranslucent onRequestClose={onClose}>
      <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-background">
        <ThemedStatusBar />
        <KeyboardAvoidingView behavior="padding" className="flex-1">
          <View className="h-[52px] flex-row items-center border-b border-border px-4">
            <Pressable accessibilityRole="button" accessibilityLabel="Cancel" onPress={onClose} hitSlop={8} className="z-10 min-h-11 justify-center active:opacity-60">
              <Text className="text-[16px] text-foreground">Cancel</Text>
            </Pressable>
            <Text accessibilityRole="header" className="absolute inset-x-0 text-center text-[16px] font-bold text-foreground">New post</Text>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerClassName="px-4 pb-4 pt-3">
            {error ? <Typography size={13} color={Colors.coral} className="mb-[10px]">{error}</Typography> : null}
            <View className="flex-row gap-3">
              {/* Threads-style connector: avatar, a thin line down the column, then a faded avatar. */}
              <View className="w-9 items-center">
                <ComposeAvatar name={name} url={viewerAvatarUrl} size={36} />
                <View className="my-[6px] min-h-[24px] w-[2px] flex-1 rounded-full bg-border" />
                <View className="opacity-40"><ComposeAvatar name={name} url={viewerAvatarUrl} size={16} /></View>
              </View>
              <View className="min-w-0 flex-1 pb-[6px]">
                <Text numberOfLines={1} className="text-[15px] font-bold text-foreground">{name}</Text>
                <TextInput
                  accessibilityLabel="Post text"
                  value={draft}
                  onChangeText={onChangeDraft}
                  placeholder="What's new?"
                  placeholderTextColor={Colors.muted}
                  selectionColor={Colors.gold}
                  multiline
                  autoFocus
                  maxLength={POST_BODY_MAX_LENGTH}
                  textAlignVertical="top"
                  className="min-h-[28px] p-0 pt-[2px] text-[15px] leading-[21px] text-text-body"
                />
                {photos.length ? <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" className="mt-[10px]" contentContainerClassName="gap-2">
                  {photos.map((photo, index) => <View key={photo.id} className="h-[160px] w-[124px] overflow-hidden rounded-[12px] border border-border bg-card">
                    <Image accessibilityLabel={`Attached photo ${index + 1}`} source={{uri: photo.file.uri}} className="h-full w-full" />
                    {photo.status === 'uploading' ? <View className="absolute inset-0 items-center justify-center bg-black/50"><ActivityIndicator color={Colors.gold} /></View> : null}
                    {photo.status === 'error' ? <Pressable accessibilityRole="button" accessibilityLabel={`Retry photo ${index + 1}`} onPress={() => upload(photo.id, photo.file)}
                      className="absolute inset-0 items-center justify-center bg-coral/40 active:opacity-70">
                      <IconRefresh size={22} color={Colors.white} />
                    </Pressable> : null}
                    <Pressable accessibilityRole="button" accessibilityLabel={`Remove photo ${index + 1}`} hitSlop={6} onPress={() => removePhoto(photo.id)}
                      className="absolute right-1.5 top-1.5 h-6 w-6 items-center justify-center rounded-full bg-black/60 active:opacity-70">
                      <IconX size={14} color={Colors.white} />
                    </Pressable>
                  </View>)}
                </ScrollView> : null}
                {photoError ? <Text accessibilityRole="alert" className="mt-[8px] text-[13px] text-coral">{photoError}</Text> : null}
                {imagePicker.available ? <View className="mt-[6px] flex-row items-center">
                  <Pressable accessibilityRole="button" accessibilityLabel="Add photos" accessibilityHint={`${photos.length} of ${MAX_POST_PHOTOS} photos attached`}
                    accessibilityState={{disabled: !canAdd}} disabled={!canAdd} onPress={addPhotos} hitSlop={6}
                    className={`-ml-[6px] h-9 w-9 items-center justify-center rounded-full ${canAdd ? 'active:bg-card' : 'opacity-40'}`}>
                    <IconPhoto size={20} color={Colors.muted} />
                  </Pressable>
                </View> : null}
                {status ? <Typography size={12} color={Colors.muted} className="mt-[4px]">{status}</Typography> : null}
              </View>
            </View>
          </ScrollView>
          <View className="flex-row items-center gap-3 px-4 pb-2 pt-2">
            <Text className="min-w-0 flex-1 text-[14px] text-muted">Anyone can reply</Text>
            {remaining <= COUNTER_THRESHOLD ? <Typography size={12} color={remaining <= 0 ? Colors.coral : Colors.muted}>{remaining}</Typography> : null}
            <Pressable accessibilityRole="button" accessibilityLabel="Post" accessibilityState={{disabled: !canPost, busy: uploading}} disabled={!canPost} onPress={submit}
              className={`h-9 min-w-[64px] flex-row items-center justify-center gap-1.5 rounded-full bg-gold px-4 active:opacity-80 ${canPost ? '' : 'opacity-40'}`}>
              {uploading ? <ActivityIndicator size="small" color={Colors.goldInk} /> : null}
              <Text className="text-[15px] font-bold text-gold-ink">Post</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
};

export default ComposePostSheet;
