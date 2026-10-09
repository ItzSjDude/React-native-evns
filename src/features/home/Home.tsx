import React, {useCallback, useEffect, useRef, useState} from 'react';
import {ActivityIndicator, Alert, FlatList, Pressable, RefreshControl, Share, Text, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {cssInterop} from 'nativewind';
import {Colors} from '../../Constants/Colors';
import AppIcon from '../../Constants/Icons';
import Typography from '../../Constants/Typography';
import PostCard from '../../Constants/UI/PostCard';
import {loadSession} from '../auth';
import CommentsSheet from './CommentsSheet';
import ComposePostSheet from './ComposePostSheet';
import {messageOf, toPostCardData} from './homePresentation';
import {createPost, deletePost, getFeedPage, getPost, likePost, reportPost, unlikePost, type FeedScope} from './homeService';
import PostFollowButton from './PostFollowButton';
import {FeedColors} from './feedTheme';
import {useSavedPosts} from './savedPosts';
import {UserProfileModal, type UserPreview} from '../users';
import {SearchScreen} from '../search';
import {EventDetailSheet, EventsScreen} from '../events';
import IconCalendarEvent from '@tabler/icons-react-native/IconCalendarEvent';
import {NotificationsBell, useNotificationNavigator} from '../notifications';
import {useNavigation} from '@react-navigation/native';
import {getPartyRoom, PartyRoomPreview, usePartySession, type PartyRoom} from '../party';
import IconSearch from '@tabler/icons-react-native/IconSearch';
import IconArrowDown from '@tabler/icons-react-native/IconArrowDown';
import IconPlus from '@tabler/icons-react-native/IconPlus';
import type {ApiPostMedia, HomePost} from './types';

cssInterop(SafeAreaView, {className: 'style'});

type Viewer = {id: string; name: string; avatarUrl: string | null};
type LoadMode = 'initial' | 'refresh' | 'more';

const VIEWABILITY = {itemVisiblePercentThreshold: 50};
/** The part of FlatList's viewability callback this screen reads. */
type ViewableChange = {viewableItems: {index?: number | null}[]};

const Home = () => {
  const [posts, setPosts] = useState<HomePost[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [moreError, setMoreError] = useState<string | null>(null);
  const [viewer, setViewer] = useState<Viewer | null>(null);
  const [commentsPost, setCommentsPost] = useState<HomePost | null>(null);
  const [commentsVisible, setCommentsVisible] = useState(false);
  const [composeVisible, setComposeVisible] = useState(false);
  const [composeDraft, setComposeDraft] = useState('');
  const [composeError, setComposeError] = useState<string | null>(null);
  const [scope, setScope] = useState<FeedScope>('all');
  const scopeRef = useRef<FeedScope>('all');
  const [topIndex, setTopIndex] = useState(0);
  const {saved: savedPosts, toggle: toggleSaved} = useSavedPosts();
  const listRef = useRef<FlatList<HomePost>>(null);
  const request = useRef(0);
  const moreInFlight = useRef(false);
  const likesInFlight = useRef(new Set<string>());

  const load = useCallback(async (mode: LoadMode, cursor?: string | null) => {
    const append = mode === 'more';
    if (append && moreInFlight.current) return;
    const id = append ? request.current : ++request.current;
    if (append) {
      moreInFlight.current = true;
      setLoadingMore(true);
      setMoreError(null);
    } else {
      if (mode === 'initial') setLoading(true);
      setError(null);
      setMoreError(null);
    }
    try {
      const page = await getFeedPage(append ? cursor : null, undefined, scopeRef.current);
      if (id !== request.current) return;
      setPosts(current => append
        ? [...current, ...page.posts.filter(post => !current.some(item => item.id === post.id))]
        // Keep optimistic posts that are still uploading at the top across a refresh.
        : [...current.filter(post => post.pending), ...page.posts]);
      setNextCursor(page.nextCursor);
      setHasMore(page.hasMore && page.nextCursor !== null);
    } catch (cause) {
      if (id !== request.current) return;
      // A server without the Following filter rejects the unknown query param with a 400.
      const unsupported = scopeRef.current === 'following' && (cause as {status?: number})?.status === 400;
      const message = unsupported ? 'The Following feed isn’t available on this server yet.' : messageOf(cause);
      if (append) setMoreError(message); else setError(message);
    } finally {
      if (id === request.current) { setLoading(false); setRefreshing(false); setLoadingMore(false); }
      if (append) moreInFlight.current = false;
    }
  }, []);

  useEffect(() => {
    load('initial');
    const requestRef = request;
    return () => {requestRef.current++;};
  }, [load]);

  useEffect(() => {
    let mounted = true;
    loadSession().then(session => {
      if (mounted && session?.user) setViewer({id: session.user.id, name: session.user.name || 'You', avatarUrl: session.user.avatar_url ?? null});
    }).catch(() => {});
    return () => {mounted = false;};
  }, []);

  const updatePost = (postId: string, update: (post: HomePost) => HomePost) =>
    setPosts(current => current.map(post => post.id === postId ? update(post) : post));

  const toggleLike = async (post: HomePost) => {
    if (post.pending || likesInFlight.current.has(post.id)) return;
    likesInFlight.current.add(post.id);
    const nextLiked = !post.likedByViewer;
    updatePost(post.id, item => ({...item, likedByViewer: nextLiked, likes: Math.max(0, item.likes + (nextLiked ? 1 : -1))}));
    try {
      const reactions = nextLiked ? await likePost(post.id) : await unlikePost(post.id);
      // The server returns the authoritative count, which may include other people's likes.
      if (reactions) updatePost(post.id, item => ({...item, likedByViewer: reactions.viewerHasLiked, likes: reactions.likeCount}));
    } catch (cause) {
      updatePost(post.id, item => ({...item, likedByViewer: post.likedByViewer, likes: post.likes}));
      Alert.alert('Could not update like', messageOf(cause));
    } finally {
      likesInFlight.current.delete(post.id);
    }
  };

  const openComments = (post: HomePost) => {
    setCommentsPost(post);
    setCommentsVisible(true);
  };

  const changeCommentCount = useCallback((postId: string, delta: number) => {
    setPosts(current => current.map(post => post.id === postId ? {...post, comments: Math.max(0, post.comments + delta)} : post));
  }, []);

  const openCompose = () => {
    setComposeError(null);
    setComposeVisible(true);
  };

  const [viewing, setViewing] = useState<{id: string; initial: UserPreview} | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [eventId, setEventId] = useState<string | null>(null);
  const [eventsOpen, setEventsOpen] = useState(false);
  const navigation = useNavigation<{navigate: (route: string) => void}>();
  // Taps on pushes and notification rows: open a person's profile or the Chat tab; anything else falls back to the notifications sheet.
  useNotificationNavigator(target => {
    if (target.kind === 'user' && 'id' in target) {setViewing({id: target.id, initial: {name: 'Hiva user', avatarUrl: null}}); return true;}
    if (target.kind === 'conversation') {navigation.navigate('Chat'); return true;}
    if (target.kind === 'event' && 'id' in target) {setEventId(target.id); return true;}
    if (target.kind === 'party' && 'id' in target) {
      getPartyRoom(target.id).then(snapshot => setPreviewRoom(snapshot.party)).catch(() => Alert.alert('Room not available', 'This party has ended or is no longer open.'));
      return true;
    }
    if (target.kind === 'post' && 'id' in target) {
      getPost(target.id).then(openComments).catch(() => Alert.alert('Post not available', 'This post was removed or you can no longer see it.'));
      return true;
    }
    return false;
  });
  const [previewRoom, setPreviewRoom] = useState<PartyRoom | null>(null);
  const {session: partySession, open: openParty, expand: expandParty, promptActiveParty} = usePartySession();

  const submitPost = async (body: string, media: ApiPostMedia[] = []) => {
    const tempId = `local-${Date.now()}`;
    const optimistic: HomePost = {
      id: tempId, authorId: viewer?.id ?? '', author: viewer?.name ?? 'You', authorAvatarUrl: viewer?.avatarUrl ?? null,
      createdAt: new Date().toISOString(), content: body, images: media.map(item => item.url), likes: 0, likedByViewer: false, comments: 0, shares: 0, pending: true,
    };
    setComposeVisible(false);
    setComposeDraft('');
    setComposeError(null);
    setPosts(current => [optimistic, ...current]);
    listRef.current?.scrollToOffset({offset: 0, animated: true});
    try {
      const created = await createPost(body, media);
      setPosts(current => current.map(post => post.id === tempId ? created : post));
    } catch (cause) {
      setPosts(current => current.filter(post => post.id !== tempId));
      // Hand the text back so nothing the user typed is lost.
      setComposeDraft(body);
      setComposeError(`Your post wasn't shared. ${messageOf(cause)}`);
      setComposeVisible(true);
    }
  };

  const removePost = async (post: HomePost) => {
    const index = posts.findIndex(item => item.id === post.id);
    setPosts(current => current.filter(item => item.id !== post.id));
    if (commentsPost?.id === post.id) setCommentsVisible(false);
    try {
      await deletePost(post.id);
    } catch (cause) {
      setPosts(current => {
        if (current.some(item => item.id === post.id)) return current;
        const next = [...current];
        next.splice(Math.min(Math.max(index, 0), next.length), 0, post);
        return next;
      });
      Alert.alert('Could not delete post', messageOf(cause));
    }
  };

  const report = async (post: HomePost, reason: string) => {
    try {
      await reportPost(post.id, reason);
      Alert.alert('Report received', 'Thanks for helping keep Hiva safe. Our team will review it.');
    } catch (cause) {Alert.alert('Could not send report', messageOf(cause));}
  };

  const changeScope = (next: FeedScope) => {
    if (next === scopeRef.current) return;
    scopeRef.current = next;
    setScope(next);
    setPosts([]);
    setNextCursor(null);
    setHasMore(false);
    setTopIndex(0);
    load('initial');
  };

  const sharePost = (post: HomePost) => {
    Share.share({message: `${post.author}: ${post.content || 'Check out this post on Hiva'}`}).catch(() => {});
  };

  const onViewableItemsChanged = useRef(({viewableItems}: ViewableChange) => {
    const first = viewableItems.find(item => item.index !== null && item.index !== undefined);
    if (first && first.index !== null && first.index !== undefined) setTopIndex(first.index);
  }).current;

  const nextPost = () => {
    const index = Math.min(topIndex + 1, posts.length - 1);
    listRef.current?.scrollToIndex({index, animated: true});
  };

  const refresh = () => {
    setRefreshing(true);
    load('refresh');
  };

  const loadMore = () => {
    if (hasMore && nextCursor && !loading && !refreshing && !moreError) load('more', nextCursor);
  };

  const topBar = (
    <View>
      <View className="flex-row items-center justify-between px-[19px] pb-1 pt-3">
        <Text accessibilityRole="header" className="font-display-semibold text-[27px] tracking-[-0.8px] text-feed-text">hiva<Text className="text-feed-accent">.</Text></Text>
        <View className="flex-row items-center">
          <Pressable accessibilityRole="button" accessibilityLabel="Events" onPress={() => setEventsOpen(true)} hitSlop={4} className="h-11 w-11 items-center justify-center active:opacity-60">
            <IconCalendarEvent size={23} color={FeedColors.label} />
          </Pressable>
          <NotificationsBell dot size={23} color={FeedColors.label} />
        </View>
      </View>
      <View className="flex-row items-end justify-between border-b border-feed-line px-[19px]">
        <View accessibilityRole="tablist" className="flex-row gap-[26px]">
          {([['all', 'For you'], ['following', 'Following']] as const).map(([key, label]) => {
            const selected = scope === key;
            return <Pressable key={key} accessibilityRole="tab" accessibilityState={{selected}} onPress={() => changeScope(key)} className="pb-3 pt-2 active:opacity-70">
              <Text className={`font-body-semibold text-[17px] ${selected ? 'text-feed-text' : 'text-feed-muted'}`}>{label}</Text>
              {selected && <View className="absolute -bottom-px left-0 right-0 h-[2px] rounded-full bg-feed-accent" />}
            </Pressable>;
          })}
        </View>
        {/* Not in the feed design, but search and posting need an entry point; they sit in the tab row's free space. */}
        <View className="flex-row items-center pb-1">
          <Pressable accessibilityRole="button" accessibilityLabel="Search" onPress={() => setSearchOpen(true)} hitSlop={4} className="h-10 w-10 items-center justify-center active:opacity-60">
            <IconSearch size={21} color={FeedColors.muted} />
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Create a post" onPress={openCompose} hitSlop={4} className="h-10 w-10 items-center justify-center active:opacity-60">
            <IconPlus size={22} color={FeedColors.accent} />
          </Pressable>
        </View>
      </View>
    </View>
  );

  const listHeader = error && posts.length > 0 ? (
    <Pressable accessibilityRole="button" accessibilityLabel="Retry refreshing feed" onPress={refresh} className="mx-[19px] mt-3 rounded-[14px] bg-coral/10 px-[14px] py-[10px] active:opacity-70">
      <Typography size={13} color={Colors.coral}>Couldn't refresh the feed. Tap to retry.</Typography>
    </Pressable>
  ) : null;

  const empty = loading ? (
    <View className="items-center pt-16"><ActivityIndicator accessibilityLabel="Loading feed" color={Colors.primary} /></View>
  ) : error ? (
    <View className="items-center px-6 pt-16">
      <Typography size={16} color={Colors.text} fontWeight="600" className="text-center">Couldn't load your feed</Typography>
      <Typography size={14} color={Colors.muted} className="mt-2 text-center">{error}</Typography>
      <Pressable accessibilityRole="button" accessibilityLabel="Retry loading feed" onPress={() => load('initial')} className="mt-5 rounded-full bg-gold px-5 py-[10px] active:opacity-70">
        <Typography size={14} color={Colors.textDark} fontWeight="700">Try again</Typography>
      </Pressable>
    </View>
  ) : (
    <View className="items-center px-6 pt-16">
      <AppIcon name="comment" size={44} color={Colors.muted} filled={false} />
      <Typography size={16} color={Colors.text} fontWeight="600" className="mt-4 text-center">{scope === 'following' ? 'Nothing here yet' : 'No posts yet'}</Typography>
      <Typography size={14} color={Colors.muted} className="mt-2 text-center">{scope === 'following' ? 'Follow people and their posts will show up here.' : 'Be the first to share something with everyone.'}</Typography>
    </View>
  );

  const footer = loadingMore ? <ActivityIndicator className="my-4" color={Colors.primary} /> : moreError ? (
    <Pressable accessibilityRole="button" accessibilityLabel="Retry loading more posts" onPress={() => load('more', nextCursor)} className="my-4 items-center active:opacity-70">
      <Typography size={13} color={Colors.coral}>Couldn't load more posts. Tap to retry.</Typography>
    </Pressable>
  ) : undefined;

  const viewerId = viewer?.id ?? null;
  return <SafeAreaView className="flex-1 bg-feed-bg" edges={['top']}>
    {topBar}
    <FlatList
      ref={listRef}
      data={posts}
      extraData={viewerId}
      keyExtractor={item => item.id}
      renderItem={({item}) => <PostCard {...toPostCardData(item, viewerId)} onToggleLike={() => toggleLike(item)} onOpenComments={() => openComments(item)} onDelete={() => removePost(item)}
        onReport={reason => report(item, reason)} onShare={() => sharePost(item)} viewerName={viewer?.name} viewerAvatarUrl={viewer?.avatarUrl}
        saved={savedPosts.has(item.id)} onToggleSave={() => toggleSaved(item.id)}
        headerAction={item.authorId && !item.pending ? <PostFollowButton authorId={item.authorId} viewerId={viewerId} /> : undefined}
        onPressAuthor={item.authorId && !item.pending ? () => setViewing({id: item.authorId, initial: {name: item.author, avatarUrl: item.authorAvatarUrl ?? null}}) : undefined} />}
      showsVerticalScrollIndicator={false}
      contentContainerClassName="pb-[130px]"
      ListHeaderComponent={listHeader ?? undefined}
      ListEmptyComponent={empty}
      ListFooterComponent={footer}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={FeedColors.accent} colors={[FeedColors.accent]} />}
      onEndReached={loadMore}
      onEndReachedThreshold={0.5}
      onViewableItemsChanged={onViewableItemsChanged}
      viewabilityConfig={VIEWABILITY}
      onScrollToIndexFailed={({index, averageItemLength}) => listRef.current?.scrollToOffset({offset: index * averageItemLength, animated: true})}
    />
    {posts.length > 1 && topIndex < posts.length - 1 && (
      <Pressable accessibilityRole="button" accessibilityLabel="Next post" onPress={nextPost}
        className="absolute bottom-[112px] h-[44px] w-[44px] items-center justify-center self-center rounded-full border border-feed-line bg-feed-card shadow-lg active:opacity-70">
        <IconArrowDown size={21} color={FeedColors.label} />
      </Pressable>
    )}
    <CommentsSheet visible={commentsVisible} post={commentsPost} viewerId={viewerId} onClose={() => setCommentsVisible(false)} onCountChange={changeCommentCount} />
    <ComposePostSheet visible={composeVisible} draft={composeDraft} error={composeError} onChangeDraft={setComposeDraft} onClose={() => setComposeVisible(false)} onSubmit={submitPost} />
    <EventsScreen visible={eventsOpen} onClose={() => setEventsOpen(false)} />
    <EventDetailSheet eventId={eventId} visible={!!eventId} onClose={() => setEventId(null)} />
    <SearchScreen visible={searchOpen} onClose={() => setSearchOpen(false)} onOpenParty={(_id, room) => {setSearchOpen(false); setPreviewRoom(room);}} />
    {previewRoom && <PartyRoomPreview room={previewRoom} activePartyId={partySession?.party.id}
      onClose={() => setPreviewRoom(null)} onResume={() => {setPreviewRoom(null); expandParty();}}
      onBlocked={() => promptActiveParty(() => setPreviewRoom(null))}
      onJoined={next => {setPreviewRoom(null); openParty(next);}} />}
    {viewing && <UserProfileModal userId={viewing.id} initial={viewing.initial} visible onClose={() => setViewing(null)}
      onBlocked={id => {setViewing(null); setPosts(current => current.filter(post => post.authorId !== id));}} />}
  </SafeAreaView>;
};

export default Home;
