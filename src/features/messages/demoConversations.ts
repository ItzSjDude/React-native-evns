import type {Conversation} from './types';

export const demoConversations: Conversation[] = [
  {
    id: 'ananya',
    name: 'Ananya Sharma',
    initials: 'AS',
    avatarClassName: 'bg-[#584775]',
    unreadCount: 2,
    messages: [
      {id: 'a1', sender: 'them', text: 'Hey Sachin! Are you coming to the weekend meetup?', time: '10:38 AM'},
      {id: 'a2', sender: 'me', text: 'Yes, I am planning to be there. What time does it start?', time: '10:40 AM'},
      {id: 'a3', sender: 'them', text: 'Around 6 PM. I will send you the location in a bit.', time: '10:42 AM'},
    ],
  },
  {
    id: 'rohan',
    name: 'Rohan Mehta',
    initials: 'RM',
    avatarClassName: 'bg-[#315563]',
    unreadCount: 0,
    messages: [
      {id: 'r1', sender: 'them', text: 'Thanks for joining yesterday. It was fun!', time: 'Yesterday'},
      {id: 'r2', sender: 'me', text: 'Same here. Let us plan another one soon.', time: 'Yesterday'},
    ],
  },
  {
    id: 'neha',
    name: 'Neha Kapoor',
    initials: 'NK',
    avatarClassName: 'bg-[#655044]',
    unreadCount: 1,
    messages: [
      {id: 'n1', sender: 'me', text: 'Found a place you might like for the next event.', time: 'Tuesday'},
      {id: 'n2', sender: 'them', text: 'That sounds great! Tell me more when you get a chance.', time: 'Tuesday'},
    ],
  },
];
