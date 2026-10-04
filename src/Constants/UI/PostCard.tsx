import React from 'react';
import {Pressable, StyleSheet, View} from 'react-native';
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
  <View style={styles.avatar}>
    <AppIcon name="user" size={24} color={Colors.iconDark} />
  </View>
);

const PostCard = ({author, time, content, likes}: PostCardProps) => (
  <View style={styles.post}>
    <View style={styles.postHeader}>
      <Avatar />
      <View style={styles.authorBlock}>
        <Typography size={17} color={Colors.text} fontWeight="600" style={styles.author}>{author}</Typography>
        <Typography size={12} color={Colors.muted} style={styles.time}>{time}</Typography>
      </View>
      <View style={styles.more}><AppIcon name="menu" size={20} color={Colors.muted} /></View>
    </View>
    <Typography size={16} color={Colors.textBody} style={styles.postText}>{content}</Typography>
    <View style={styles.postActions}>
      <View style={styles.likeGroup}>
        <AppIcon name="heart" size={23} color={Colors.coral} />
        <Typography size={16} color={Colors.muted} style={styles.likeCount}>{likes}</Typography>
      </View>
      <View style={styles.actionGroup}>
        <Pressable accessibilityRole="button"><AppIcon name="comment" size={22} color={Colors.muted} /></Pressable>
        <Pressable accessibilityRole="button"><AppIcon name="share" size={22} color={Colors.muted} /></Pressable>
      </View>
    </View>
  </View>
);

export default PostCard;

const styles = StyleSheet.create({
  post: {backgroundColor: Colors.card, borderColor: Colors.border, borderWidth: 1, borderRadius: 25, paddingHorizontal: 15, padding: 19},
  postHeader: {flexDirection: 'row', alignItems: 'center',justifyContent:'space-between'},
  avatar: {width: 43, height: 43, borderRadius: 22, backgroundColor: Colors.avatar, alignItems: 'center', justifyContent: 'center'},
  authorBlock: {marginLeft: 14},
  author: {},
  time: {marginTop: 3},
  more: {marginLeft: 'auto', marginBottom: 12},
  postText: {marginTop: 15},
  postActions: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14},
  likeGroup: {flexDirection: 'row', alignItems: 'center'},
  likeCount: {marginLeft: 10},
  actionGroup: {flexDirection: 'row', alignItems: 'center', gap: 12},
  // actionButton: {padding: 2},
});
