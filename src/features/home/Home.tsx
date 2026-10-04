import React, {useState} from 'react';
import {ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, TextInput, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {cssInterop} from 'nativewind';
import {Colors} from '../../Constants/Colors';
import AppIcon from '../../Constants/Icons';
import Typography from '../../Constants/Typography';
import PostCard, {PostCardData} from '../../Constants/UI/PostCard';
import {addPostComment, getPostComments, likePost, unlikePost} from './homeService';
import type {HomeComment, HomePost} from './types';

cssInterop(SafeAreaView, {className: 'style'});

const posts: HomePost[] = [
  {
    id: '1',
    author: 'Sachin Jangir',
    time: '1h',
    content: 'A perfect day by the sea 🌴',
    likes: 3257,
    comments: 47,
    images: [
      'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1200&q=80',
      'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1200&q=80',
    ],
  },
  {id: '2', author: 'Sachin Jangir', time: '6d', content: 'Weekend plans with good people.', likes: 1, comments: 4},
  {id: '3', author: 'Sachin Jangir', time: '6d', content: 'Hell', likes: 1},
];

const PostSeparator = () => <View className="h-[18px]" />;

const messageOf = (error: unknown) => (error as {message?: string})?.message ?? 'Please try again.';

const CommentsModal = ({visible, post, comments, loading, error, draft, saving, onChangeDraft, onClose, onSubmit}: {
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
}) => (
  <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1 justify-end">
      <Pressable className="flex-1 bg-black/60" onPress={onClose} />
      <View className="max-h-[78%] rounded-t-[26px] bg-card px-[20px] pb-[18px] pt-[14px]">
        <View className="mb-[15px] h-[4px] w-[42px] self-center rounded-full bg-[#514B62]" />
        <View className="mb-[14px] flex-row items-center justify-between">
          <View>
            <Typography size={19} color={Colors.text} fontWeight="700">Comments</Typography>
            {post ? <Typography size={12} color={Colors.muted} className="mt-[3px]">{post.author}'s post</Typography> : null}
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Close comments" onPress={onClose} className="p-[6px] active:opacity-70"><Typography size={14} color={Colors.primary} fontWeight="600">Close</Typography></Pressable>
        </View>
        {loading ? <ActivityIndicator accessibilityLabel="Loading comments" color={Colors.primary} className="my-[30px]" /> : null}
        {error ? <Typography size={14} color={Colors.coral} className="mb-[14px]">{error}</Typography> : null}
        {!loading && !error && comments.length === 0 ? <Typography size={14} color={Colors.muted} className="py-[28px] text-center">No comments yet. Be the first to comment.</Typography> : null}
        <FlatList
          data={comments}
          keyExtractor={item => item.id}
          className="shrink"
          showsVerticalScrollIndicator={false}
          renderItem={({item}) => <View className="mb-[14px] flex-row"><View className="h-[35px] w-[35px] items-center justify-center rounded-full bg-[#453E60]"><Typography size={14} color={Colors.text} fontWeight="700">{item.author.name.slice(0, 1).toUpperCase()}</Typography></View><View className="ml-[10px] flex-1 rounded-[14px] bg-[#252235] px-[12px] py-[9px]"><Typography size={13} color={Colors.text} fontWeight="600">{item.author.name}</Typography><Typography size={14} color={Colors.textBody} className="mt-[3px]">{item.body}</Typography></View></View>}
        />
        <View className="mt-[8px] flex-row items-end rounded-[16px] border border-[#4A4659] bg-background px-[12px] py-[7px]">
          <TextInput accessibilityLabel="New comment" value={draft} onChangeText={onChangeDraft} placeholder="Write a comment..." placeholderTextColor={Colors.muted} multiline maxLength={500} className="max-h-[90px] min-h-[38px] flex-1 px-[2px] text-[15px] text-foreground" />
          <Pressable accessibilityRole="button" accessibilityLabel="Add comment" disabled={saving || !draft.trim()} onPress={onSubmit} className="ml-[8px] rounded-full bg-primary px-[13px] py-[9px] active:opacity-70"><Typography size={13} color={Colors.textDark} fontWeight="700">{saving ? '...' : 'Send'}</Typography></Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  </Modal>
);

const Home = () => {
  const [feedPosts, setFeedPosts] = useState(posts);
  const [activePost, setActivePost] = useState<HomePost | null>(null);
  const [comments, setComments] = useState<HomeComment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentsError, setCommentsError] = useState<string | null>(null);
  const [commentDraft, setCommentDraft] = useState('');
  const [commentSaving, setCommentSaving] = useState(false);

  const toggleLike = async (post: HomePost) => {
    const nextLiked = !post.likedByViewer;
    setFeedPosts(current => current.map(item => item.id === post.id ? {...item, likedByViewer: nextLiked, likes: item.likes + (nextLiked ? 1 : -1)} : item));
    try {
      if (nextLiked) await likePost(post.id); else await unlikePost(post.id);
    } catch (error) {
      setFeedPosts(current => current.map(item => item.id === post.id ? {...item, likedByViewer: !nextLiked, likes: item.likes + (nextLiked ? -1 : 1)} : item));
      Alert.alert('Could not update like', messageOf(error));
    }
  };

  const openComments = async (post: HomePost) => {
    setActivePost(post);
    setComments([]);
    setCommentsError(null);
    setCommentDraft('');
    setCommentsLoading(true);
    try {setComments(await getPostComments(post.id));}
    catch (error) {setCommentsError(messageOf(error));}
    finally {setCommentsLoading(false);}
  };

  const submitComment = async () => {
    if (!activePost || !commentDraft.trim() || commentSaving) return;
    const body = commentDraft.trim();
    setCommentSaving(true);
    try {
      const comment = await addPostComment(activePost.id, body);
      setComments(current => [...current, comment]);
      setFeedPosts(current => current.map(item => item.id === activePost.id ? {...item, comments: (item.comments ?? 0) + 1} : item));
      setActivePost(current => current ? {...current, comments: (current.comments ?? 0) + 1} : current);
      setCommentDraft('');
    } catch (error) {setCommentsError(messageOf(error));}
    finally {setCommentSaving(false);}
  };

  return <SafeAreaView className="flex-1 bg-background" edges={['top']}>
    <FlatList
      data={feedPosts}
      keyExtractor={item => item.id}
      renderItem={({item}) => <PostCard {...item as PostCardData} onToggleLike={() => toggleLike(item)} onOpenComments={() => openComments(item)} />}
      showsVerticalScrollIndicator={false}
      contentContainerClassName="px-5 pb-[110px]"
      ItemSeparatorComponent={PostSeparator}
      ListHeaderComponent={(
        <View className="flex-row items-center justify-between pt-[21px] pb-[20px]">
          <View>
            <Typography size={28} color={Colors.text} fontWeight="500" className="tracking-[-1px]">Hiva chat</Typography>
            <Typography size={13} color={Colors.primary} fontWeight="600" className="mt-1 tracking-[2px]">FOR YOU</Typography>
          </View>
          <View className="flex-row items-center">
            <Pressable accessibilityRole="button" accessibilityLabel="Create a post" className="mr-[8px] rounded-full bg-primary px-[12px] py-[7px] active:opacity-70">
              <Typography size={14} color={Colors.iconDark} fontWeight="700">Post +</Typography>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Search" className="p-[5px] active:opacity-70">
              <AppIcon name="search" size={24} />
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Notifications" className="ml-[5px] p-[5px] active:opacity-70">
              <AppIcon name="bell" size={27} />
            </Pressable>
          </View>
        </View>
      )}
    />
    <CommentsModal visible={activePost !== null} post={activePost} comments={comments} loading={commentsLoading} error={commentsError} draft={commentDraft} saving={commentSaving} onChangeDraft={setCommentDraft} onClose={() => setActivePost(null)} onSubmit={submitComment} />
  </SafeAreaView>;
};

export default Home;
