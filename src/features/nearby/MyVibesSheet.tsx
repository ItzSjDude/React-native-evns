import React, {memo, useCallback, useEffect, useRef, useState} from 'react';
import {ActivityIndicator, Alert, Pressable, Text, View} from 'react-native';
import IconNote from '@tabler/icons-react-native/IconNote';
import IconTrash from '@tabler/icons-react-native/IconTrash';
import BottomSheet from '../../components/BottomSheet';
import {Colors} from '../../Constants/Colors';
import {nearbyErrorMessage} from './nearbyErrors';
import {MY_VIBES_PAGE_SIZE, deleteVibeNote, getMyVibeNotes} from './vibeNoteService';
import type {MyVibeNote} from './vibeNoteTypes';
import {postedAgoLabel, timeLeftLabel} from './VibeNotesList';

type Props = {visible: boolean; onClose: () => void};

type MyVibeRowProps = {note: MyVibeNote; deleting: boolean; locked: boolean; onDelete: (note: MyVibeNote) => void};

const MyVibeRow = memo(({note, deleting, locked, onDelete}: MyVibeRowProps) => <View className="mb-3 rounded-2xl bg-card px-4 py-4">
  <View className="flex-row items-start gap-3">
    <Text className="min-w-0 flex-1 text-[15px] leading-[21px] text-foreground">{note.body}</Text>
    <Pressable accessibilityRole="button" accessibilityLabel="Delete your vibe" accessibilityState={{disabled: locked, busy: deleting}}
      disabled={locked} onPress={() => onDelete(note)} hitSlop={6} className="h-9 w-9 items-center justify-center rounded-full active:bg-border">
      {deleting ? <ActivityIndicator size="small" color={Colors.coral} /> : <IconTrash size={18} color={Colors.muted} />}
    </Pressable>
  </View>
  <Text className="mt-2 text-[12px] text-muted">{postedAgoLabel(note.createdAt)} · {timeLeftLabel(note.expiresAt)} · Within {note.radiusMeters} m</Text>
</View>);

/** The author's live notes, regardless of current location or discovery radius. */
export default function MyVibesSheet({visible, onClose}: Props) {
  const [notes, setNotes] = useState<MyVibeNote[]>([]);
  const [nextOffset, setNextOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const request = useRef(0);

  const load = useCallback(async (reset: boolean, offset = 0) => {
    const id = ++request.current;
    setLoading(true);
    setError(null);
    if (reset) {setNotes([]); setNextOffset(0); setHasMore(false);}
    try {
      const page = await getMyVibeNotes(offset);
      if (id !== request.current) return;
      setNotes(current => reset ? page.data : [...current, ...page.data.filter(row => !current.some(known => known.id === row.id))]);
      setNextOffset(offset + page.data.length);
      setHasMore(page.meta.hasMore);
    } catch (cause) {
      if (id === request.current) setError((cause as {status?: number})?.status === 404
        ? 'Your vibes are temporarily unavailable. Try again soon.'
        : nearbyErrorMessage(cause));
    } finally {
      if (id === request.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const requestRef = request;
    if (visible) load(true);
    else requestRef.current++;
    return () => {requestRef.current++;};
  }, [load, visible]);

  const deletingRef = useRef(deletingId);
  deletingRef.current = deletingId;
  const remove = useCallback(async (note: MyVibeNote) => {
    if (deletingRef.current) return;
    deletingRef.current = note.id;
    setDeletingId(note.id);
    setError(null);
    try {
      await deleteVibeNote(note.id);
      setNotes(current => current.filter(item => item.id !== note.id));
    } catch (cause) {
      setError(nearbyErrorMessage(cause));
    } finally {
      deletingRef.current = null;
      setDeletingId(null);
    }
  }, []);

  const confirmRemove = useCallback((note: MyVibeNote) => Alert.alert('Delete this vibe?', 'It will disappear for everyone.', [
    {text: 'Cancel', style: 'cancel'},
    {text: 'Delete', style: 'destructive', onPress: () => {remove(note);}},
  ]), [remove]);

  return <BottomSheet visible={visible} onClose={onClose} title="Your vibes" subtitle="Notes you’ve dropped that are still live." maxHeight={0.9}>
    {loading && notes.length === 0 ? <View accessibilityRole="progressbar" accessibilityLabel="Loading your vibes" className="min-h-[180px] items-center justify-center">
      <ActivityIndicator color={Colors.primary} />
    </View> : null}
    {notes.map(note => <MyVibeRow key={note.id} note={note} deleting={deletingId === note.id} locked={!!deletingId} onDelete={confirmRemove} />)}
    {!loading && !error && notes.length === 0 && <View className="min-h-[190px] items-center justify-center px-4 py-7">
      <IconNote size={34} color={Colors.muted} strokeWidth={1.5} />
      <Text className="mt-3 text-center text-[16px] font-semibold text-foreground">No live vibes yet</Text>
      <Text className="mt-1 text-center text-[13px] leading-5 text-muted">Drop one in Explore to see it here.</Text>
    </View>}
    {!!error && <Pressable accessibilityRole="button" accessibilityLabel="Retry your vibes" onPress={() => load(notes.length === 0, notes.length === 0 ? 0 : nextOffset)} className="mb-3 rounded-xl bg-card p-3">
      <Text accessibilityRole="alert" className="text-[13px] leading-5 text-coral">{error} Tap to retry.</Text>
    </Pressable>}
    {hasMore && !error && <Pressable accessibilityRole="button" accessibilityLabel="Load more of your vibes" accessibilityState={{disabled: loading}} disabled={loading}
      onPress={() => load(false, nextOffset)} className="mb-3 min-h-11 items-center justify-center rounded-full bg-card px-4 active:opacity-70">
      {loading ? <ActivityIndicator size="small" color={Colors.primary} /> : <Text className="text-[13px] font-semibold text-primary">Load more</Text>}
    </Pressable>}
    {notes.length >= MY_VIBES_PAGE_SIZE && !hasMore && <Text className="py-3 text-center text-[12px] text-muted">You’re all caught up.</Text>}
  </BottomSheet>;
}
