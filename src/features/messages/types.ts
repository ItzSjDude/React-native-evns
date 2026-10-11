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

/** Extra columns of `GET /conversations/inbox` rows (conversationInbox.repository.js). */
export type ApiInboxConversation = ApiConversation & {
  folder_id?: string | null;
  is_pinned?: boolean;
  is_archived?: boolean;
  folder_name?: string | null;
};

/** `type: 'PARTY'` row of the inbox: a party room chat the caller was invited to or joined. */
export type ApiPartyChat = {
  id: string;
  type: 'PARTY';
  kind: string;
  status: string;
  title: string | null;
  topic: string | null;
  scheduled_start_at: string | null;
  created_at: string;
  ended_at: string | null;
  last_activity_at: string;
  host_id: string;
  host_name: string | null;
  host_avatar_url: string | null;
  participant_count: number;
  last_message: {id: string; body: string | null; sender_id: string | null; created_at: string} | null;
  unread_count: number | string;
  last_read_at: string | null;
  is_archived: boolean;
};

/** `type: 'PARTY_REQUEST'` row (`view=requests`): a pending seat request in a room the caller manages. */
export type ApiPartyRequest = {
  id: string;
  type: 'PARTY_REQUEST';
  party_id: string;
  requester_id: string;
  requester_name: string | null;
  requester_avatar_url: string | null;
  status: string;
  requested_at: string;
  party_title: string | null;
  party_kind: string;
  host_id: string;
  host_name: string | null;
};

export type ApiInboxRow = ApiInboxConversation | ApiPartyChat | ApiPartyRequest;

/** What the list screen renders. */
export type Conversation = {
  /** Absent on fixtures; `toConversation` always sets it so rows can be told apart by `type`. */
  type?: 'CONVERSATION';
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
  /** Per-user inbox state (Plus: pin and folder; archive is free). */
  folderId?: string | null;
  folderName?: string | null;
  pinned?: boolean;
  archived?: boolean;
};

export type PartyChat = {
  type: 'PARTY';
  id: string;
  title: string;
  hostName: string;
  avatarUrl: string | null;
  participantCount: number;
  unreadCount: number;
  lastActivityAt: string;
  preview: string | null;
  archived: boolean;
  /** The room is over; the chat is still readable. */
  ended: boolean;
};

export type PartyRequest = {
  type: 'PARTY_REQUEST';
  id: string;
  partyId: string;
  requesterName: string;
  avatarUrl: string | null;
  partyTitle: string;
  requestedAt: string;
};

export type InboxItem = Conversation | PartyChat | PartyRequest;

export type InboxView = 'all' | 'unread' | 'requests' | 'events' | 'parties' | 'direct' | 'archived' | 'folder';
export type InboxQuery = {view: InboxView; folderId?: string};

export type InboxPage = {items: InboxItem[]; hasMore: boolean; nextOffset: number};

export type InboxFolder = {id: string; name: string; createdAt: string; updatedAt: string};

/** `PATCH /conversations/inbox/:id/inbox-state`; `pinned: true` and a folder need Plus. */
export type InboxStatePatch = {folderId?: string | null; pinned?: boolean; archived?: boolean};
export type InboxStateResult = {folderId: string | null; pinnedAt: string | null; archivedAt: string | null};

/** `PATCH /conversations/inbox/parties/:id/state`. */
export type PartyStatePatch = {read?: boolean; archived?: boolean};
export type PartyStateResult = {lastReadAt: string | null; archivedAt: string | null};

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
