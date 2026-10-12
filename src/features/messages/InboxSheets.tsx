import React, {useEffect, useState} from 'react';
import {Pressable, Text, TextInput, View} from 'react-native';
import IconArchive from '@tabler/icons-react-native/IconArchive';
import IconArchiveOff from '@tabler/icons-react-native/IconArchiveOff';
import IconBell from '@tabler/icons-react-native/IconBell';
import IconBellOff from '@tabler/icons-react-native/IconBellOff';
import IconCheck from '@tabler/icons-react-native/IconCheck';
import IconChevronLeft from '@tabler/icons-react-native/IconChevronLeft';
import IconFolder from '@tabler/icons-react-native/IconFolder';
import IconFolderCog from '@tabler/icons-react-native/IconFolderCog';
import IconFolderOff from '@tabler/icons-react-native/IconFolderOff';
import IconLock from '@tabler/icons-react-native/IconLock';
import IconMail from '@tabler/icons-react-native/IconMail';
import IconMailOpened from '@tabler/icons-react-native/IconMailOpened';
import IconPin from '@tabler/icons-react-native/IconPin';
import IconPinnedOff from '@tabler/icons-react-native/IconPinnedOff';
import IconTrash from '@tabler/icons-react-native/IconTrash';
import BottomSheet, {SheetButton, SheetRow, SheetSection} from '../../components/BottomSheet';
import {showDialog} from '../../components/Dialog';
import {Colors} from '../../Constants/Colors';
import {REMINDER_OPTIONS, type ReminderOption} from './followUpReminders';
import {createFolder, deleteFolder, MAX_FOLDERS, MAX_FOLDER_NAME, renameFolder} from './inboxService';
import {isConversation} from './conversationPresentation';
import type {InboxFolder, InboxItem} from './types';

const messageOf = (error: unknown) => (error as {message?: string})?.message || 'Something went wrong. Please try again.';
const itemTitle = (item: InboxItem) => item.type === 'PARTY_REQUEST' ? item.partyTitle : item.title;

const Lock = () => <View className="flex-row items-center gap-1"><IconLock size={14} color={Colors.gold} /><Text className="text-[11px] font-bold text-gold">Plus</Text></View>;

type ActionsProps = {
  item: InboxItem | null;
  /** The server offers Plus at all; otherwise pin and folder rows are hidden. */
  plusOffered: boolean;
  isPlus: boolean;
  folders: InboxFolder[];
  reminderAt: string | null;
  onClose: () => void;
  onPin: () => void;
  onFolder: (folderId: string | null) => void;
  /** A free account tapped "Move to folder". */
  onLocked: () => void;
  onArchive: () => void;
  onRead: () => void;
  onRemind: (option: ReminderOption) => void;
  onCancelReminder: () => void;
  onManageFolders: () => void;
};

/** Long-press / "..." menu of one inbox row. Pin and folders look locked for free accounts and open the paywall. */
export const InboxActionsSheet = ({item, plusOffered, isPlus, folders, reminderAt, onClose, onPin, onFolder, onLocked, onArchive, onRead, onRemind, onCancelReminder, onManageFolders}: ActionsProps) => {
  const [panel, setPanel] = useState<'actions' | 'folder' | 'remind'>('actions');
  const [shown, setShown] = useState<InboxItem | null>(item);
  useEffect(() => { if (item) { setShown(item); setPanel('actions'); } }, [item]);
  // Keep the last row's content while the sheet slides away.
  const row = item ?? shown;
  const conversation = row && isConversation(row) ? row : null;
  const party = row?.type === 'PARTY' ? row : null;
  const lock = !isPlus ? <Lock /> : undefined;
  const back = <SheetRow icon={IconChevronLeft} label="Back" onPress={() => setPanel('actions')} />;

  return <BottomSheet visible={!!item} onClose={onClose} title={row ? itemTitle(row) : undefined}
    subtitle={panel === 'folder' ? 'Move to folder' : panel === 'remind' ? 'Remind me to follow up' : undefined}>
    {row && panel === 'actions' && <SheetSection>
      {conversation && (plusOffered || conversation.pinned) && <SheetRow icon={conversation.pinned ? IconPinnedOff : IconPin}
        label={conversation.pinned ? 'Unpin' : 'Pin to top'} accessory={conversation.pinned ? undefined : lock} onPress={onPin} />}
      {conversation && plusOffered && <SheetRow icon={IconFolder} label={conversation.folderName ? `Folder: ${conversation.folderName}` : 'Move to folder'}
        accessory={lock} chevron={isPlus} onPress={() => (isPlus ? setPanel('folder') : onLocked())} />}
      {(conversation || party) && <SheetRow icon={(conversation ?? party)!.archived ? IconArchiveOff : IconArchive}
        label={(conversation ?? party)!.archived ? 'Unarchive' : 'Archive'} onPress={onArchive} />}
      {party && <SheetRow icon={party.unreadCount > 0 ? IconMailOpened : IconMail}
        label={party.unreadCount > 0 ? 'Mark as read' : 'Mark as unread'} onPress={onRead} />}
      {(conversation || party) && <SheetRow icon={reminderAt ? IconBellOff : IconBell}
        label={reminderAt ? 'Reminder set' : 'Remind me'}
        description={reminderAt ? `${new Date(reminderAt).toLocaleString([], {weekday: 'short', hour: 'numeric', minute: '2-digit'})}. Tap to change or cancel.` : 'A local notification, never with message text'}
        chevron onPress={() => setPanel('remind')} />}
    </SheetSection>}

    {row && panel === 'folder' && <SheetSection>
      {back}
      {folders.map(folder => <SheetRow key={folder.id} icon={IconFolder} label={folder.name} accessibilityLabel={`Move to ${folder.name}`}
        accessory={conversation?.folderId === folder.id ? <IconCheck size={18} color={Colors.gold} /> : undefined}
        onPress={() => onFolder(folder.id)} />)}
      {conversation?.folderId ? <SheetRow icon={IconFolderOff} label="Remove from folder" onPress={() => onFolder(null)} /> : null}
      <SheetRow icon={IconFolderCog} label={folders.length ? 'Manage folders' : 'Create a folder'} onPress={onManageFolders} />
    </SheetSection>}

    {row && panel === 'remind' && <SheetSection>
      {back}
      {REMINDER_OPTIONS.map(option => <SheetRow key={option.id} icon={IconBell} label={option.label} onPress={() => onRemind(option.id)} />)}
      {reminderAt ? <SheetRow icon={IconBellOff} label="Cancel reminder" destructive onPress={onCancelReminder} /> : null}
    </SheetSection>}
  </BottomSheet>;
};

