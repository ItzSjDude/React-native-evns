import React, {memo, useCallback, useEffect, useRef, useState} from 'react';
import {ActivityIndicator, Pressable, Text, View} from 'react-native';
import {FlashList} from '@shopify/flash-list';
import IconChevronRight from '@tabler/icons-react-native/IconChevronRight';
import {Colors} from '../../Constants/Colors';
import {DirectConversation, type OrganizerActionsContext} from '../messages';
import OrganizerCreditsScreen from './OrganizerCreditsScreen';
import SalesActionBar from './SalesActionBar';
import {listSalesThreads} from './organizerService';
import {formatWhen, messageOf} from './organizerPresentation';
import type {SalesThread} from './types';

const keyOf = (thread: SalesThread) => thread.id;
const Gap = () => <View className="h-3" />;
const LIST_CONTENT = {paddingHorizontal: 16, paddingTop: 16, paddingBottom: 40};

const statusLabel = (thread: SalesThread) => thread.status === 'CLOSED' ? 'Closed' : thread.unreadCount > 0 ? `${thread.unreadCount} new` : 'Open';

const Row = memo(function Row({thread, onPress}: {thread: SalesThread; onPress: (thread: SalesThread) => void}) {
  return <Pressable accessibilityRole="button" accessibilityLabel={`${thread.buyerName}, ${thread.eventTitle}, ${statusLabel(thread)}`} onPress={() => onPress(thread)} className="rounded-[18px] border border-border bg-card p-4 active:opacity-80">
    <View className="flex-row items-center">
      <View className="flex-1">
        <Text numberOfLines={1} className="text-[14px] font-bold text-foreground">{thread.buyerName}</Text>
        <Text numberOfLines={1} className="mt-0.5 text-[12px] text-muted">{thread.eventTitle}</Text>
        {!!thread.lastMessagePreview && <Text numberOfLines={1} className="mt-1 text-[13px] text-foreground">{thread.lastMessagePreview}</Text>}
        <Text className="mt-1 text-[11px] text-muted">{formatWhen(thread.lastActivityAt)}</Text>
      </View>
      <Text className={`mr-2 text-[11px] font-bold ${thread.unreadCount > 0 ? 'text-gold' : 'text-muted'}`}>{statusLabel(thread)}</Text>
      <IconChevronRight size={18} color={Colors.muted} />
    </View>
  </Pressable>;
});

/** "Sales" section of the organiser dashboard: one thread per buyer. Opens the shared conversation UI with organiser actions. */
export default function OrganizerSalesInbox({workspaceId, onAccessRevoked}: {workspaceId: string; onAccessRevoked?: () => void}) {
  const [threads, setThreads] = useState<SalesThread[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [openThread, setOpenThread] = useState<SalesThread | null>(null);
  const [creditsOpen, setCreditsOpen] = useState(false);
  const request = useRef(0);
  const revokedRef = useRef(onAccessRevoked);
  revokedRef.current = onAccessRevoked;

  const load = useCallback(async () => {
    const id = ++request.current;
    setLoading(true); setError(null); setUnavailable(false);
    try {
      const page = await listSalesThreads(workspaceId);
      if (id === request.current) setThreads(page.items);
    } catch (cause) {
      if (id !== request.current) return;
      const status = (cause as {status?: number} | null)?.status;
      if (status === 404) { setThreads([]); setUnavailable(true); }
      else if (status === 403) revokedRef.current?.();
      else setError(messageOf(cause));
    } finally {
      if (id === request.current) setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    const counter = request;
    setOpenThread(null); load();
    return () => { counter.current++; };
  }, [load]);

  const closeThread = useCallback(() => { setOpenThread(null); load(); }, [load]);
  const renderRow = useCallback(({item}: {item: SalesThread}) => <Row thread={item} onPress={setOpenThread} />, []);
  const renderActions = useCallback((context: OrganizerActionsContext) => openThread
    ? <SalesActionBar {...context} workspaceId={workspaceId} thread={openThread} onBuyCredits={() => { setOpenThread(null); setCreditsOpen(true); }} />
    : null, [openThread, workspaceId]);

  return <View className="flex-1">
    {loading && <View className="py-8"><ActivityIndicator accessibilityLabel="Loading sales" color={Colors.gold} /></View>}
    {!!error && !loading && <View className="mx-4 mt-4 rounded-[18px] border border-border bg-card p-4"><Text accessibilityRole="alert" className="text-[14px] leading-5 text-coral">{error}</Text><Pressable accessibilityRole="button" onPress={load} className="mt-3 self-start rounded-full bg-gold px-4 py-2"><Text className="text-[13px] font-bold text-gold-ink">Try again</Text></Pressable></View>}
    {!loading && !error && <FlashList contentContainerStyle={LIST_CONTENT} data={threads} keyExtractor={keyOf} renderItem={renderRow} ItemSeparatorComponent={Gap}
      ListEmptyComponent={<View className="items-center rounded-[18px] border border-border bg-card px-5 py-7"><Text className="text-center text-[14px] leading-5 text-muted">{unavailable ? 'Ticket sales chat is not available right now.' : 'No buyer conversations yet. When someone asks to buy a ticket, it shows up here.'}</Text></View>} />}
    {openThread && <DirectConversation conversationId={openThread.id} contactId="" contactName={openThread.buyerName} contactAvatarUrl={openThread.buyerAvatarUrl}
      kind="EVENT" backLabel="Back to sales" pollIntervalMs={5000} renderOrganizerActions={renderActions} onClose={closeThread} />}
    <OrganizerCreditsScreen visible={creditsOpen} onClose={() => setCreditsOpen(false)} />
  </View>;
}
