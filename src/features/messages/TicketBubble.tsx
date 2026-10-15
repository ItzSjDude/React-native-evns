import React, {memo} from 'react';
import {Pressable, Text, View} from 'react-native';
import IconTicket from '@tabler/icons-react-native/IconTicket';
import {Colors} from '../../Constants/Colors';
import {clockTimeOf} from './conversationPresentation';
import type {DirectMessage} from './directService';
import {ticketIdOf} from './paymentCard';

type Props = {
  message: DirectMessage;
  mine: boolean;
  /** Opens the ticket pass. The host supplies it, so this feature never imports events. */
  onOpenTicket: (ticketId: string) => void;
};

/** "Your ticket is ready" with a button into the ticket pass. The code and QR stay out of the bubble. */
const TicketBubble = memo(({message, mine, onOpenTicket}: Props) => {
  const ticketId = ticketIdOf(message);
  return (
    <View testID="ticket-bubble" className={`mb-4 max-w-[82%] ${mine ? 'self-end items-end' : 'self-start items-start'}`}>
      <View className={`w-full rounded-[18px] border border-gold/40 bg-card p-4 ${mine ? 'rounded-br-[5px]' : 'rounded-bl-[5px]'}`}>
        <View className="flex-row items-center gap-3">
          <View className="h-10 w-10 items-center justify-center rounded-2xl bg-gold/15"><IconTicket size={22} color={Colors.gold} /></View>
          <Text className="flex-1 text-[15px] font-bold text-foreground">Your ticket is ready</Text>
        </View>
        {ticketId ? (
          <Pressable accessibilityRole="button" accessibilityLabel="View ticket" onPress={() => onOpenTicket(ticketId)}
            className="mt-4 h-11 items-center justify-center rounded-full bg-gold active:opacity-70">
            <Text className="text-[14px] font-bold text-text-dark">View ticket</Text>
          </Pressable>
        ) : (
          <Text className="mt-3 text-[13px] text-muted">Ticket details are loading.</Text>
        )}
      </View>
      <Text className="mt-1 px-1 text-[11px] text-muted">{clockTimeOf(message.created_at)}</Text>
    </View>
  );
});

export default TicketBubble;
