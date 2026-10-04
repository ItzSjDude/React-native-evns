export type ChatMessage = {
  id: string;
  sender: 'me' | 'them';
  text: string;
  time: string;
};

export type Conversation = {
  id: string;
  name: string;
  initials: string;
  avatarClassName: string;
  unreadCount: number;
  messages: ChatMessage[];
};
