import React, {useEffect, useState} from 'react';
import {Image, Modal, Pressable, ScrollView, useWindowDimensions, View} from 'react-native';
import {Colors} from '../Colors';
import AppIcon from '../Icons';
import Typography from '../Typography';

export type PostCardData = {
  id: string;
  author: string;
  avatarUrl?: string | null;
  time: string;
  content: string;
  likes: number;
  comments?: number;
  shares?: number;
  images?: string[];
  likedByViewer?: boolean;
};

type PostCardProps = PostCardData & {
  onToggleLike?: () => void;
  onOpenComments?: () => void;
};

const Avatar = ({avatarUrl}: {avatarUrl?: string | null}) => {
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    setImageFailed(false);
  }, [avatarUrl]);

  if (avatarUrl && !imageFailed) {
    return (
      <Image
        source={{uri: avatarUrl}}
        accessibilityLabel="Author avatar"
        onError={() => setImageFailed(true)}
        className="h-[43px] w-[43px] rounded-[22px]"
      />
    );
  }

  return (
    <View className="h-[43px] w-[43px] items-center justify-center rounded-[22px] bg-[#77717C]">
      <AppIcon name="user" size={24} color={Colors.iconDark} />
    </View>
  );
};

const StatButton = ({icon, count, color = Colors.muted, filled = false, onPress, label}: {icon: 'heart' | 'comment'; count: number; color?: string; filled?: boolean; onPress?: () => void; label: string}) => (
  <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} className="mr-[8px] flex-row items-center rounded-full border border-[#363342] px-[11px] py-[7px] active:opacity-70">
    <AppIcon name={icon} size={19} color={color} filled={filled} />
    <Typography size={13} color={Colors.text} fontWeight="600" className="ml-[7px]">{count}</Typography>
  </Pressable>
);

const ReportModal = ({visible, onClose}: {visible: boolean; onClose: () => void}) => (
  <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
    <Pressable className="flex-1 justify-end bg-black/60" onPress={onClose}>
      <Pressable className="rounded-t-[26px] bg-card px-[20px] pb-[32px] pt-[16px]" onPress={event => event.stopPropagation()}>
        <View className="mb-[18px] h-[4px] w-[42px] self-center rounded-full bg-[#514B62]" />
        <Typography size={18} color={Colors.text} fontWeight="700">Post options</Typography>
        <Pressable accessibilityRole="button" accessibilityLabel="Report post" className="mt-[18px] flex-row items-center rounded-[14px] border border-[#363342] px-[14px] py-[14px] active:opacity-70" onPress={onClose}>
          <AppIcon name="flag" size={22} color={Colors.coral} />
          <Typography size={16} color={Colors.text} fontWeight="600" className="ml-[12px]">Report</Typography>
        </Pressable>
      </Pressable>
    </Pressable>
  </Modal>
);

const PostCard = ({author, avatarUrl, time, content, likes, likedByViewer = false, comments = 0, images = [], onToggleLike, onOpenComments}: PostCardProps) => {
  const {width: screenWidth} = useWindowDimensions();
  const [menuVisible, setMenuVisible] = useState(false);
  const [activeImage, setActiveImage] = useState(0);
  const cardWidth = screenWidth - 40;

  return (
    <View className="overflow-hidden rounded-[20px] border border-[#363342] bg-card">
      <View className="px-[15px] pb-[16px] pt-[15px]">
        <View className="flex-row items-center">
          <Avatar avatarUrl={avatarUrl} />
          <View className="ml-[12px] flex-1">
            <Typography size={16} color={Colors.text} fontWeight="700">{author}</Typography>
            <Typography size={12} color={Colors.muted} className="mt-[3px]">{time}</Typography>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="More post options" className="p-[6px] active:opacity-70" onPress={() => setMenuVisible(true)}>
            <AppIcon name="menu" size={22} color={Colors.text} />
          </Pressable>
        </View>
        <Typography size={16} color={Colors.textBody} className="mt-[16px]">{content}</Typography>
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
        <StatButton icon="heart" count={likes} color={likedByViewer ? Colors.coral : Colors.muted} filled={likedByViewer} label={likedByViewer ? 'Unlike post' : 'Like post'} onPress={onToggleLike} />
        <StatButton icon="comment" count={comments} label="View comments" onPress={onOpenComments} />
        <View className="flex-1" />
        <Pressable accessibilityRole="button" accessibilityLabel="Share post" className="p-[6px] active:opacity-70">
          <AppIcon name="share" size={22} color={Colors.muted} />
        </Pressable>
      </View>

      <ReportModal visible={menuVisible} onClose={() => setMenuVisible(false)} />
    </View>
  );
};

export default PostCard;
