import React from 'react';
import {FlatList, Pressable, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {cssInterop} from 'nativewind';
import {Colors} from '../../Constants/Colors';
import AppIcon from '../../Constants/Icons';
import Typography from '../../Constants/Typography';
import PostCard, {PostCardData} from '../../Constants/UI/PostCard';

cssInterop(SafeAreaView, {className: 'style'});

const posts: PostCardData[] = [
  {id: '1', author: 'Sachin Jangir', time: '1h', content: 'asdfghybhvhv', likes: 1},
  {id: '2', author: 'Sachin Jangir', time: '6d', content: 'asdfghrgyvf b da cd c cda cds c dscdcdscdcs', likes: 1},
  {id: '3', author: 'Sachin Jangir', time: '6d', content: 'Hell', likes: 1},
];

const PostSeparator = () => <View className="h-[18px]" />;

const Home = () => (
  <SafeAreaView className="flex-1 bg-background" edges={['top']}>
    <FlatList
      data={posts}
      keyExtractor={item => item.id}
      renderItem={({item}) => <PostCard {...item} />}
      showsVerticalScrollIndicator={false}
      contentContainerClassName="px-5 pb-[110px]"
      ItemSeparatorComponent={PostSeparator}
      ListHeaderComponent={(
        <>
      <View className="flex-row items-center justify-between pt-[21px]">
        <View><Typography size={28} color={Colors.text} fontWeight="500" className="tracking-[-1px]">Hiva chat</Typography><Typography size={13} color={Colors.primary} fontWeight="600" className="mt-1 tracking-[2px]">FOR YOU</Typography></View>
        <Pressable accessibilityRole="button" className="mt-2 p-[5px]"><AppIcon name="bell" size={27} /></Pressable>
      </View>
      <Pressable accessibilityRole="button" className="mt-[17px] h-[83px] flex-row items-center px-[10px]">
        <View className="h-[41px] w-[41px] items-center justify-center rounded-[26px] bg-primary"><AppIcon name="user" size={25} color={Colors.iconDark} /></View>
        <Typography size={16} color={Colors.muted} className="ml-[10px] flex-1">What's happening?</Typography><AppIcon name="plus" size={26} color={Colors.primary} />
      </Pressable>
        </>
      )}
    />
  </SafeAreaView>
);

export default Home;
