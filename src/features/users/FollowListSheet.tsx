import React, {useCallback, useEffect, useRef, useState} from 'react';
import {ActivityIndicator, Pressable, Text, View} from 'react-native';
import BottomSheet from '../../components/BottomSheet';
import {Colors} from '../../Constants/Colors';
import FollowButton from './FollowButton';
import {useFollowToggle, useIsFollowing, useViewerId} from './followState';
import {Avatar} from './UserProfileItems';
import {getFollowList, messageOf, statusOf} from './usersService';
import type {FollowListKind, FollowListUser} from './types';

export type FollowListSheetProps = {
  userId: string;
  kind: FollowListKind;
  visible: boolean;
  onClose: () => void;
  /** Tapping a person (not their follow button). */
  onOpenUser: (user: FollowListUser) => void;
  /** Whose list this is, for the subtitle, e.g. "Asha". */
  ownerName?: string;
};

type ListState = {items: FollowListUser[]; loading: boolean; error: string | null; unavailable: boolean; hasMore: boolean; offset: number; loaded: boolean};
const emptyList = (): ListState => ({items: [], loading: false, error: null, unavailable: false, hasMore: false, offset: 0, loaded: false});

const FollowRow = ({user, viewerId, onOpen}: {user: FollowListUser; viewerId: string | null | undefined; onOpen: () => void}) => {
  const self = !!viewerId && viewerId === user.id;
  const following = useIsFollowing(user.id, viewerId, !self);
  const follow = useFollowToggle(user.id, {following});
  return <View className="min-h-[64px] flex-row items-center gap-3 border-b border-sheet py-2">
    <Pressable accessibilityRole="button" accessibilityLabel={`Open ${user.name}'s profile`} onPress={onOpen} className="min-w-0 flex-1 flex-row items-center gap-3 active:opacity-70">
      <Avatar name={user.name} url={user.avatarUrl} size={44} />
      <View className="min-w-0 flex-1">
        <Text numberOfLines={1} className="text-[15px] font-bold text-foreground">{self ? 'You' : user.name}</Text>
        {!!user.handle && <Text numberOfLines={1} className="mt-0.5 text-[12px] text-muted">@{user.handle}</Text>}
        {!!follow.error && <Text numberOfLines={1} className="mt-0.5 text-[11px] text-coral">{follow.error}</Text>}
      </View>
    </Pressable>
    {!self && viewerId !== undefined && <FollowButton size="small" name={user.name} following={follow.following} pending={follow.pending} onPress={follow.toggle} />}
  </View>;
};

/** Paged followers/following list with a follow toggle per row. */
export default function FollowListSheet({userId, kind, visible, onClose, onOpenUser, ownerName}: FollowListSheetProps) {
  const viewerId = useViewerId();
  const [list, setList] = useState<ListState>(emptyList);
  const listRef = useRef(list);
  listRef.current = list;
  const generation = useRef(0);

  const load = useCallback(async (append: boolean) => {
    const current = listRef.current;
    if (current.loading) return;
    const request = generation.current;
    const offset = append ? current.offset : 0;
    setList(state => ({...state, loading: true, error: null}));
    try {
      const page = await getFollowList(userId, kind, offset);
      if (request !== generation.current) return;
      setList(state => ({
        items: append ? [...state.items, ...page.items.filter(item => !state.items.some(existing => existing.id === item.id))] : page.items,
        loading: false, error: null, unavailable: false, loaded: true,
        hasMore: page.hasMore, offset: page.offset + page.items.length,
      }));
    } catch (cause) {
      if (request !== generation.current) return;
      setList(state => ({...state, loading: false, loaded: true, unavailable: statusOf(cause) === 404, error: statusOf(cause) === 404 ? null : messageOf(cause)}));
    }
  }, [userId, kind]);

  useEffect(() => {
    generation.current++;
    const fresh = emptyList();
    listRef.current = fresh;
    setList(fresh);
    if (visible) load(false);
  }, [visible, userId, kind, load]);

  const title = kind === 'followers' ? 'Followers' : 'Following';
  const subtitle = ownerName ? (kind === 'followers' ? `People following ${ownerName}` : `People ${ownerName} follows`) : null;

  return <BottomSheet visible={visible} onClose={onClose} title={title} subtitle={subtitle} maxHeight={0.86}>
    {list.items.map(user => <FollowRow key={user.id} user={user} viewerId={viewerId} onOpen={() => onOpenUser(user)} />)}

    {list.loading && <ActivityIndicator accessibilityLabel={`Loading ${title.toLowerCase()}`} color={Colors.gold} className="my-6" />}

    {list.unavailable && <View className="items-center py-10">
      <Text className="text-[15px] font-extrabold text-foreground">This list isn't available</Text>
      <Text className="mt-1 text-center text-[13px] text-muted">The account may have been removed.</Text>
    </View>}

    {!!list.error && <Pressable accessibilityRole="button" accessibilityLabel="Retry loading list" onPress={() => load(list.items.length > 0)} className="my-3 rounded-[16px] bg-card p-4 active:opacity-70">
      <Text className="text-sm text-coral">{list.error} Tap to retry.</Text>
    </Pressable>}

    {list.loaded && !list.loading && !list.error && !list.unavailable && !list.items.length && <View className="items-center py-10">
      <Text className="text-[15px] font-extrabold text-foreground">{kind === 'followers' ? 'No followers yet' : 'Not following anyone yet'}</Text>
    </View>}

    {!list.loading && !list.error && list.hasMore && list.items.length > 0 && <Pressable accessibilityRole="button" accessibilityLabel="Load more" onPress={() => load(true)} className="items-center p-[15px] active:opacity-70">
      <Text className="text-sm font-extrabold text-gold">Load more</Text>
    </Pressable>}
  </BottomSheet>;
}
