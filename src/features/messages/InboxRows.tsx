import React, {memo} from 'react';
import {Pressable, ScrollView, Text, View} from 'react-native';
import IconBell from '@tabler/icons-react-native/IconBell';
import IconDots from '@tabler/icons-react-native/IconDots';
import IconFolder from '@tabler/icons-react-native/IconFolder';
import IconLock from '@tabler/icons-react-native/IconLock';
import IconPin from '@tabler/icons-react-native/IconPin';
import RemoteImage from '../../components/RemoteImage';
import {Colors} from '../../Constants/Colors';
import {initialsOf, isOwnMessage, messageText, relativeTime} from './conversationPresentation';
import {OnlineDot, usePresence} from './presence';
import type {ApiMessage, Conversation, InboxFolder, InboxQuery, InboxView, PartyChat, PartyRequest} from './types';

export const VIEWS: {view: InboxView; label: string}[] = [
  {view: 'all', label: 'All'},
  {view: 'unread', label: 'Unread'},
  {view: 'requests', label: 'Requests'},
  {view: 'events', label: 'Events'},
  {view: 'parties', label: 'Parties'},
  {view: 'archived', label: 'Archived'},
];

const Chip = ({label, active, onPress, locked}: {label: string; active?: boolean; onPress: () => void; locked?: boolean}) => (
  <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{selected: !!active}} onPress={onPress}
    className={`h-9 flex-row items-center gap-1.5 rounded-full border px-4 active:opacity-70 ${active ? 'border-gold bg-gold' : 'border-border bg-card'}`}>
    <Text className={`text-[13px] font-semibold ${active ? 'text-text-dark' : 'text-foreground'}`}>{label}</Text>
    {locked && <IconLock size={12} color={Colors.gold} />}
  </Pressable>
);

type ChipsProps = {
  query: InboxQuery;
  folders: InboxFolder[];
  /** Plus is on offer but this account is free: the Folders chip shows a lock and opens the paywall. */
  foldersLocked: boolean;
  showFolders: boolean;
  onSelect: (query: InboxQuery) => void;
  onFolders: () => void;
};

/** System views for everyone, then the member's folders (Plus) and the folder manager. */
export const InboxChips = ({query, folders, foldersLocked, showFolders, onSelect, onFolders}: ChipsProps) => (
  <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mt-4 max-h-9 grow-0" contentContainerClassName="gap-2 pr-5">
    {VIEWS.map(({view, label}) => <Chip key={view} label={label} active={query.view === view} onPress={() => onSelect({view})} />)}
    {folders.map(folder => <Chip key={folder.id} label={folder.name} active={query.view === 'folder' && query.folderId === folder.id} onPress={() => onSelect({view: 'folder', folderId: folder.id})} />)}
    {showFolders && <Chip label="Folders" locked={foldersLocked} onPress={onFolders} />}
  </ScrollView>
);

export const Avatar = ({url, title}: {url: string | null; title: string}) => {
  return url
    ? <RemoteImage uri={url} fadeDuration={0} className="h-12 w-12 rounded-full" />
    : (
      <View className="h-12 w-12 items-center justify-center rounded-full bg-primary-dark">
        <Text className="text-sm font-bold text-foreground">{initialsOf(title)}</Text>
      </View>
    );
};

const UnreadBadge = ({id, count}: {id: string; count: number}) => count > 0 ? (
  <View testID={`unread-${id}`} className="h-5 min-w-[20px] items-center justify-center rounded-full bg-gold px-1">
    <Text className="text-[11px] font-bold text-text-dark">{count > 99 ? '99+' : count}</Text>
  </View>
) : null;

const MenuButton = ({title, onPress}: {title: string; onPress: () => void}) => (
  <Pressable accessibilityRole="button" accessibilityLabel={`More actions for ${title}`} hitSlop={8} onPress={onPress} className="h-9 w-7 items-center justify-center active:opacity-60">
    <IconDots size={20} color={Colors.muted} />
  </Pressable>
);

const rowClass = 'min-h-[76px] flex-row items-center gap-3 border-b border-border py-3 active:opacity-70';

const previewOf = (conversation: Conversation, latest: ApiMessage | null) => {
  if (latest) {
    const prefix = isOwnMessage(latest, conversation.kind, conversation.contactId) ? 'You: ' : '';
    return prefix + messageText(latest);
  }
  if (conversation.unreadCount > 0) return `${conversation.unreadCount} new ${conversation.unreadCount === 1 ? 'message' : 'messages'}`;
  return conversation.lastMessageAt ? 'Tap to open the conversation' : 'No messages yet';
};

type ConversationRowProps = {
  conversation: Conversation;
  latest: ApiMessage | null;
  reminder: boolean;
  onPress: () => void;
  onMenu: () => void;
};