type FoldersProps = {
  visible: boolean;
  folders: InboxFolder[];
  onClose: () => void;
  onChange: (folders: InboxFolder[]) => void;
  /** 403 PLUS_REQUIRED from a folder call: the parent refreshes the subscription and opens the paywall. */
  onPlusRequired: (error: unknown) => boolean;
};

/** Create, rename and delete folders (Plus). The API allows 10 folders with case-insensitive unique names. */
export const FolderManagerSheet = ({visible, folders, onClose, onChange, onPlusRequired}: FoldersProps) => {
  const [name, setName] = useState('');
  const [editing, setEditing] = useState<InboxFolder | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (!visible) { setName(''); setEditing(null); setError(null); } }, [visible]);
  const full = !editing && folders.length >= MAX_FOLDERS;

  const run = async (action: () => Promise<void>) => {
    setBusy(true); setError(null);
    try { await action(); } catch (cause) { if (!onPlusRequired(cause)) setError(messageOf(cause)); } finally { setBusy(false); }
  };
  const submit = () => {
    const value = name.trim();
    if (!value || busy || full) return;
    run(async () => {
      if (editing) {
        const updated = await renameFolder(editing.id, value);
        onChange(folders.map(folder => folder.id === updated.id ? updated : folder));
      } else {
        onChange([...folders, await createFolder(value)]);
      }
      setName(''); setEditing(null);
    });
  };
  const remove = (folder: InboxFolder) => showDialog(`Delete "${folder.name}"?`, 'Chats in this folder stay in your inbox.', [
    {text: 'Cancel', style: 'cancel'},
    {text: 'Delete', style: 'destructive', onPress: () => run(async () => {
      await deleteFolder(folder.id);
      onChange(folders.filter(item => item.id !== folder.id));
    })},
  ]);

  return <BottomSheet visible={visible} onClose={onClose} title="Folders" subtitle={`${folders.length} of ${MAX_FOLDERS} folders`} dismissible={!busy}
    footer={<SheetButton label={editing ? 'Save name' : 'Create folder'} onPress={submit} busy={busy} disabled={!name.trim() || full} />}>
    {folders.length > 0 && <SheetSection>
      {folders.map(folder => <SheetRow key={folder.id} icon={IconFolder} label={folder.name} description="Tap to rename" accessibilityLabel={`Rename ${folder.name}`}
        onPress={() => { setEditing(folder); setName(folder.name); setError(null); }}
        accessory={<Pressable accessibilityRole="button" accessibilityLabel={`Delete ${folder.name}`} hitSlop={8} disabled={busy} onPress={() => remove(folder)}>
          <IconTrash size={18} color={Colors.coral} />
        </Pressable>} />)}
    </SheetSection>}
    <TextInput accessibilityLabel="Folder name" className="mb-2 h-12 rounded-2xl border border-border bg-card px-4 text-[15px] text-foreground"
      placeholder={editing ? 'New name' : 'New folder name'} placeholderTextColor={Colors.muted} value={name} onChangeText={setName}
      maxLength={MAX_FOLDER_NAME} returnKeyType="done" onSubmitEditing={submit} autoCorrect={false} />
    {full && <Text className="mb-2 text-[13px] text-muted">You can have up to {MAX_FOLDERS} folders. Delete one to add another.</Text>}
    {editing && <Text accessibilityRole="button" onPress={() => { setEditing(null); setName(''); }} className="mb-2 text-[13px] font-semibold text-muted">Cancel rename</Text>}
    {!!error && <Text accessibilityRole="alert" className="mb-2 text-[13px] text-coral">{error}</Text>}
  </BottomSheet>;
};
