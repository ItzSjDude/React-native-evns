import React, {useCallback, useEffect, useRef, useState} from 'react';
import {Pressable, Text, TextInput, View} from 'react-native';
import IconArrowDown from '@tabler/icons-react-native/IconArrowDown';
import IconArrowUp from '@tabler/icons-react-native/IconArrowUp';
import IconCheck from '@tabler/icons-react-native/IconCheck';
import IconX from '@tabler/icons-react-native/IconX';
import {SheetButton, SheetSection} from '../../components/BottomSheet';
import {Colors} from '../../Constants/Colors';
import {markPartyUnavailable} from './availability';
import {errorMessage, getRunOfShow, isUnavailable, isValidNotes, isValidQuestion, listQuestions, saveRunOfShow, submitQuestion, updateQuestion} from './hostStudioService';
import {NOTES_MAX, QUESTION_MAX} from './types';
import type {PartyQuestion, QuestionStatus} from './types';
import {setActiveInterval} from '../../core/appActiveInterval';

export const QUESTIONS_POLL_MS = 5000;

const Note = ({children, alert}: {children: string; alert?: boolean}) =>
  <Text accessibilityRole={alert ? 'alert' : undefined} className={`mb-3 text-[13px] leading-5 ${alert ? 'text-coral' : 'text-muted'}`}>{children}</Text>;

const Heading = ({children}: {children: string}) => <Text className="mb-1.5 ml-1 mt-2 text-[13px] font-semibold text-muted">{children}</Text>;

/** Private to host/co-host. Never mounted for the audience, so the notes endpoint is never called for them. */
function RunOfShowNotes({partyId, onUnavailable}: {partyId: string; onUnavailable: () => void}) {
  const [notes, setNotes] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{text: string; alert: boolean} | null>(null);

  useEffect(() => {
    let live = true;
    getRunOfShow(partyId).then(result => {if (live) {setNotes(result?.notes ?? ''); setLoaded(true);}})
      .catch(cause => {
        if (!live) return;
        if (isUnavailable(cause)) onUnavailable(); else setMessage({text: errorMessage(cause, 'Could not load your notes.'), alert: true});
      });
    return () => {live = false;};
  }, [partyId, onUnavailable]);

  const save = async () => {
    if (busy || !isValidNotes(notes)) return;
    setBusy(true); setMessage(null);
    try {
      await saveRunOfShow(partyId, notes);
      setMessage({text: 'Notes saved. Only hosts and co-hosts can see them.', alert: false});
    } catch (cause) {
      if (isUnavailable(cause)) onUnavailable(); else setMessage({text: errorMessage(cause, 'Could not save your notes.'), alert: true});
    } finally {setBusy(false);}
  };

  return <View>
    <Heading>Run of show (private to hosts)</Heading>
    <TextInput accessibilityLabel="Run of show notes" value={notes} onChangeText={setNotes} editable={loaded && !busy} multiline maxLength={NOTES_MAX}
      placeholder={loaded ? 'Agenda, talking points, reminders...' : 'Loading...'} placeholderTextColor={Colors.muted} textAlignVertical="top"
      className="mb-2 min-h-[120px] rounded-xl border border-border bg-card px-4 py-3 text-[15px] text-foreground" />
    {!!message && <Note alert={message.alert}>{message.text}</Note>}
    <SheetButton label="Save notes" busy={busy} disabled={!loaded} onPress={save} />
  </View>;
}

const STATUS_LABEL: Record<QuestionStatus, string> = {PENDING: 'New', APPROVED: 'Approved', ANSWERED: 'Answered', DISMISSED: 'Dismissed'};

