import type React from 'react';
import IconBell from '@tabler/icons-react-native/IconBell';
import IconBuildingCommunity from '@tabler/icons-react-native/IconBuildingCommunity';
import IconCalendarEvent from '@tabler/icons-react-native/IconCalendarEvent';
import IconCoins from '@tabler/icons-react-native/IconCoins';
import IconCreditCard from '@tabler/icons-react-native/IconCreditCard';
import IconHeart from '@tabler/icons-react-native/IconHeart';
import IconMapPin from '@tabler/icons-react-native/IconMapPin';
import IconMessageCircle from '@tabler/icons-react-native/IconMessageCircle';
import IconMicrophone from '@tabler/icons-react-native/IconMicrophone';
import IconNote from '@tabler/icons-react-native/IconNote';
import IconTicket from '@tabler/icons-react-native/IconTicket';
import IconUserPlus from '@tabler/icons-react-native/IconUserPlus';
import type {NotificationType} from './types';

type Icon = React.ComponentType<{size?: number; color?: string}>;

export function iconForNotification(type: NotificationType): Icon {
  if (type === 'NEW_MESSAGE' || type === 'POST_COMMENTED') return IconMessageCircle;
  if (type === 'POST_LIKED') return IconHeart;
  if (type === 'USER_FOLLOWED') return IconUserPlus;
  if (type.startsWith('PARTY_')) return IconMicrophone;
  if (type.startsWith('EVENT_') || type.startsWith('WAITLIST_')) return IconCalendarEvent;
  if (type.startsWith('TICKET_') || type === 'PURCHASE_REQUESTED') return IconTicket;
  if (type.startsWith('PAYMENT_')) return IconCreditCard;
  if (type.startsWith('CREDITS_')) return IconCoins;
  if (type === 'USER_ARRIVED') return IconMapPin;
  if (type === 'VIBE_NOTE_NEARBY') return IconNote;
  if (type === 'WORKSPACE_INVITE') return IconBuildingCommunity;
  return IconBell;
}
