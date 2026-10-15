import React, {memo, useCallback, useEffect, useRef, useState} from 'react';
import {ActivityIndicator, Pressable, Text, View} from 'react-native';
import IconLock from '@tabler/icons-react-native/IconLock';
import IconNote from '@tabler/icons-react-native/IconNote';
import IconTrash from '@tabler/icons-react-native/IconTrash';
import {Colors} from '../../Constants/Colors';
import {loadSession} from '../auth';
import {nearbyErrorMessage} from './nearbyErrors';
import VibeNoteComposer from './VibeNoteComposer';
import {deleteVibeNote, getNearbyVibeNotes, openVibeNote} from './vibeNoteService';
import type {VibeNote} from './vibeNoteTypes';

const MINUTE = 60_000;

/** "3h 20m left", "12m left", "ending". */
export function timeLeftLabel(expiresAt: string, now = Date.now()): string {
  const minutes = Math.floor((Date.parse(expiresAt) - now) / MINUTE);
  if (!(minutes > 0)) return 'ending';
  return minutes < 60 ? `${minutes}m left` : `${Math.floor(minutes / 60)}h${minutes % 60 ? ` ${minutes % 60}m` : ''} left`;
}

/** "now", "5m ago", "2h ago". */
export function postedAgoLabel(createdAt: string, now = Date.now()): string {
  const minutes = Math.floor((now - Date.parse(createdAt)) / MINUTE);
  if (!(minutes >= 1)) return 'now';
  return minutes < 60 ? `${minutes}m ago` : `${Math.floor(minutes / 60)}h ago`;
}

/** Rounded to 10 m, so it's a rough idea and not a precise fix. */
export const noteDistanceLabel = (meters: number) =>
  meters < 1000 ? `${Math.max(10, Math.round(meters / 10) * 10)} m away` : `${(meters / 1000).toFixed(1)} km away`;

type NoteRowProps = {note: VibeNote; own: boolean; expanded: boolean; deleting: boolean; onPress: (note: VibeNote) => void; onDelete: (note: VibeNote) => void};

const NoteRow = memo(({note, own, expanded, deleting, onPress, onDelete}: NoteRowProps) => {
  const text = note.isUnlocked ? note.body : note.preview;
  const meta = [own ? 'You' : note.creator.name, note.distanceMeters === undefined ? null : noteDistanceLabel(note.distanceMeters), postedAgoLabel(note.createdAt), timeLeftLabel(note.expiresAt)].filter(Boolean).join(' · ');
  return <View className="mb-3 flex-row items-start rounded-[20px] bg-card px-4 py-4">
    <Pressable accessibilityRole="button" accessibilityLabel={note.isUnlocked ? 'Open vibe note' : 'Locked vibe note'} onPress={() => onPress(note)} className="min-w-0 flex-1 active:opacity-70">
      <Text numberOfLines={expanded ? undefined : 3} className="text-[15px] leading-[21px] text-foreground">{text}{!note.isUnlocked && (text?.length ?? 0) >= 80 ? '…' : ''}</Text>
      {!note.isUnlocked && <View className="mt-2 flex-row items-center gap-1">
        <IconLock size={13} color={Colors.muted} />
        <Text className="text-xs text-muted">Get within {note.radiusMeters} m to read it</Text>
      </View>}
      <Text className="mt-2 text-xs text-muted" numberOfLines={1}>{meta}</Text>
    </Pressable>
    {own && <Pressable accessibilityRole="button" accessibilityLabel="Delete vibe note" disabled={deleting} onPress={() => onDelete(note)} hitSlop={8} className="ml-3 h-8 w-8 items-center justify-center rounded-full active:bg-border">
      {deleting ? <ActivityIndicator size="small" color={Colors.coral} /> : <IconTrash size={18} color={Colors.coral} />}
    </Pressable>}
  </View>;
});

type Props = {
  /** Discovery range selected on Explore. */
  radiusMeters: number;
  /** Changing this reloads the notes after location refresh. */
  reloadKey?: unknown;
  /** Hide the local composer entry when a parent screen supplies a persistent one. */
  showComposeAction?: boolean;
  /** Keep nearby notes compact when embedded above the People list. */
  previewLimit?: number;
};

