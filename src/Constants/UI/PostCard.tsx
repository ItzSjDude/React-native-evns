import React, {useState} from 'react';
import {Image, Pressable, ScrollView, Text, useWindowDimensions, View} from 'react-native';
import IconDots from '@tabler/icons-react-native/IconDots';
import IconFlag from '@tabler/icons-react-native/IconFlag';
import IconHeart from '@tabler/icons-react-native/IconHeart';
import IconHeartFilled from '@tabler/icons-react-native/IconHeartFilled';
import IconMessageCircle from '@tabler/icons-react-native/IconMessageCircle';
import IconSend from '@tabler/icons-react-native/IconSend';
import IconTrash from '@tabler/icons-react-native/IconTrash';
import BottomSheet, {SheetButton, SheetRow, SheetSection} from '../../components/BottomSheet';
import {Colors} from '../Colors';

export type PostCardData = {
  id: string;
  author: string;
  authorAvatarUrl?: string | null;
  time: string;
  content: string;
  likes: number;
  comments?: number;
  shares?: number;
  images?: string[];
  likedByViewer?: boolean;
  /** Optimistic post still being created: actions are disabled. */
  pending?: boolean;
  /** Viewer is the author, so the options menu offers delete. */
  canDelete?: boolean;
};

type PostCardProps = PostCardData & {
  onToggleLike?: () => void;
  onOpenComments?: () => void;
  onDelete?: () => void;
  /** Opens the author's profile; the header is plain text when omitted. */
  onPressAuthor?: () => void;
  /** Sends a report for this post with the chosen reason. */
  onReport?: (reason: string) => void;
  onShare?: () => void;
  /** Rendered between the author and the ⋯ menu, e.g. a Follow button. */
  headerAction?: React.ReactNode;
  /** The signed-in user, shown beside the "Add a reply…" prompt. */
  viewerName?: string;
  viewerAvatarUrl?: string | null;
};

const initialsOf = (name: string) => name.trim().split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase() || '?';

const Avatar = ({name, url, size = 38}: {name: string; url?: string | null; size?: number}) => url
  ? <Image source={{uri: url}} accessibilityLabel={`${name}'s avatar`} style={{width: size, height: size, borderRadius: size / 2}} className="bg-primary-dark" />
  : <View style={{width: size, height: size, borderRadius: size / 2}} className="items-center justify-center bg-primary-dark">
    <Text style={{fontSize: size * 0.34}} className="font-body-bold text-purple-soft">{initialsOf(name)}</Text>
  </View>;

const REPORT_REASONS = ['Spam', 'Hate or harassment', 'Nudity or sexual content', 'Violence', 'False information'];

/** One sheet with steps so confirmation and reasons never stack a second modal over the first. */
const PostOptionsSheet = ({visible, confirming, reporting, canDelete, onClose, onConfirmStep, onReportStep, onDelete, onReport}: {
  visible: boolean; confirming: boolean; reporting: boolean; canDelete: boolean; onClose: () => void; onConfirmStep: () => void;
  onReportStep: () => void; onDelete?: () => void; onReport?: (reason: string) => void;
}) => (
  <BottomSheet
    visible={visible}
    onClose={onClose}
    title={confirming ? 'Delete this post?' : reporting ? 'Report post' : 'Post options'}
    subtitle={confirming ? "It will be removed from the feed for everyone. This can't be undone." : reporting ? 'Reports are private. Pick what fits best.' : null}>
    {reporting ? (
      <SheetSection>
        {REPORT_REASONS.map(reason => <SheetRow key={reason} label={reason} chevron onPress={() => { onClose(); onReport?.(reason); }} />)}
      </SheetSection>
    ) : confirming ? (
      <>
        <SheetButton label="Delete post" variant="destructive" onPress={() => { onClose(); onDelete?.(); }} />
        <SheetButton label="Cancel" variant="ghost" onPress={onClose} />
      </>
    ) : (
      <SheetSection>
        {canDelete && <SheetRow icon={IconTrash} label="Delete post" destructive onPress={onConfirmStep} />}
        {!canDelete && onReport && <SheetRow icon={IconFlag} label="Report" accessibilityLabel="Report post" chevron onPress={onReportStep} />}
      </SheetSection>
    )}
  </BottomSheet>
);

const ActionButton = ({icon: Icon, label, count, color, accessibilityLabel, onPress, disabled}: {
  icon: typeof IconHeart; label?: string; count?: number; color: string; accessibilityLabel: string; onPress?: () => void; disabled?: boolean;
}) => (
  <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} accessibilityState={{disabled: !!disabled}} disabled={disabled} onPress={onPress}
    className="h-12 flex-row items-center gap-2 px-4 active:opacity-60">
    <Icon size={22} color={color} />
    {!!label && <Text className="font-body-semibold text-[15px] text-foreground">{label}</Text>}
    {!!count && <Text className="font-body-semibold text-[13px] text-muted">{count}</Text>}
  </Pressable>
);

