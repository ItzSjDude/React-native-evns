import React, {useCallback, useEffect, useRef, useState} from 'react';
import {ActivityIndicator, Alert, FlatList, Image, KeyboardAvoidingView, Modal, Platform, Pressable, RefreshControl, ScrollView, TextInput, useWindowDimensions, View} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {SafeAreaView, useSafeAreaInsets} from 'react-native-safe-area-context';
import {cssInterop} from 'nativewind';
import {loadSession} from '../auth';
import {Colors} from '../../Constants/Colors';
import AppIcon from '../../Constants/Icons';
import Typography from '../../Constants/Typography';
import PostCard, {PostCardData} from '../../Constants/UI/PostCard';
import {addPostComment, createPost, deletePost, getPostComments, getPostFeed, likePost, unlikePost} from './homeService';
import {pickPostImage} from './mediaPicker';
import SearchOverlay, {SearchTriggerLayout} from './SearchOverlay';
import type {ApiPost, HomeComment, HomePost, SelectedPostImage} from './types';
import type {RootNavigationParamList} from '../../Navigation/navigationRef';

cssInterop(SafeAreaView, {className: 'style'});

const formatTime = (date: string) => {
  const minutes = Math.max(1, Math.floor((Date.now() - new Date(date).getTime()) / 60000));
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h`;
  return `${Math.floor(minutes / 1440)}d`;
};

const toHomePost = (post: ApiPost): HomePost => ({
  id: post.id, authorId: post.author.id, author: post.author.name, avatarUrl: post.author.avatarUrl, time: formatTime(post.createdAt), content: post.body,
  likes: post.reactions.likeCount, likedByViewer: post.reactions.viewerHasLiked,
  images: post.media.map(item => item.url),
});

const messageOf = (error: unknown) => (error as {message?: string})?.message ?? 'Please try again.';

const CreatePostModal = ({
  visible,
  body,
  images,
  saving,
  onChange,
  onPickImage,
  onRemoveImage,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  body: string;
  images: SelectedPostImage[];
  saving: boolean;
  onChange: (value: string) => void;
  onPickImage: (source: 'camera' | 'gallery') => void;
  onRemoveImage: (index: number) => void;
  onClose: () => void;
  onSubmit: () => void;
}) => {
  const insets = useSafeAreaInsets();
  const {width: screenWidth} = useWindowDimensions();
  const previewWidth = screenWidth - 40;
  const [activeImage, setActiveImage] = React.useState(0);

  React.useEffect(() => {
    if (activeImage >= images.length) setActiveImage(Math.max(0, images.length - 1));
  }, [activeImage, images.length]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={-50}
      >
        <View className="flex-1 justify-end bg-black/60">
          <View
            className="rounded-t-[26px] bg-card px-[20px] pt-[16px]"
            style={{paddingBottom: Math.max(insets.bottom, 12) + 20}}
          >
            {/* Handle */}
            <View className="mb-[18px] h-[4px] w-[42px] self-center rounded-full bg-[#514B62]" />

            {/* Header */}
            <View className="mb-[14px] flex-row items-center justify-between">
              <Typography
                size={19}
                color={Colors.text}
                fontWeight="700"
              >
                Create a post
              </Typography>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close create post"
                onPress={onClose}
              >
                <Typography
                  size={14}
                  color={Colors.primary}
                  fontWeight="600"
                >
                  Close
                </Typography>
              </Pressable>
            </View>

            {/* Post input */}
            <TextInput
              accessibilityLabel="Post body"
              value={body}
              onChangeText={onChange}
              autoFocus
              multiline
              maxLength={2000}
              placeholder="Share something..."
              placeholderTextColor={Colors.muted}
              textAlignVertical="top"
              className="min-h-[120px] rounded-[16px] border border-[#4A4659] bg-background px-[14px] py-[12px] text-[16px] text-foreground"
            />

            <View className="mt-[14px] flex-row items-center">
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Choose image from gallery"
                onPress={() => onPickImage('gallery')}
                className="flex-1 flex-row items-center justify-center rounded-[14px] border border-[#4A4659] py-[11px] active:opacity-70"
              >
                <AppIcon name="image" size={19} color={Colors.primary} />
                <Typography size={13} color={Colors.text} fontWeight="600" className="ml-[7px]">Gallery</Typography>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Take image with camera"
                onPress={() => onPickImage('camera')}
                className="ml-[9px] flex-1 flex-row items-center justify-center rounded-[14px] border border-[#4A4659] py-[11px] active:opacity-70"
              >
                <AppIcon name="camera" size={19} color={Colors.primary} />
                <Typography size={13} color={Colors.text} fontWeight="600" className="ml-[7px]">Camera</Typography>
              </Pressable>
            </View>

            {images.length > 0 ? (
              <View className="mt-[12px] overflow-hidden rounded-[16px]">
                <ScrollView
                  horizontal
                  pagingEnabled
                  showsHorizontalScrollIndicator={false}
                  onMomentumScrollEnd={event => setActiveImage(Math.round(event.nativeEvent.contentOffset.x / previewWidth))}
                >
                  {images.map((image, index) => (
                    <View key={`${image.uri}-${index}`} className="w-full" style={{width: previewWidth}}>
                      <Image source={{uri: image.uri}} accessibilityLabel={`Selected post image ${index + 1}`} className="h-[150px] w-full" resizeMode="cover" />
                      <Pressable accessibilityRole="button" accessibilityLabel={`Remove selected image ${index + 1}`} onPress={() => onRemoveImage(index)} className="absolute right-[10px] top-[10px] rounded-full bg-black/70 px-[10px] py-[6px]">
                        <Typography size={12} color={Colors.text} fontWeight="600">Remove</Typography>
                      </Pressable>
                    </View>
                  ))}
                </ScrollView>
                {images.length > 1 ? (
                  <View className="absolute bottom-[8px] left-0 right-0 flex-row justify-center">
                    {images.map((image, index) => <View key={`${image.uri}-dot`} className={`mx-[3px] h-[6px] w-[6px] rounded-full ${index === activeImage ? 'bg-white' : 'bg-white/45'}`} />)}
                  </View>
                ) : null}
              </View>
            ) : null}

            {/* Publish */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Publish post"
              disabled={saving || (!body.trim() && images.length === 0)}
              onPress={onSubmit}
              className="mt-[14px] items-center rounded-full bg-primary py-[13px] active:opacity-70"
            >
              <Typography
                size={15}
                color={Colors.textDark}
                fontWeight="700"
              >
                {saving ? 'Publishing...' : 'Publish'}
              </Typography>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const CommentsModal = ({
  visible,
  post,
  comments,
  loading,
  error,
  draft,
  saving,
  onChangeDraft,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  post: HomePost | null;
  comments: HomeComment[];
  loading: boolean;
  error: string | null;
  draft: string;
  saving: boolean;
  onChangeDraft: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
}) => {
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
     <KeyboardAvoidingView
  className="flex-1"
  behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
  keyboardVerticalOffset={-50}
>
        <View className="flex-1 justify-end bg-black/60">
          <View
            className="max-h-[90%] rounded-t-[26px] bg-card px-[20px] pt-[16px]"
            style={{paddingBottom: Math.max(insets.bottom, 8)}}
          >
            {/* Handle */}
            <View className="mb-[18px] h-[4px] w-[42px] self-center rounded-full bg-[#514B62]" />

            {/* Header */}
            <View className="mb-[14px] flex-row items-center justify-between">
              <View>
                <Typography
                  size={19}
                  color={Colors.text}
                  fontWeight="700"
                >
                  Comments
                </Typography>
                {post ? (
                  <Typography size={12} color={Colors.muted} className="mt-[3px]">
                    {post.author}'s post
                  </Typography>
                ) : null}
              </View>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close comments"
                onPress={onClose}
              >
                <Typography
                  size={14}
                  color={Colors.primary}
                  fontWeight="600"
                >
                  Close
                </Typography>
              </Pressable>
            </View>

            {/* Loading */}
            {loading ? (
              <ActivityIndicator
                accessibilityLabel="Loading comments"
                color={Colors.primary}
                className="my-[24px]"
              />
            ) : null}

            {/* Error */}
            {error ? (
              <Typography
                size={14}
                color={Colors.coral}
                className="mb-[12px]"
              >
                {error}
              </Typography>
            ) : null}

            {/* Empty state */}
            {!loading && !error && comments.length === 0 ? (
              <Typography
                size={14}
                color={Colors.muted}
                className="py-[22px] text-center"
              >
                No comments yet. Be the first to comment.
              </Typography>
            ) : null}

            {/* Comments */}
            <FlatList
              data={comments}
              keyExtractor={item => item.id}
              renderItem={({item}) => (
                <View className="mb-[12px] flex-row">
                  <View className="h-[34px] w-[34px] items-center justify-center rounded-full bg-[#453E60]">
                    <Typography
                      size={14}
                      color={Colors.text}
                      fontWeight="700"
                    >
                      {item.author.name.slice(0, 1).toUpperCase()}
                    </Typography>
                  </View>

                  <View className="ml-[10px] flex-1 rounded-[14px] bg-[#252235] px-[12px] py-[9px]">
                    <Typography
                      size={13}
                      color={Colors.text}
                      fontWeight="600"
                    >
                      {item.author.name}
                    </Typography>

                    <Typography
                      size={14}
                      color={Colors.textBody}
                      className="mt-[3px]"
                    >
                      {item.body}
                    </Typography>
                  </View>
                </View>
              )}
              className="max-h-[280px]"
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            />

            {/* Comment input */}
            <View className="mt-[8px] flex-row items-end rounded-[16px] border border-[#4A4659] bg-background px-[12px] py-[7px]">
              <TextInput
                accessibilityLabel="New comment"
                value={draft}
                onChangeText={onChangeDraft}
                placeholder="Write a comment..."
                placeholderTextColor={Colors.muted}
                multiline
                maxLength={500}
                returnKeyType="default"
                blurOnSubmit={false}
                className="max-h-[90px] min-h-[38px] flex-1 px-[2px] text-[15px] text-foreground"
              />

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Add comment"
                disabled={saving || !draft.trim()}
                onPress={onSubmit}
                className="ml-[8px] rounded-full bg-primary px-[13px] py-[9px] active:opacity-70"
              >
                <Typography
                  size={13}
                  color={Colors.textDark}
                  fontWeight="700"
                >
                  {saving ? '...' : 'Send'}
                </Typography>
              </Pressable>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const Home = () => {
  const navigation = useNavigation<NativeStackNavigationProp<RootNavigationParamList>>();
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [feedPosts, setFeedPosts] = useState<HomePost[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createVisible, setCreateVisible] = useState(false);
  const [draft, setDraft] = useState('');
  const [postImages, setPostImages] = useState<SelectedPostImage[]>([]);
  const [saving, setSaving] = useState(false);
  const [commentsVisible, setCommentsVisible] = useState(false);
  const [activeCommentPost, setActiveCommentPost] = useState<HomePost | null>(null);
  const [comments, setComments] = useState<HomeComment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentsError, setCommentsError] = useState<string | null>(null);
  const [commentDraft, setCommentDraft] = useState('');
  const [commentSaving, setCommentSaving] = useState(false);
  const [searchVisible, setSearchVisible] = useState(false);
  const [searchTriggerLayout, setSearchTriggerLayout] = useState<SearchTriggerLayout | null>(null);
  const searchTriggerRef = useRef<React.ComponentRef<typeof Pressable>>(null);

  const loadFeed = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true); else setLoading(true);
    setError(null);
    try {setFeedPosts((await getPostFeed()).posts.map(toHomePost));}
    catch (requestError) {setError(messageOf(requestError));}
    finally {setLoading(false); setRefreshing(false);}
  }, []);

  useEffect(() => {loadFeed();}, [loadFeed]);

  useEffect(() => {
    loadSession().then(session => setViewerId(session?.user.id ?? null));
  }, []);

  const toggleLike = async (post: HomePost) => {
    const nextLiked = !post.likedByViewer;
    setFeedPosts(current => current.map(item => item.id === post.id ? {...item, likedByViewer: nextLiked, likes: item.likes + (nextLiked ? 1 : -1)} : item));
    try {
      const reactions = nextLiked ? await likePost(post.id) : await unlikePost(post.id);
      setFeedPosts(current => current.map(item => item.id === post.id ? {...item, likes: reactions.likeCount, likedByViewer: reactions.viewerHasLiked} : item));
    } catch (requestError) {
      setFeedPosts(current => current.map(item => item.id === post.id ? {...item, likedByViewer: !nextLiked, likes: item.likes + (nextLiked ? -1 : 1)} : item));
      Alert.alert('Could not update like', messageOf(requestError));
    }
  };

  const submitPost = async () => {
    if ((!draft.trim() && postImages.length === 0) || saving) return;
    setSaving(true);
    try {
      const post = await createPost({
        body: draft.trim() || undefined,
        media: postImages.length > 0 ? postImages.map(image => ({url: image.uri, type: 'IMAGE' as const})) : undefined,
      });
      setFeedPosts(current => [toHomePost(post), ...current]);
      setDraft(''); setPostImages([]); setCreateVisible(false);
    } catch (requestError) {Alert.alert('Could not publish post', messageOf(requestError));}
    finally {setSaving(false);}
  };

  const pickImage = async (source: 'camera' | 'gallery') => {
    try {
      const images = await pickPostImage(source);
      if (images.length > 0) {
        setPostImages(current => {
          const existingUris = new Set(current.map(image => image.uri));
          return [...current, ...images.filter(image => !existingUris.has(image.uri))];
        });
      }
    } catch (pickerError) {
      Alert.alert('Could not select image', messageOf(pickerError));
    }
  };

  const openComments = async (post: HomePost) => {
    setActiveCommentPost(post);
    setCommentsVisible(true);
    setComments([]);
    setCommentsError(null);
    setCommentDraft('');
    setCommentsLoading(true);
    try {setComments(await getPostComments(post.id));}
    catch (requestError) {setCommentsError(messageOf(requestError));}
    finally {setCommentsLoading(false);}
  };

  const submitComment = async () => {
    if (!activeCommentPost || !commentDraft.trim() || commentSaving) return;
    setCommentSaving(true);
    try {
      const comment = await addPostComment(activeCommentPost.id, commentDraft.trim());
      setComments(current => [...current, comment]);
      setCommentDraft('');
    } catch (requestError) {setCommentsError(messageOf(requestError));}
    finally {setCommentSaving(false);}
  };

  const closeComments = () => {
    setCommentsVisible(false);
    setActiveCommentPost(null);
  };

  const openSearch = () => {
    searchTriggerRef.current?.measureInWindow((x, y, width, height) => {
      setSearchTriggerLayout({x, y, width, height});
      setSearchVisible(true);
    });
  };
  const selectSearchPost = (post: HomePost) => {
    setSearchVisible(false);
    openComments(post);
  };

  const removePost = async (postId: string) => {
    try {
      await deletePost(postId);
      setFeedPosts(current => current.filter(item => item.id !== postId));
    } catch (requestError) {
      Alert.alert('Could not delete post', messageOf(requestError));
      throw requestError;
    }
  };

  return <SafeAreaView className="flex-1 bg-background" edges={['top']}>
    <FlatList data={feedPosts} keyExtractor={item => item.id} renderItem={({item}) => <PostCard {...item as PostCardData} canDelete={viewerId !== null && item.authorId === viewerId} onDelete={() => removePost(item.id)} onToggleLike={() => {toggleLike(item);}} onOpenComments={() => {openComments(item);}} />} ItemSeparatorComponent={<View className="h-[15px]" />} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => {loadFeed(true);}} tintColor={Colors.primary} />} showsVerticalScrollIndicator={false} contentContainerClassName="px-5 pb-[110px]" ListEmptyComponent={loading ? <ActivityIndicator accessibilityLabel="Loading posts" color={Colors.primary} className="mt-[40px]" /> : <Typography size={14} color={error ? Colors.coral : Colors.muted} className="mt-[40px] text-center">{error ?? 'No posts yet.'}</Typography>} ListHeaderComponent={<View className="flex-row items-center justify-between pt-[21px] pb-[20px]"><View><Typography size={28} color={Colors.text} fontWeight="500" className="tracking-[-1px]">Hiva chat</Typography><Typography size={13} color={Colors.primary} fontWeight="600" className="mt-1 tracking-[2px]">FOR YOU</Typography></View><View className="flex-row items-center"><Pressable accessibilityRole="button" accessibilityLabel="Create a post" onPress={() => setCreateVisible(true)} className="mr-[8px] rounded-full bg-primary px-[12px] py-[7px] active:opacity-70"><Typography size={14} color={Colors.iconDark} fontWeight="700">Post +</Typography></Pressable><Pressable ref={searchTriggerRef} accessibilityRole="button" accessibilityLabel="Search" onPress={openSearch} className="p-[5px] active:opacity-70"><View className={searchVisible ? 'opacity-0' : 'opacity-100'}><AppIcon name="search" size={24} /></View></Pressable><Pressable accessibilityRole="button" accessibilityLabel="Notifications" onPress={() => navigation.navigate('Notifications')} className="ml-[5px] p-[5px] active:opacity-70"><AppIcon name="bell" size={27} /></Pressable></View></View>} />
    <CreatePostModal visible={createVisible} body={draft} images={postImages} saving={saving} onChange={setDraft} onPickImage={pickImage} onRemoveImage={index => setPostImages(current => current.filter((_, imageIndex) => imageIndex !== index))} onClose={() => setCreateVisible(false)} onSubmit={submitPost} />
    <CommentsModal visible={commentsVisible} post={activeCommentPost} comments={comments} loading={commentsLoading} error={commentsError} draft={commentDraft} saving={commentSaving} onChangeDraft={setCommentDraft} onClose={closeComments} onSubmit={submitComment} />
    {searchVisible ? <SearchOverlay posts={feedPosts} triggerLayout={searchTriggerLayout} onSelectPost={selectSearchPost} onClosed={() => setSearchVisible(false)} /> : null}
  </SafeAreaView>;
};

export default Home;
