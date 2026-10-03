import React from 'react';
import {FlatList, Pressable, StyleSheet, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {Colors} from '../../Constants/Colors';
import AppIcon from '../../Constants/Icons';
import Typography from '../../Constants/Typography';
import PostCard, {PostCardData} from '../../Constants/UI/PostCard';

const posts: PostCardData[] = [
  {id: '1', author: 'Sachin Jangir', time: '1h', content: 'asdfghybhvhv', likes: 1},
  {id: '2', author: 'Sachin Jangir', time: '6d', content: 'asdfghrgyvf b da cd c cda cds c dscdcdscdcs', likes: 1},
  {id: '3', author: 'Sachin Jangir', time: '6d', content: 'Hell', likes: 1},
];

const PostSeparator = () => <View style={styles.postSeparator} />;

const Home = () => (
  <SafeAreaView style={styles.safeArea} edges={['top']}>
    <FlatList
      data={posts}
      keyExtractor={item => item.id}
      renderItem={({item}) => <PostCard {...item} />}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.content}
      ItemSeparatorComponent={PostSeparator}
      ListHeaderComponent={(
        <>
      <View style={styles.header}>
        <View><Typography size={28} color={Colors.text} fontWeight="500" style={styles.title}>Hiva chat</Typography><Typography size={13} color={Colors.primary} fontWeight="600" style={styles.subtitle}>FOR YOU</Typography></View>
        <Pressable accessibilityRole="button" style={styles.bellButton}><AppIcon name="bell" size={27} /></Pressable>
      </View>
      <Pressable accessibilityRole="button" style={styles.composer}>
        <View style={styles.composerAvatar}><AppIcon name="user" size={25} color={Colors.iconDark} /></View>
        <Typography size={16} color={Colors.muted} style={styles.composerText}>What's happening?</Typography><AppIcon name="plus" size={26} color={Colors.primary} />
      </Pressable>
        </>
      )}
    />
  </SafeAreaView>
);

export default Home;

const styles = StyleSheet.create({
  safeArea: {flex: 1, backgroundColor: Colors.background},
  content: {paddingHorizontal: 20, paddingBottom: 110},
  header: {paddingTop: 21, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'},
  title: {letterSpacing: -1},
  subtitle: {letterSpacing: 2, marginTop: 4},
  bellButton: {padding: 5, marginTop: 8},
  composer: {height: 83, flexDirection: 'row', alignItems: 'center', marginTop: 17, paddingHorizontal: 10},
  composerAvatar: {width: 41, height: 41, borderRadius: 26, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center'},
  composerText: {flex: 1, marginLeft: 10},
  postSeparator: {height: 18},
});
