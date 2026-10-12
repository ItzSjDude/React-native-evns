import {isConversation, isOwnMessage} from './conversationPresentation';
import type {ApiMessage, Conversation, InboxItem, MessagesRealtimeEvent, RealtimeMessageEvent} from './types';

const isId = (value: unknown): value is string => typeof value === 'string' && value.length > 0;

/** Narrows a raw socket frame to a chat event; anything else (pong, party frames, malformed) is null. */
export const parseRealtimeEvent = (raw: Record<string, unknown>): MessagesRealtimeEvent | null => {
  const {type, conversationId} = raw;
  switch (type) {
    case 'message.created':
    case 'message.edited':
    case 'message.deleted': {
      const message = raw.message as Partial<ApiMessage> | null | undefined;
      if (!isId(conversationId) || !message || typeof message !== 'object' || !isId(message.id) || typeof message.created_at !== 'string') return null;
      return {type, conversationId, message: message as ApiMessage};
    }
    case 'reaction.added':
    case 'reaction.removed': {
      const {messageId, userId, emoji} = raw;
      if (!isId(conversationId) || !isId(messageId) || !isId(userId) || typeof emoji !== 'string') return null;
      return {type, conversationId, messageId, userId, emoji};
    }
    case 'typing':
      return isId(conversationId) && isId(raw.userId) ? {type, conversationId, userId: raw.userId} : null;
    case 'notification':
      return Array.isArray(raw.notifications) ? {type, notifications: raw.notifications} : null;
    default:
      return null;
  }
};

export const isMessageEvent = (event: MessagesRealtimeEvent): event is RealtimeMessageEvent =>
  event.type === 'message.created' || event.type === 'message.edited' || event.type === 'message.deleted';

/**
 * Merges rows by id, oldest first. Later rows win field by field, so a socket row
 * (which lacks sender_name/sender_avatar_url) keeps what REST already supplied.
 */
export const mergeMessages = (current: ApiMessage[], incoming: ApiMessage[]): ApiMessage[] => {
  const byId = new Map(current.map(message => [message.id, message]));
  for (const message of incoming) byId.set(message.id, {...byId.get(message.id), ...message});
  return [...byId.values()].sort((a, b) => a.created_at.localeCompare(b.created_at));
};

/** Open thread: append created rows; edits and deletes only touch rows already on screen. */
export const applyRealtimeToMessages = (messages: ApiMessage[], event: RealtimeMessageEvent): ApiMessage[] => {
  if (event.type !== 'message.created' && !messages.some(message => message.id === event.message.id)) return messages;
  return mergeMessages(messages, [event.message]);
};

export type ConversationListUpdate<T extends InboxItem> = {
  conversations: T[];
  /** A message arrived for a thread the list has not loaded; the caller should refetch. */
  missing: boolean;
};

const isPinned = (item: InboxItem) => isConversation(item) && item.pinned === true;

/**
 * List: newest message becomes the preview, the thread moves to the top of its group (pinned threads stay put)
 * and unread grows unless it is open or ours. Party and request rows are left alone.
 */
export const applyRealtimeToConversations = <T extends InboxItem>(
  items: T[],
  event: RealtimeMessageEvent,
  openConversationId: string | null,
): ConversationListUpdate<T> => {
  const index = items.findIndex(item => isConversation(item) && item.id === event.conversationId);
  if (index < 0) return {conversations: items, missing: event.type === 'message.created'};
  const current = items[index] as Conversation;
  const {message} = event;

  if (event.type !== 'message.created') {
    if (current.lastMessage?.id !== message.id) return {conversations: items, missing: false};
    const updated = {...current, lastMessage: {...current.lastMessage, ...message}} as T;
    return {conversations: items.map((item, i) => i === index ? updated : item), missing: false};
  }

  // The same row can arrive twice (REST send result, other device, retry); never double-count it.
  if (current.lastMessage?.id === message.id) return {conversations: items, missing: false};
  const newer = !current.lastMessage || message.created_at >= current.lastMessage.created_at;
  const bump = current.id !== openConversationId && !isOwnMessage(message, current.kind, current.contactId);
  const updated = {
    ...current,
    ...(newer ? {lastMessage: message, lastMessageAt: message.created_at, lastActivityAt: message.created_at} : null),
    unreadCount: bump ? current.unreadCount + 1 : current.unreadCount,
  } as T;
  if (isPinned(current)) return {conversations: items.map((item, i) => i === index ? updated : item), missing: false};
  const rest = items.filter((_, i) => i !== index);
  const firstUnpinned = rest.findIndex(item => !isPinned(item));
  rest.splice(firstUnpinned < 0 ? rest.length : firstUnpinned, 0, updated);
  return {conversations: rest, missing: false};
};

export const TYPING_SEND_INTERVAL_MS = 3000;
export const TYPING_VISIBLE_MS = 4000;

/** Lets at most one typing frame through per interval; a frame that could not be sent does not start the window. */
export const createTypingThrottle = (
  send: (conversationId: string) => boolean,
  intervalMs = TYPING_SEND_INTERVAL_MS,
  now: () => number = Date.now,
) => {
  let last = -Infinity;
  return (conversationId: string) => {
    const time = now();
    if (time - last < intervalMs) return false;
    if (!send(conversationId)) return false;
    last = time;
    return true;
  };
};