/** Nearby notes: optionally show a short preview above the People list. */
export default function VibeNotesList({radiusMeters, reloadKey, showComposeAction = true, previewLimit}: Props) {
  const [notes, setNotes] = useState<VibeNote[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [meId, setMeId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const request = useRef(0);
  const opened = useRef(new Set<string>());

  const load = useCallback(async () => {
    const id = ++request.current;
    try {
      const rows = await getNearbyVibeNotes(radiusMeters);
      if (id === request.current) { setNotes(rows); setError(null); }
    } catch (cause) {
      if (id === request.current) setError(nearbyErrorMessage(cause));
    }
  }, [radiusMeters]);

  // The API has no "mine" flag, so own notes are the ones whose creator is the signed-in user.
  useEffect(() => { loadSession().then(session => setMeId(session?.user.id ?? null)).catch(() => {}); }, []);
  useEffect(() => {
    const requestRef = request;
    load();
    return () => { requestRef.current++; };
  }, [load, reloadKey]);

  const press = useCallback((note: VibeNote) => {
    setExpandedId(current => (current === note.id ? null : note.id));
    // Only notes the server already unlocked can be opened; it 404s the rest. Failure never matters to the UI.
    if (note.isUnlocked && !opened.current.has(note.id)) {
      opened.current.add(note.id);
      openVibeNote(note.id).catch(() => { opened.current.delete(note.id); });
    }
  }, []);

  const deletingRef = useRef(deletingId);
  deletingRef.current = deletingId;
  const remove = useCallback(async (note: VibeNote) => {
    if (deletingRef.current) return;
    deletingRef.current = note.id;
    setDeletingId(note.id);
    setError(null);
    try {
      await deleteVibeNote(note.id);
      setNotes(current => current?.filter(item => item.id !== note.id) ?? null);
    } catch (cause) {
      setError(nearbyErrorMessage(cause));
    } finally {
      deletingRef.current = null;
      setDeletingId(null);
    }
  }, []);

  const visibleNotes = previewLimit && !showAll ? notes?.slice(0, previewLimit) : notes;
  const hasMoreNotes = !!previewLimit && (notes?.length ?? 0) > previewLimit;

  return <View className="mb-2">
    <View className="mb-2 flex-row items-center justify-between">
      <View>
        <Text className="text-[20px] font-bold text-foreground">Vibe notes</Text>
        <Text className="mt-0.5 text-[12px] text-muted">Short notes people leave nearby</Text>
      </View>
      {hasMoreNotes && <Pressable accessibilityRole="button" accessibilityLabel={showAll ? 'Show fewer vibe notes' : 'See all vibe notes'} onPress={() => setShowAll(current => !current)} hitSlop={5} className="min-h-10 justify-center px-1 active:opacity-70">
        <Text className="text-[13px] font-semibold text-primary">{showAll ? 'Show less' : 'See all'}</Text>
      </Pressable>}
      {showComposeAction && !hasMoreNotes && <Pressable accessibilityRole="button" accessibilityLabel="Write a vibe note" onPress={() => setComposing(true)} hitSlop={5} className="min-h-9 flex-row items-center gap-1.5 px-1 active:opacity-70">
        <IconNote size={17} color={Colors.primary} />
        <Text className="text-[13px] font-semibold text-primary">Write one</Text>
      </Pressable>}
    </View>
    {!!error && <Pressable accessibilityRole="button" accessibilityLabel="Retry vibe notes" onPress={load} className="mb-3 rounded-xl bg-card p-3"><Text className="text-sm text-coral">{error} Tap to retry.</Text></Pressable>}
    {visibleNotes?.map(note => <NoteRow key={note.id} note={note} own={!!meId && note.creator.id === meId} expanded={expandedId === note.id} deleting={deletingId === note.id}
      onPress={press} onDelete={remove} />)}
    {notes?.length === 0 && !error && <View className={previewLimit ? 'rounded-2xl bg-card px-4 py-3' : 'min-h-[190px] items-center justify-center px-4 py-7'}>
      {!previewLimit && <IconNote size={34} color={Colors.muted} strokeWidth={1.5} />}
      <Text className={previewLimit ? 'text-[13px] font-semibold text-foreground' : 'mt-3 text-center text-[16px] font-semibold text-foreground'}>No notes within {Math.round(radiusMeters / 1000)} km yet</Text>
      <Text className={previewLimit ? 'mt-0.5 text-[12px] text-muted' : 'mt-1 text-center text-[13px] leading-5 text-muted'}>Be the first to leave one.</Text>
    </View>}
    {showComposeAction && <VibeNoteComposer visible={composing} onClose={() => setComposing(false)} onPosted={load} />}
  </View>;
}
