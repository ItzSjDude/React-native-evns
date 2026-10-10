import React from 'react';
import {Pressable, Text} from 'react-native';
import {useFollowToggle, useIsFollowing} from '../users';

/**
 * "Follow" beside a post author, like the feed design. Shown only for other people you don't follow yet;
 * once followed it disappears (unfollow lives on their profile). Uses the shared follow store, so the
 * viewer's following list is fetched once per session rather than once per post.
 */
export default function PostFollowButton({authorId, viewerId, onFailure}: {authorId: string; viewerId: string | null; onFailure?: (error: unknown) => void}) {
  const isSelf = !viewerId || viewerId === authorId;
  const known = useIsFollowing(authorId, viewerId, !isSelf);
  const {following, pending, toggle} = useFollowToggle(authorId, {following: known}, onFailure);
  if (isSelf || known === null || following !== false) return null;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Follow ${authorId}`} disabled={pending} onPress={toggle} hitSlop={8}
      className="mr-1 h-8 justify-center px-2 active:opacity-60">
      <Text className="font-body-bold text-[15px] text-primary">Follow</Text>
    </Pressable>
  );
}
