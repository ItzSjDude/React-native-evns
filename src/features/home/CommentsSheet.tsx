import React, {useCallback, useEffect, useRef, useState} from 'react';
import {ActivityIndicator, Image, Pressable, TextInput, View} from 'react-native';
import BottomSheet from '../../components/BottomSheet';
import {Colors} from '../../Constants/Colors';
import Typography from '../../Constants/Typography';
import {formatRelativeTime, messageOf} from './homePresentation';
import {addPostComment, deletePostComment, getPostComments} from './homeService';
import {COMMENT_BODY_MAX_LENGTH, type HomeComment, type HomePost} from './types';

type CommentsSheetProps = {
  visible: boolean;
  /** Kept set while the sheet animates out so its content doesn't blank. */
  post: HomePost | null;
  viewerId: string | null;
  onClose: () => void;
  /** Keeps the feed's comment count in sync with adds/deletes made here. */
  onCountChange: (postId: string, delta: number) => void;
};

const CommentAvatar = ({name, url}: {name: string; url: string | null}) => url
  ? <Image source={{uri: url}} accessibilityLabel={`${name}'s avatar`} className="h-[35px] w-[35px] rounded-full bg-[#453E60]" />
  : (
    <View className="h-[35px] w-[35px] items-center justify-center rounded-full bg-[#453E60]">
      <Typography size={14} color={Colors.text} fontWeight="700">{(name || '?').slice(0, 1).toUpperCase()}</Typography>
    </View>
  );

const CommentsSheet = ({visible, post, viewerId, onClose, onCountChange}: CommentsSheetProps) => {
  const postId = post?.id ?? null;
  const [comments, setComments] = useState<HomeComment[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const request = useRef(0);

  const load = useCallback(async (id: string, offset: number) => {
    const token = offset === 0 ? ++request.current : request.current;
    if (offset === 0) setLoading(true); else setLoadingMore(true);
    setLoadError(null);
    try {
      const page = await getPostComments(id, offset);
      if (token !== request.current) return;
      setComments(current => offset === 0 ? page.items : [...current, ...page.items.filter(item => !current.some(existing => existing.id === item.id))]);
      setHasMore(page.hasMore);
    } catch (error) {
      if (token === request.current) setLoadError(messageOf(error));
    } finally {
      if (token === request.current) { setLoading(false); setLoadingMore(false); }
    }
  }, []);

  useEffect(() => {
    if (!visible || !postId) {
      request.current++;
      return;
    }
    setComments([]);
    setHasMore(false);
    setLoadingMore(false);
    setDraft('');
    setActionError(null);
    setLoadError(null);
    load(postId, 0);
  }, [load, postId, visible]);

  const submit = async () => {
    const body = draft.trim();
    if (!postId || !body || saving) return;
    setSaving(true);
    setActionError(null);
    try {
      const comment = await addPostComment(postId, body);
      setComments(current => [...current.filter(item => item.id !== comment.id), comment]);
      onCountChange(postId, 1);
      setDraft('');
    } catch (error) {
      setActionError(messageOf(error));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (comment: HomeComment) => {
    if (!postId) return;
    const index = comments.findIndex(item => item.id === comment.id);
    setActionError(null);
    setComments(current => current.filter(item => item.id !== comment.id));
    onCountChange(postId, -1);
    try {
      await deletePostComment(postId, comment.id);
    } catch (error) {
      setComments(current => {
        if (current.some(item => item.id === comment.id)) return current;
        const next = [...current];
        next.splice(Math.min(Math.max(index, 0), next.length), 0, comment);
        return next;
      });
      onCountChange(postId, 1);
      setActionError(`Could not delete comment. ${messageOf(error)}`);
    }
  };

  const remaining = COMMENT_BODY_MAX_LENGTH - draft.length;
  const footer = (
    <View>
      {actionError ? <Typography size={13} color={Colors.coral} className="mb-[8px]">{actionError}</Typography> : null}
      <View className="flex-row items-end rounded-[16px] border border-border-muted bg-background px-[12px] py-[7px]">
        <TextInput accessibilityLabel="New comment" value={draft} onChangeText={setDraft} placeholder="Write a comment..." placeholderTextColor={Colors.muted} multiline maxLength={COMMENT_BODY_MAX_LENGTH} className="max-h-[90px] min-h-[38px] flex-1 px-[2px] text-[15px] text-foreground" />
        <Pressable accessibilityRole="button" accessibilityLabel="Add comment" accessibilityState={{disabled: saving || !draft.trim(), busy: saving}} disabled={saving || !draft.trim()} onPress={submit} className={`ml-[8px] rounded-full bg-gold px-[13px] py-[9px] active:opacity-70 ${saving || !draft.trim() ? 'opacity-50' : ''}`}>
          <Typography size={13} color={Colors.textDark} fontWeight="700">{saving ? '...' : 'Send'}</Typography>
        </Pressable>
      </View>
      {remaining <= 50 ? <Typography size={11} color={remaining <= 0 ? Colors.coral : Colors.muted} className="mt-[4px] text-right">{remaining} characters left</Typography> : null}
    </View>
  );

  return (
    <BottomSheet visible={visible && post !== null} onClose={onClose} title="Comments" subtitle={post ? `${post.author}'s post` : null} footer={footer} maxHeight={0.78}>
      {loading ? <ActivityIndicator accessibilityLabel="Loading comments" color={Colors.primary} className="my-[30px]" /> : null}
      {!loading && loadError ? (
        <View className="items-center py-[20px]">
          <Typography size={14} color={Colors.coral} className="text-center">{loadError}</Typography>
          <Pressable accessibilityRole="button" accessibilityLabel="Retry loading comments" onPress={() => postId && load(postId, comments.length)} className="mt-[10px] rounded-full bg-card px-[14px] py-[8px] active:opacity-70">
            <Typography size={13} color={Colors.primary} fontWeight="600">Retry</Typography>
          </Pressable>
        </View>
      ) : null}
      {!loading && !loadError && comments.length === 0 ? <Typography size={14} color={Colors.muted} className="py-[28px] text-center">No comments yet. Be the first to comment.</Typography> : null}
      {comments.map(item => (
        <View key={item.id} className="mb-[14px] flex-row">
          <CommentAvatar name={item.author.name} url={item.author.avatarUrl} />
          <View className="ml-[10px] flex-1 rounded-[14px] bg-[#252235] px-[12px] py-[9px]">
            <View className="flex-row items-center">
              <Typography size={13} color={Colors.text} fontWeight="600" className="shrink">{item.author.name}</Typography>
              <Typography size={11} color={Colors.muted} className="ml-[6px] flex-1">{formatRelativeTime(item.createdAt)}</Typography>
              {viewerId !== null && item.author.id === viewerId ? (
                <Pressable accessibilityRole="button" accessibilityLabel="Delete comment" hitSlop={8} onPress={() => remove(item)} className="ml-[6px] active:opacity-70">
                  <Typography size={12} color={Colors.coral} fontWeight="600">Delete</Typography>
                </Pressable>
              ) : null}
            </View>
            <Typography size={14} color={Colors.textBody} className="mt-[3px]">{item.body}</Typography>
          </View>
        </View>
      ))}
      {!loading && hasMore && !loadError ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Load more comments" disabled={loadingMore} onPress={() => postId && load(postId, comments.length)} className="mb-[10px] items-center py-[8px] active:opacity-70">
          {loadingMore ? <ActivityIndicator color={Colors.primary} /> : <Typography size={13} color={Colors.primary} fontWeight="600">Load more comments</Typography>}
        </Pressable>
      ) : null}
    </BottomSheet>
  );
};

export default CommentsSheet;
