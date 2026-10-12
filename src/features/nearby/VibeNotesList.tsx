import React, {useCallback, useEffect, useRef, useState} from 'react';
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

type NoteRowProps = {note: VibeNote; own: boolean; expanded: boolean; deleting: boolean; onPress: () => void; onDelete: () => void};

const NoteRow = ({note, own, expanded, deleting, onPress, onDelete}: NoteRowProps) => {
  const text = note.isUnlocked ? note.body : note.preview;
  const meta = [own ? 'You' : note.creator.name, note.distanceMeters === undefined ? null : noteDistanceLabel(note.distanceMeters), postedAgoLabel(note.createdAt), timeLeftLabel(note.expiresAt)].filter(Boolean).join(' · ');
  return <View className="mb-3 flex-row items-start rounded-[20px] bg-card px-4 py-4">
    <Pressable accessibilityRole="button" accessibilityLabel={note.isUnlocked ? 'Open vibe note' : 'Locked vibe note'} onPress={onPress} className="min-w-0 flex-1 active:opacity-70">
      <Text numberOfLines={expanded ? undefined : 3} className="text-[15px] leading-[21px] text-foreground">{text}{!note.isUnlocked && (text?.length ?? 0) >= 80 ? '…' : ''}</Text>
      {!note.isUnlocked && <View className="mt-2 flex-row items-center gap-1">
        <IconLock size={13} color={Colors.muted} />
        <Text className="text-xs text-muted">Get within {note.radiusMeters} m to read it</Text>
      </View>}
      <Text className="mt-2 text-xs text-muted" numberOfLines={1}>{meta}</Text>
    </Pressable>
    {own && <Pressable accessibilityRole="button" accessibilityLabel="Delete vibe note" disabled={deleting} onPress={onDelete} hitSlop={8} className="ml-3 h-8 w-8 items-center justify-center rounded-full active:bg-border">
      {deleting ? <ActivityIndicator size="small" color={Colors.coral} /> : <IconTrash size={18} color={Colors.coral} />}
    </Pressable>}
  </View>;
};

type Props = {
  /** Same range the people list uses. */
  radiusMeters: number;
  /** Changing this reloads the notes (Nearby passes its freshly loaded people list). */
  reloadKey?: unknown;
};

/** Nearby's "Vibe notes" section: post button, composer and the notes around you. */
export default function VibeNotesList({radiusMeters, reloadKey}: Props) {
  const [notes, setNotes] = useState<VibeNote[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [meId, setMeId] = useState<string | null>(null);
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

  const press = (note: VibeNote) => {
    setExpandedId(current => (current === note.id ? null : note.id));
    // Only notes the server already unlocked can be opened; it 404s the rest. Failure never matters to the UI.
    if (note.isUnlocked && !opened.current.has(note.id)) {
      opened.current.add(note.id);
      openVibeNote(note.id).catch(() => { opened.current.delete(note.id); });
    }
  };

  const remove = async (note: VibeNote) => {
    if (deletingId) return;
    setDeletingId(note.id);
    setError(null);
    try {
      await deleteVibeNote(note.id);
      setNotes(current => current?.filter(item => item.id !== note.id) ?? null);
    } catch (cause) {
      setError(nearbyErrorMessage(cause));
    } finally {
      setDeletingId(null);
    }
  };

  return <View className="mb-6">
    <View className="mb-3 flex-row items-center justify-between">
      <Text className="text-xl font-bold text-foreground">Vibe notes</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Post a vibe" onPress={() => setComposing(true)} className="h-10 flex-row items-center gap-1.5 rounded-full bg-gold px-4 active:opacity-70">
        <IconNote size={17} color={Colors.textDark} />
        <Text className="text-[13px] font-bold text-text-dark">Post a vibe</Text>
      </Pressable>
    </View>
    {!!error && <Pressable accessibilityRole="button" accessibilityLabel="Retry vibe notes" onPress={load} className="mb-3 rounded-xl bg-card p-3"><Text className="text-sm text-coral">{error} Tap to retry.</Text></Pressable>}
    {notes?.map(note => <NoteRow key={note.id} note={note} own={!!meId && note.creator.id === meId} expanded={expandedId === note.id} deleting={deletingId === note.id}
      onPress={() => press(note)} onDelete={() => remove(note)} />)}
    {notes?.length === 0 && !error && <Text className="rounded-[20px] bg-card px-4 py-4 text-sm text-muted">No vibe notes around you yet. Be the first to post one.</Text>}
    <VibeNoteComposer visible={composing} onClose={() => setComposing(false)} onPosted={load} />
  </View>;
}
