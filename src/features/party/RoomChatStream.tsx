import React, {useEffect, useRef, useState} from 'react';
import {AccessibilityInfo, Animated, Pressable, ScrollView, Text, View} from 'react-native';
import type {PartyChatMessage} from './partyService';
const Message=({message,mine,reduced,onPress}: {message: PartyChatMessage; mine: boolean; reduced: boolean; onPress?: () => void})=>{
  const entrance=useRef(new Animated.Value(reduced?1:0)).current;
  useEffect(()=>{
    if(reduced){entrance.setValue(1);return;}
    const animation=Animated.timing(entrance,{toValue:1,duration:220,useNativeDriver:true});animation.start();return()=>animation.stop();
  },[entrance,reduced]);
  return <Animated.View style={{opacity:entrance,transform:[{translateY:entrance.interpolate({inputRange:[0,1],outputRange:[10,0]})}]}}>
    <Pressable accessibilityRole="button" accessibilityLabel={`${message.name}: ${message.body}. Message options`} accessibilityHint="Opens report or delete options" onPress={onPress} className="mb-2 min-h-11 flex-row items-start gap-2">
      <View className="mt-1 h-7 w-7 items-center justify-center rounded-full bg-primary-dark"><Text className="text-xs font-bold text-primary">{message.name.slice(0,2).toUpperCase()}</Text></View>
      <View className="min-w-0 flex-1 rounded-2xl bg-card/70 px-3 py-2"><Text className="text-sm leading-5 text-foreground"><Text className="font-semibold text-primary">{mine?'You':message.name}  </Text>{message.body}</Text></View>
    </Pressable>
  </Animated.View>;
};
export default function RoomChatStream({messages,identity,onMessagePress}: {messages: PartyChatMessage[]; identity: string; onMessagePress?: (message: PartyChatMessage) => void}) {
  const scroll=useRef<React.ComponentRef<typeof ScrollView>>(null);
  const atBottom=useRef(true);
  const [unread,setUnread]=useState(false);
  const [reduced,setReduced]=useState(false);
  useEffect(()=>{
    AccessibilityInfo.isReduceMotionEnabled().then(setReduced).catch(()=>{});
    const listener=AccessibilityInfo.addEventListener('reduceMotionChanged',setReduced);return()=>listener.remove();
  },[]);
  useEffect(()=>{if(!atBottom.current)setUnread(true);},[messages]);
  const jump=()=>{atBottom.current=true;setUnread(false);scroll.current?.scrollToEnd({animated:!reduced});};
  return <View className="min-h-[100px] flex-1 px-5">
    <View className="mb-1 flex-row flex-wrap items-center justify-between gap-1"><Text className="text-sm font-semibold text-muted">Live chat</Text><Text className="text-xs text-muted">Messages stay in this room</Text></View>
    <View className="flex-1 overflow-hidden">
      <ScrollView ref={scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" scrollEventThrottle={100}
        contentContainerClassName="flex-grow justify-end pb-2 pt-2"
        onScroll={({nativeEvent:{contentOffset,contentSize,layoutMeasurement}})=>{
          atBottom.current=contentSize.height-contentOffset.y-layoutMeasurement.height<60;
          if(atBottom.current)setUnread(false);
        }} onContentSizeChange={()=>{if(atBottom.current)scroll.current?.scrollToEnd({animated:!reduced});}}>
        {!messages.length && <Text className="pb-4 text-sm leading-5 text-muted">You’re in. Say hello to the room 👋</Text>}
        {messages.map(message=><Message key={message.id} message={message} mine={message.userId===identity} reduced={reduced} onPress={()=>onMessagePress?.(message)} />)}
      </ScrollView>
      {unread && <Pressable accessibilityRole="button" accessibilityLabel="Scroll to new messages" onPress={jump} className="absolute bottom-2 min-h-11 self-center justify-center rounded-full bg-gold px-5"><Text className="text-sm font-semibold text-text-dark">New messages ↓</Text></Pressable>}
    </View>
  </View>;
}
