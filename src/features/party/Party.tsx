import React from 'react';
import {View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {cssInterop} from 'nativewind';
import {Colors} from '../../Constants/Colors';
import AppIcon from '../../Constants/Icons';
import Typography from '../../Constants/Typography';

cssInterop(SafeAreaView, {className: 'style'});
const Party = () => {
  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <View className="flex-1 items-center justify-center px-8">
        <View className="mb-5 h-[86px] w-[86px] items-center justify-center rounded-[43px] bg-[#211B43]">
          <AppIcon name="party" size={42} color={Colors.primary} />
        </View>
        <Typography size={28} color={Colors.text} fontWeight="600">
          Party
        </Typography>
        <Typography size={15} color={Colors.muted} className="mt-2 text-center">
          Discover parties and connect with your community.
        </Typography>
        <Typography size={14} color={Colors.muted} className="mt-[30px]">
          Party rooms are coming soon.
        </Typography>
      </View>
    </SafeAreaView>
  );
};

export default Party;