const PostCard = ({author, authorAvatarUrl, time, content, likes, likedByViewer = false, comments = 0, images = [], pending = false, canDelete = false,
  onToggleLike, onOpenComments, onDelete, onPressAuthor, onReport, onShare, headerAction, viewerName = 'Me', viewerAvatarUrl}: PostCardProps) => {
  const {width: screenWidth} = useWindowDimensions();
  const [menuVisible, setMenuVisible] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [activeImage, setActiveImage] = useState(0);
  const mediaWidth = screenWidth - 40;
  const hasMedia = images.length > 0;
  const caption = !!content && (
    <Text selectable className={`px-5 font-body text-foreground ${hasMedia ? 'mt-3.5 text-[16px] leading-[23px]' : 'mt-3 text-[17px] leading-[25px]'}`}>{content}</Text>
  );

  return (
    <View className={`border-b border-border/60 pb-4 pt-4 ${pending ? 'opacity-60' : ''}`}>
      <View className="flex-row items-center px-5">
        <Pressable accessibilityRole={onPressAuthor ? 'button' : undefined} accessibilityLabel={onPressAuthor ? `View ${author}'s profile` : undefined}
          disabled={!onPressAuthor} onPress={onPressAuthor} className="min-w-0 flex-1 flex-row items-center active:opacity-70">
          <Avatar name={author} url={authorAvatarUrl} size={40} />
          <View className="ml-3 min-w-0 flex-1">
            <Text numberOfLines={1} className="font-body-bold text-[16px] text-foreground">{author}</Text>
            <Text className="mt-0.5 font-body text-[13px] text-muted">{time}</Text>
          </View>
        </Pressable>
        {headerAction}
        {!pending && (
          <Pressable accessibilityRole="button" accessibilityLabel="More post options" hitSlop={8} className="ml-1 h-10 w-10 items-center justify-center active:opacity-60"
            onPress={() => { setConfirmingDelete(false); setReporting(false); setMenuVisible(true); }}>
            <IconDots size={22} color={Colors.muted} />
          </Pressable>
        )}
      </View>

      {!hasMedia && caption}

      {hasMedia && (
        <View className="mx-5 mt-3.5 overflow-hidden rounded-[20px] bg-card">
          <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} onMomentumScrollEnd={event => setActiveImage(Math.round(event.nativeEvent.contentOffset.x / mediaWidth))}>
            {images.map((image, index) => (
              <Image key={`${image}-${index}`} source={{uri: image}} accessibilityLabel={`Post image ${index + 1}`} className="h-[270px]" style={{width: mediaWidth}} resizeMode="cover" />
            ))}
          </ScrollView>
          {images.length > 1 && (
            <View className="absolute bottom-[10px] left-0 right-0 flex-row justify-center">
              {images.map((image, index) => <View key={`${image}-dot`} className={`mx-[3px] h-[6px] w-[6px] rounded-full ${index === activeImage ? 'bg-white' : 'bg-white/45'}`} />)}
            </View>
          )}
        </View>
      )}

      <View className="mx-5 mt-3.5 flex-row items-center">
        <View className="flex-row items-center overflow-hidden rounded-2xl border border-border bg-card">
          <ActionButton icon={likedByViewer ? IconHeartFilled : IconHeart} label="Like" count={likes} color={likedByViewer ? Colors.coral : Colors.text}
            accessibilityLabel={likedByViewer ? 'Unlike post' : 'Like post'} onPress={onToggleLike} disabled={pending} />
          <View className="h-6 w-px bg-border" />
          <ActionButton icon={IconMessageCircle} label="Reply" count={comments} color={Colors.text} accessibilityLabel="View comments" onPress={onOpenComments} disabled={pending} />
          <View className="h-6 w-px bg-border" />
          <ActionButton icon={IconSend} color={Colors.text} accessibilityLabel="Share post" onPress={onShare} disabled={pending || !onShare} />
        </View>
      </View>

      {hasMedia && caption}

      {!pending && (
        <Pressable accessibilityRole="button" accessibilityLabel="Add a reply" onPress={onOpenComments} className="mx-5 mt-3.5 flex-row items-center gap-3 active:opacity-70">
          <Avatar name={viewerName} url={viewerAvatarUrl} size={34} />
          <Text className="font-body text-[15px] text-muted">Add a reply…</Text>
        </Pressable>
      )}

      <PostOptionsSheet visible={menuVisible} confirming={confirmingDelete} reporting={reporting} canDelete={canDelete && !!onDelete} onClose={() => setMenuVisible(false)}
        onConfirmStep={() => setConfirmingDelete(true)} onReportStep={() => setReporting(true)} onDelete={onDelete} onReport={onReport} />
    </View>
  );
};

export default PostCard;
