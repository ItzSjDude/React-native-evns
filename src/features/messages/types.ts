/**
 * Contracts for gathr-api `/conversations` (src/routes/chat.routes.js).
 * Raw rows are snake_case straight from Postgres; `count(*)` arrives as a
 * number because the API parses INT8.
 */

export type ConversationKind = 'DIRECT' | 'EVENT';
export type ConversationStatus = 'OPEN' | 'CLOSED';
export type SenderRole = 'ATTENDEE' | 'WORKSPACE' | 'SYSTEM';
export type MessageType = 'TEXT' | 'IMAGE' | 'VOICE' | 'PAYMENT_CARD' | 'TICKET' | 'SYSTEM';

/** One message row (`GET/POST /conversations/:id/messages`). */
export type ApiMessage = {
  id: string;
  conversation_id?: string;
  sender_id: string | null;
  sender_role?: SenderRole;
  type: MessageType | string;
  body: string | null;
  metadata?: Record<string, unknown> | null;
  created_at: string;
  edited_at?: string | null;
  deleted_at?: string | null;
  sender_name?: string | null;
  sender_avatar_url?: string | null;
};

/** One row of `GET /conversations` (conversationRepository.listForUser). */
export type ApiConversation = {
  id: string;
  kind: ConversationKind;
  status: ConversationStatus;
  workspace_id: string | null;
  event_id: string | null;
  user_id: string | null;
  participant_a_id: string | null;
  participant_b_id: string | null;
  last_message_at: string | null;
  created_at: string;
  event_title: string | null;
  event_starts_at: string | null;
  workspace_name: string | null;
  workspace_logo_url: string | null;
  /** DIRECT threads only: the side that is not the caller. */
  other_user_id: string | null;
  other_user_name: string | null;
  other_user_avatar_url: string | null;
  unread_count: number | string;
  /** Not returned by the API today; used if the backend starts including it. */
  last_message?: ApiMessage | null;
};

/** What the list screen renders. */
export type Conversation = {
  id: string;
  kind: ConversationKind;
  status: ConversationStatus;
  title: string;
  avatarUrl: string | null;
  /** The other participant for DIRECT threads; null for EVENT threads. */
  contactId: string | null;
  unreadCount: number;
  lastActivityAt: string;
  /** Null until the first message is sent. */
  lastMessageAt: string | null;
  lastMessage: ApiMessage | null;
};

export type ConversationPage = {
  conversations: Conversation[];
  hasMore: boolean;
  nextOffset: number;
};

/** Kept for the public barrel: a single chat message as the API returns it. */
export type ChatMessage = ApiMessage;

/**
 * Realtime pushes on the caller's user channel (gathr-api API.md section 13).
 * API frames also carry `eventId`, `seq` and `v: 1`; `typing` has no envelope.
 */
export type RealtimeEnvelope = {eventId?: string; seq?: number; v?: number};

/** `message` is the raw stored row: no sender_name, sender_avatar_url or status. */
export type RealtimeMessageEvent = {
  type: 'message.created' | 'message.edited' | 'message.deleted';
  conversationId: string;
  message: ApiMessage;
};

export type RealtimeReactionEvent = {
  type: 'reaction.added' | 'reaction.removed';
  conversationId: string;
  messageId: string;
  userId: string;
  emoji: string;
};

export type RealtimeTypingEvent = {type: 'typing'; conversationId: string; userId: string};

export type RealtimeNotification = {type: string; title?: string; body?: string; data?: {conversationId?: string}};
export type RealtimeNotificationEvent = {type: 'notification'; notifications: RealtimeNotification[]};

export type MessagesRealtimeEvent =
  | RealtimeMessageEvent
  | RealtimeReactionEvent
  | RealtimeTypingEvent
  | RealtimeNotificationEvent;
