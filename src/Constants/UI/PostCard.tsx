import React, {useState} from 'react';
import {Image, Pressable, ScrollView, useWindowDimensions, View} from 'react-native';
import IconFlag from '@tabler/icons-react-native/IconFlag';
import IconTrash from '@tabler/icons-react-native/IconTrash';
import BottomSheet, {SheetButton, SheetRow, SheetSection} from '../../components/BottomSheet';
import {Colors} from '../Colors';
import AppIcon from '../Icons';
import Typography from '../Typography';

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
};

const Avatar = ({name, url}: {name: string; url?: string | null}) => url
  ? <Image source={{uri: url}} accessibilityLabel={`${name}'s avatar`} className="h-[43px] w-[43px] rounded-[22px] bg-[#77717C]" />
  : (
    <View className="h-[43px] w-[43px] items-center justify-center rounded-[22px] bg-[#77717C]">
      <AppIcon name="user" size={24} color={Colors.iconDark} />
    </View>
  );

const StatButton = ({icon, count, color = Colors.muted, filled = false, onPress, label, disabled}: {icon: 'heart' | 'comment'; count: number; color?: string; filled?: boolean; onPress?: () => void; label: string; disabled?: boolean}) => (
  <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{disabled: !!disabled}} disabled={disabled} onPress={onPress} className="mr-[8px] flex-row items-center rounded-full border border-[#363342] px-[11px] py-[7px] active:opacity-70">
    <AppIcon name={icon} size={19} color={color} filled={filled} />
    <Typography size={13} color={color} fontWeight="600" className="ml-[7px]">{count}</Typography>
  </Pressable>
);

/** One sheet with two steps so the confirmation never stacks a second modal over the first. */
const REPORT_REASONS = ['Spam', 'Hate or harassment', 'Nudity or sexual content', 'Violence', 'False information'];

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

const PostCard = ({author, authorAvatarUrl, time, content, likes, likedByViewer = false, comments = 0, images = [], pending = false, canDelete = false, onToggleLike, onOpenComments, onDelete, onPressAuthor, onReport}: PostCardProps) => {
  const {width: screenWidth} = useWindowDimensions();
  const [menuVisible, setMenuVisible] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [activeImage, setActiveImage] = useState(0);
  const cardWidth = screenWidth - 40;

  return (
    <View className={`overflow-hidden rounded-[20px] border border-[#363342] bg-card ${pending ? 'opacity-60' : ''}`}>
      <View className="px-[15px] pb-[16px] pt-[15px]">
        <View className="flex-row items-center">
          <Pressable accessibilityRole={onPressAuthor ? 'button' : undefined} accessibilityLabel={onPressAuthor ? `View ${author}'s profile` : undefined}
            disabled={!onPressAuthor} onPress={onPressAuthor} className="flex-1 flex-row items-center active:opacity-70">
            <Avatar name={author} url={authorAvatarUrl} />
            <View className="ml-[12px] flex-1">
              <Typography size={16} color={Colors.text} fontWeight="700">{author}</Typography>
              <Typography size={12} color={Colors.muted} className="mt-[3px]">{time}</Typography>
            </View>
          </Pressable>
          {!pending && (
            <Pressable accessibilityRole="button" accessibilityLabel="More post options" className="p-[6px] active:opacity-70" onPress={() => { setConfirmingDelete(false); setReporting(false); setMenuVisible(true); }}>
              <AppIcon name="menu" size={22} color={Colors.text} />
            </Pressable>
          )}
        </View>
        {!!content && <Typography size={16} color={Colors.textBody} className="mt-[16px]">{content}</Typography>}
      </View>

      {images.length > 0 && (
        <View>
          <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} onMomentumScrollEnd={event => setActiveImage(Math.round(event.nativeEvent.contentOffset.x / cardWidth))}>
            {images.map((image, index) => (
              <Image key={`${image}-${index}`} source={{uri: image}} accessibilityLabel={`Post image ${index + 1}`} className="h-[270px]" style={{width: cardWidth}} resizeMode="cover" />
            ))}
          </ScrollView>
          {images.length > 1 && (
            <View className="absolute bottom-[10px] left-0 right-0 flex-row justify-center">
              {images.map((image, index) => <View key={`${image}-dot`} className={`mx-[3px] h-[6px] w-[6px] rounded-full ${index === activeImage ? 'bg-white' : 'bg-white/45'}`} />)}
            </View>
          )}
        </View>
      )}

      <View className="flex-row items-center px-[15px] py-[14px]">
        <StatButton icon="heart" count={likes} color={likedByViewer ? Colors.coral : Colors.muted} filled={likedByViewer} label={likedByViewer ? 'Unlike post' : 'Like post'} onPress={onToggleLike} disabled={pending} />
        <StatButton icon="comment" count={comments} label="View comments" onPress={onOpenComments} disabled={pending} />
        <View className="flex-1" />
        <Pressable accessibilityRole="button" accessibilityLabel="Share post" className="p-[6px] active:opacity-70">
          <AppIcon name="share" size={22} color={Colors.muted} />
        </Pressable>
      </View>

      <PostOptionsSheet visible={menuVisible} confirming={confirmingDelete} reporting={reporting} canDelete={canDelete && !!onDelete} onClose={() => setMenuVisible(false)}
        onConfirmStep={() => setConfirmingDelete(true)} onReportStep={() => setReporting(true)} onDelete={onDelete} onReport={onReport} />
    </View>
  );
};

export default PostCard;