function QuestionQueue({partyId, onUnavailable}: {partyId: string; onUnavailable: () => void}) {
  const [items, setItems] = useState<PartyQuestion[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);
  useEffect(() => {mounted.current = true; return () => {mounted.current = false;};}, []);

  const refresh = useCallback(async () => {
    try {
      const rows = await listQuestions(partyId);
      if (mounted.current) {setItems(Array.isArray(rows) ? rows : []); setError(null);}
    } catch (cause) {
      if (!mounted.current) return;
      if (isUnavailable(cause)) onUnavailable(); else setError(errorMessage(cause, 'Could not load questions.'));
    }
  }, [partyId, onUnavailable]);

  useEffect(() => {
    refresh();
    return setActiveInterval(refresh, QUESTIONS_POLL_MS);
  }, [refresh]);

  const run = async (work: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true); setError(null);
    try {await work();} catch (cause) {
      if (isUnavailable(cause)) onUnavailable(); else setError(errorMessage(cause, 'Could not update the question.'));
    } finally {if (mounted.current) setBusy(false);}
    await refresh();
  };
  const setStatus = (question: PartyQuestion, status: QuestionStatus) => run(() => updateQuestion(partyId, question.id, {status}));
  // The server orders by (position, created_at) and does not renumber, so a move swaps the two neighbours' positions.
  const move = (index: number, delta: -1 | 1) => {
    const a = items![index]; const b = items![index + delta];
    if (!a || !b) return;
    return run(async () => {
      // Equal positions (concurrent inserts) would make a swap a no-op, so nudge instead.
      const [pa, pb] = a.position === b.position ? [delta < 0 ? Math.max(0, b.position - 1) : b.position + 1, b.position] : [b.position, a.position];
      await updateQuestion(partyId, a.id, {position: pa});
      if (pb !== b.position) await updateQuestion(partyId, b.id, {position: pb});
    });
  };

  return <View>
    <Heading>{`Audience questions${items?.length ? ` · ${items.length}` : ''}`}</Heading>
    {!!error && <Note alert>{error}</Note>}
    {items && !items.length && <Note>No questions yet. Listeners can send one from the room tools.</Note>}
    {!!items?.length && <SheetSection>
      {items.map((question, index) => <View key={question.id} className="border-b border-sheet px-4 py-2.5">
        <Text className="text-[15px] leading-6 text-foreground">{question.body}</Text>
        <Text className="mt-0.5 text-xs text-muted">{`${question.name || 'Guest'} · ${STATUS_LABEL[question.status]}`}</Text>
        <View className="mt-2 flex-row flex-wrap items-center gap-2">
          {question.status === 'PENDING' && <QuestionButton icon={IconCheck} label="Approve" disabled={busy} onPress={() => setStatus(question, 'APPROVED')} />}
          {question.status !== 'ANSWERED' && <QuestionButton icon={IconCheck} label="Mark answered" disabled={busy} onPress={() => setStatus(question, 'ANSWERED')} />}
          <QuestionButton icon={IconX} label="Dismiss" disabled={busy} onPress={() => setStatus(question, 'DISMISSED')} />
          <QuestionButton icon={IconArrowUp} label="Move up" iconOnly disabled={busy || index === 0} onPress={() => move(index, -1)} />
          <QuestionButton icon={IconArrowDown} label="Move down" iconOnly disabled={busy || index === items.length - 1} onPress={() => move(index, 1)} />
        </View>
      </View>)}
    </SheetSection>}
  </View>;
}

const QuestionButton = ({icon: Icon, label, onPress, disabled, iconOnly}: {icon: typeof IconCheck; label: string; onPress: () => void; disabled?: boolean; iconOnly?: boolean}) =>
  <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{disabled: !!disabled}} disabled={disabled} onPress={onPress} hitSlop={4}
    className={`h-9 flex-row items-center justify-center gap-1 rounded-full bg-background px-3 active:opacity-70 ${disabled ? 'opacity-40' : ''}`}>
    <Icon size={15} color={Colors.primary} />{!iconOnly && <Text className="text-xs font-semibold text-primary">{label}</Text>}
  </Pressable>;

/**
 * The API has no endpoint for audience members to read questions back, so the only feedback they get is the
 * server's response to their own submit.
 */
function AskQuestion({partyId, onUnavailable}: {partyId: string; onUnavailable: () => void}) {
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{text: string; alert: boolean} | null>(null);
  const send = async () => {
    if (busy || !isValidQuestion(body)) return;
    setBusy(true); setMessage(null);
    try {
      await submitQuestion(partyId, body.trim());
      setBody('');
      setMessage({text: 'Question sent. The host will see it in their queue.', alert: false});
    } catch (cause) {
      if (isUnavailable(cause)) {setMessage({text: 'Questions are not open in this room.', alert: true}); onUnavailable();} else setMessage({text: errorMessage(cause, 'Could not send your question.'), alert: true});
    } finally {setBusy(false);}
  };
  return <View>
    <Heading>Ask the host a question</Heading>
    <TextInput accessibilityLabel="Your question" value={body} onChangeText={setBody} multiline maxLength={QUESTION_MAX} editable={!busy}
      placeholder="Type your question..." placeholderTextColor={Colors.muted} textAlignVertical="top"
      className="mb-2 min-h-[96px] rounded-xl border border-border bg-card px-4 py-3 text-[15px] text-foreground" />
    {!!message && <Note alert={message.alert}>{message.text}</Note>}
    <SheetButton label="Send question" busy={busy} disabled={!isValidQuestion(body)} onPress={send} />
  </View>;
}

/** Body of the room's Host Studio sheet: notes + moderation queue for hosts and co-hosts, an ask box for everyone else. */
export default function StudioSheet({partyId, manager}: {partyId: string; manager: boolean}) {
  const onUnavailable = useCallback(() => markPartyUnavailable(partyId), [partyId]);
  return manager
    ? <><RunOfShowNotes partyId={partyId} onUnavailable={onUnavailable} /><QuestionQueue partyId={partyId} onUnavailable={onUnavailable} /></>
    : <AskQuestion partyId={partyId} onUnavailable={onUnavailable} />;
}