export const ConversationRow = memo(({conversation, latest, reminder, onPress, onMenu}: ConversationRowProps) => {
  const unread = conversation.unreadCount;
  // Direct chats only: event/organiser threads have no single person to be "online".
  const presence = usePresence(conversation.contactId ? [conversation.contactId] : []);
  const online = !!conversation.contactId && presence[conversation.contactId]?.online === true;
  return (
    <View className="flex-row items-center border-b border-border">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Open conversation with ${conversation.title}${unread ? `, ${unread} unread` : ''}`}
        onPress={onPress}
        onLongPress={onMenu}
        className="min-h-[76px] min-w-0 flex-1 flex-row items-center gap-3 py-3 active:opacity-70">
        <View>
          <Avatar url={conversation.avatarUrl} title={conversation.title} />
          {online && <View className="absolute -bottom-0.5 -right-0.5 rounded-full border-2 border-background"><OnlineDot online size={12} /></View>}
        </View>
        <View className="min-w-0 flex-1">
          <View className="flex-row items-center justify-between gap-2">
            <View className="min-w-0 flex-1 flex-row items-center gap-1.5">
              {conversation.pinned && <View testID={`pin-${conversation.id}`}><IconPin size={14} color={Colors.gold} /></View>}
              <Text className="shrink text-[16px] font-semibold text-foreground" numberOfLines={1}>{conversation.title}</Text>
              {reminder && <View testID={`reminder-${conversation.id}`}><IconBell size={13} color={Colors.muted} /></View>}
            </View>
            <Text className={`text-xs ${unread ? 'text-primary' : 'text-muted'}`}>{relativeTime(conversation.lastActivityAt)}</Text>
          </View>
          <View className="mt-1 flex-row items-center justify-between gap-3">
            <Text className={`flex-1 text-sm ${unread ? 'font-semibold text-foreground' : 'text-muted'}`} numberOfLines={1}>{previewOf(conversation, latest)}</Text>
            <UnreadBadge id={conversation.id} count={unread} />
          </View>
          {!!conversation.folderName && (
            <View className="mt-1.5 flex-row items-center gap-1 self-start rounded-full bg-card px-2 py-0.5">
              <IconFolder size={11} color={Colors.muted} />
              <Text className="text-[11px] font-semibold text-muted" numberOfLines={1}>{conversation.folderName}</Text>
            </View>
          )}
        </View>
      </Pressable>
      <MenuButton title={conversation.title} onPress={onMenu} />
    </View>
  );
});

export const PartyRow = memo(({party, reminder, onPress, onMenu}: {party: PartyChat; reminder: boolean; onPress: () => void; onMenu: () => void}) => (
  <View className="flex-row items-center border-b border-border">
    <Pressable accessibilityRole="button" accessibilityLabel={`Open party room ${party.title}${party.unreadCount ? `, ${party.unreadCount} unread` : ''}`}
      onPress={onPress} onLongPress={onMenu} className="min-h-[76px] min-w-0 flex-1 flex-row items-center gap-3 py-3 active:opacity-70">
      <Avatar url={party.avatarUrl} title={party.title} />
      <View className="min-w-0 flex-1">
        <View className="flex-row items-center justify-between gap-2">
          <View className="min-w-0 flex-1 flex-row items-center gap-1.5">
            <Text className="shrink text-[16px] font-semibold text-foreground" numberOfLines={1}>{party.title}</Text>
            <Text className="rounded-full bg-primary-dark px-2 py-0.5 text-[10px] font-bold text-foreground">Party</Text>
            {reminder && <View testID={`reminder-${party.id}`}><IconBell size={13} color={Colors.muted} /></View>}
          </View>
          <Text className={`text-xs ${party.unreadCount ? 'text-primary' : 'text-muted'}`}>{relativeTime(party.lastActivityAt)}</Text>
        </View>
        <View className="mt-1 flex-row items-center justify-between gap-3">
          <Text className={`flex-1 text-sm ${party.unreadCount ? 'font-semibold text-foreground' : 'text-muted'}`} numberOfLines={1}>
            {party.preview ?? (party.ended ? 'This room has ended' : `Hosted by ${party.hostName}`)}
          </Text>
          <UnreadBadge id={party.id} count={party.unreadCount} />
        </View>
      </View>
    </Pressable>
    <MenuButton title={party.title} onPress={onMenu} />
  </View>
));

/** A pending seat request in a room the member hosts. Not a DM request: it opens the room, where seats are managed. */
export const RequestRow = memo(({request, onPress}: {request: PartyRequest; onPress: () => void}) => (
  <Pressable accessibilityRole="button" accessibilityLabel={`Open party room ${request.partyTitle}, seat request from ${request.requesterName}`} onPress={onPress} className={rowClass}>
    <Avatar url={request.avatarUrl} title={request.requesterName} />
    <View className="min-w-0 flex-1">
      <View className="flex-row items-center justify-between gap-2">
        <Text className="flex-1 text-[16px] font-semibold text-foreground" numberOfLines={1}>{request.requesterName}</Text>
        <Text className="text-xs text-muted">{relativeTime(request.requestedAt)}</Text>
      </View>
      <Text className="mt-1 text-sm text-muted" numberOfLines={1}>Wants a seat in {request.partyTitle}</Text>
    </View>
  </Pressable>
));
