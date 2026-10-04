import React from 'react';
import {Pressable, View} from 'react-native';
import {Colors} from '../Colors';
import AppIcon from '../Icons';
import Typography from '../Typography';

export type PostCardData = {
  id: string;
  author: string;
  time: string;
  content: string;
  likes: number;
};

type PostCardProps = Omit<PostCardData, 'id'>;

const Avatar = () => (
  <View className="h-[43px] w-[43px] items-center justify-center rounded-[22px] bg-[#77717C]">
    <AppIcon name="user" size={24} color={Colors.iconDark} />
  </View>
);

const PostCard = ({author, time, content, likes}: PostCardProps) => (
  <View className="rounded-[25px] border border-[#363342] bg-card p-[19px] px-[15px]">
    <View className="flex-row items-center justify-between">
      <Avatar />
      <View className="ml-[14px]">
        <Typography size={17} color={Colors.text} fontWeight="600">{author}</Typography>
        <Typography size={12} color={Colors.muted} className="mt-[3px]">{time}</Typography>
      </View>
      <View className="mb-3 ml-auto"><AppIcon name="menu" size={20} color={Colors.muted} /></View>
    </View>
    <Typography size={16} color={Colors.textBody} className="mt-[15px]">{content}</Typography>
    <View className="mt-[14px] flex-row items-center justify-between">
      <View className="flex-row items-center">
        <AppIcon name="heart" size={23} color={Colors.coral} />
        <Typography size={16} color={Colors.muted} className="ml-[10px]">{likes}</Typography>
      </View>
      <View className="flex-row items-center gap-3">
        <Pressable accessibilityRole="button"><AppIcon name="comment" size={22} color={Colors.muted} /></Pressable>
        <Pressable accessibilityRole="button"><AppIcon name="share" size={22} color={Colors.muted} /></Pressable>
      </View>
    </View>
  </View>
);

export default PostCard;
