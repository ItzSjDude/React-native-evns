import React, {useCallback, useEffect, useState} from 'react';
import {ActivityIndicator, AppState, Modal, Pressable, ScrollView, Text, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import IconChevronLeft from '@tabler/icons-react-native/IconChevronLeft';
import IconTicket from '@tabler/icons-react-native/IconTicket';
import RazorpayCheckout from 'react-native-razorpay';
import {Colors} from '../../Constants/Colors';
import {formatDelta, formatWhen, LEDGER_REASON_LABELS, messageOf, money, PURCHASE_STATUS_LABELS} from './organizerPresentation';
import {getCreditOverview, listCreditPacks, listMyWorkspaces, startCreditPackPurchase} from './organizerService';
import type {CreditOverview, CreditPack, Workspace} from './types';

const Group = ({title, children}: {title: string; children: React.ReactNode}) =>
  <View className="mt-5">
    <Text accessibilityRole="header" className="mb-1.5 ml-1 text-[13px] font-semibold text-muted">{title}</Text>
    {children}
  </View>;

const Centered = ({children}: {children: React.ReactNode}) => <View className="items-center justify-center px-6 py-8">{children}</View>;

const RetryButton = ({onPress}: {onPress: () => void}) =>
  <Pressable accessibilityRole="button" accessibilityLabel="Retry" onPress={onPress} className="mt-3 rounded-full bg-gold px-5 py-2.5">
    <Text className="text-[13px] font-extrabold text-gold-ink">Retry</Text>
  </Pressable>;

const WorkspacePicker = ({workspaces, selectedId, onSelect}: {workspaces: Workspace[]; selectedId: string | null; onSelect: (id: string) => void}) =>
  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2 px-4 pb-1">
    {workspaces.map(workspace => {
      const selected = workspace.id === selectedId;
      return <Pressable key={workspace.id} accessibilityRole="button" accessibilityLabel={workspace.name} accessibilityState={{selected}}
        onPress={() => onSelect(workspace.id)}
        className={`rounded-full px-4 py-2 ${selected ? 'bg-gold' : 'border border-border bg-card'}`}>
        <Text numberOfLines={1} className={`text-[13px] font-bold ${selected ? 'text-gold-ink' : 'text-foreground'}`}>{workspace.name}</Text>
      </Pressable>;
    })}
  </ScrollView>;

const BalanceCard = ({workspace, balance}: {workspace: Workspace; balance: number}) =>
  <View className="mx-4 flex-row items-center gap-3 rounded-[22px] border border-purple-line bg-purple-tint p-4">
    <View className="h-12 w-12 items-center justify-center rounded-full bg-gold"><IconTicket size={22} color={Colors.goldInk} /></View>
    <View className="min-w-0 flex-1">
      <Text numberOfLines={1} className="text-[13px] text-purple-soft">{workspace.name}</Text>
      <Text className="text-[22px] font-extrabold text-foreground">{balance} ticket credits</Text>
    </View>
  </View>;

const LedgerRow = ({entry, first}: {entry: CreditOverview['ledger'][number]; first?: boolean}) =>
  <View className={`flex-row items-center gap-3 px-4 py-3 ${first ? '' : 'border-t border-border/60'}`}>
    <View className="min-w-0 flex-1">
      <Text className="text-[14px] font-semibold text-foreground">{LEDGER_REASON_LABELS[entry.reason]}</Text>
      <Text className="mt-0.5 text-xs text-muted">{formatWhen(entry.createdAt)}</Text>
    </View>
    <View className="items-end">
      <Text className={`text-[14px] font-bold ${entry.delta >= 0 ? 'text-foreground' : 'text-coral'}`}>{formatDelta(entry.delta)}</Text>
      <Text className="mt-0.5 text-xs text-muted">Balance {entry.balanceAfter}</Text>
    </View>
  </View>;

const PurchaseRow = ({purchase, first}: {purchase: CreditOverview['recentPurchases'][number]; first?: boolean}) =>
  <View className={`flex-row items-center gap-3 px-4 py-3 ${first ? '' : 'border-t border-border/60'}`}>
    <View className="min-w-0 flex-1">
      <Text className="text-[14px] font-semibold text-foreground">{purchase.quantity} credits</Text>
      <Text className="mt-0.5 text-xs text-muted">{formatWhen(purchase.createdAt)}</Text>
    </View>
    <View className="items-end">
      <Text className="text-[14px] font-bold text-foreground">{money(purchase.amountMinor, purchase.currency)}</Text>
      <Text className="mt-0.5 text-xs text-muted">{PURCHASE_STATUS_LABELS[purchase.status]}</Text>
    </View>
  </View>;

/** Workspace-scoped balance, ledger, purchase history and fixed server-priced pack checkout. */
export default function OrganizerCreditsScreen({visible, onClose}: {visible: boolean; onClose: () => void}) {
  const [workspaces, setWorkspaces] = useState<Workspace[] | null>(null);
  const [workspacesError, setWorkspacesError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [overview, setOverview] = useState<CreditOverview | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [overviewError, setOverviewError] = useState<string | null>(null);
  const [packs, setPacks] = useState<CreditPack[]>([]);
  const [packsLoading, setPacksLoading] = useState(false);
  const [packsError, setPacksError] = useState<string | null>(null);
  const [selectedPackKey, setSelectedPackKey] = useState<string | null>(null);
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [statusRefreshing, setStatusRefreshing] = useState(false);
  const [checkoutNotice, setCheckoutNotice] = useState<{error: boolean; text: string} | null>(null);

  const loadWorkspaces = useCallback(() => {
    setWorkspaces(null); setWorkspacesError(null); setSelectedId(null); setOverview(null);
    listMyWorkspaces()
      .then(all => {
        const organizerWorkspaces = all.filter(w => w.role === 'OWNER' || w.role === 'ADMIN');
        setWorkspaces(organizerWorkspaces);
        setSelectedId(organizerWorkspaces[0]?.id ?? null);
      })
      .catch(error => setWorkspacesError(messageOf(error)));
  }, []);

  useEffect(() => {if (visible) loadWorkspaces();}, [visible, loadWorkspaces]);

  const loadOverview = useCallback((workspaceId: string) => {
    setOverview(null); setOverviewError(null); setOverviewLoading(true);
    getCreditOverview(workspaceId)
      .then(setOverview)
      .catch(error => setOverviewError(messageOf(error)))
      .finally(() => setOverviewLoading(false));
  }, []);

  const loadPacks = useCallback(async (workspaceId: string) => {
    setPacks([]); setPacksError(null); setSelectedPackKey(null); setPacksLoading(true);
    try {
      const result = await listCreditPacks(workspaceId);
      const safe = result.filter(pack => !!pack.key && Number.isInteger(pack.quantity) && pack.quantity > 0
        && Number.isInteger(pack.amountMinor) && pack.amountMinor > 0 && !!pack.currency);
      setPacks(safe);
      setSelectedPackKey(safe[0]?.key ?? null);
    } catch (error) {
      setPacksError(messageOf(error));
    } finally {setPacksLoading(false);}
  }, []);

  const selected = workspaces?.find(w => w.id === selectedId) ?? null;

  useEffect(() => {if (selectedId) loadOverview(selectedId);}, [selectedId, loadOverview]);
  useEffect(() => {
    if (visible && selected?.role === 'OWNER' && selectedId) loadPacks(selectedId);
    else {setPacks([]); setSelectedPackKey(null);}
  }, [visible, selected?.role, selectedId, loadPacks]);

  const refreshStatus = useCallback(async (workspaceId: string, purchaseId?: string) => {
    setStatusRefreshing(true);
    try {
      const next = await getCreditOverview(workspaceId);
      setOverview(next); setOverviewError(null);
      const tracked = purchaseId ? next.recentPurchases.find(purchase => purchase.id === purchaseId) : null;
      if (tracked?.status === 'PAID') {
        setCheckoutNotice({error: false, text: 'Payment confirmed. Ticket credits are ready.'});
      } else if (tracked?.status === 'PENDING') {
        setCheckoutNotice({error: false, text: 'Payment is still being confirmed. Credits appear after server verification.'});
      } else if (tracked?.status === 'FAILED' || tracked?.status === 'REFUNDED') {
        setCheckoutNotice({error: true, text: `Payment ${tracked.status.toLowerCase()}. No ticket credits were added.`});
      }
    } catch (error) {
      setOverviewError(messageOf(error));
    } finally {setStatusRefreshing(false);}
  }, []);

  useEffect(() => {
    if (!visible || !selectedId) return;
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') refreshStatus(selectedId);
    });
    return () => subscription.remove();
  }, [visible, selectedId, refreshStatus]);

  const buySelectedPack = async () => {
    if (!selected || selected.role !== 'OWNER' || !selectedPackKey || checkoutBusy) return;
    const pack = packs.find(item => item.key === selectedPackKey);
    if (!pack) return;
    setCheckoutBusy(true); setCheckoutNotice(null);
    let purchaseId: string | undefined;
    try {
      const started = await startCreditPackPurchase(selected.id, pack.key, `credit-pack:${Date.now()}:${Math.random().toString(36).slice(2, 14)}`);
      purchaseId = started.purchase.id;
      const {checkout} = started;
      if (checkout.provider !== 'razorpay' || !checkout.keyId || !checkout.orderId
        || checkout.amountMinor <= 0 || checkout.amountMinor !== pack.amountMinor
        || checkout.currency.toUpperCase() !== pack.currency.toUpperCase()) {
        throw new Error('Secure checkout is not configured for this ticket pack.');
      }
      await RazorpayCheckout.open({
        key: checkout.keyId,
        order_id: checkout.orderId,
        amount: String(checkout.amountMinor),
        currency: checkout.currency,
        name: 'Hiva',
        description: `${pack.quantity} ticket credits`,
        theme: {color: Colors.primary},
      });
      setCheckoutNotice({error: false, text: 'Payment submitted. Credits unlock only after server confirmation.'});
      await refreshStatus(selected.id, purchaseId);
    } catch (error) {
      const message = (error as {description?: string; message?: string} | null)?.description
        || (error as {message?: string} | null)?.message;
      const canceled = !!message?.toLowerCase().includes('cancel');
      setCheckoutNotice({error: !canceled, text: canceled
        ? 'Checkout closed. If payment went through, refresh status to see the server confirmation.'
        : 'Checkout didn’t finish. If your bank charged you, refresh status; credits require server confirmation.'});
      if (selectedId) refreshStatus(selectedId, purchaseId);
    } finally {setCheckoutBusy(false);}
  };

  return <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
    <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-background">
      <View className="flex-row items-center gap-3 border-b border-border/60 px-4 pb-3 pt-2">
        <Pressable accessibilityRole="button" accessibilityLabel="Back to settings" onPress={onClose}
          className="h-11 w-11 items-center justify-center rounded-[14px] border border-border bg-card active:opacity-70">
          <IconChevronLeft size={20} color={Colors.text} />
        </Pressable>
        <Text accessibilityRole="header" className="flex-1 font-display text-[22px] text-foreground">Ticket credits</Text>
      </View>

      {workspaces === null && !workspacesError && <Centered><ActivityIndicator accessibilityLabel="Loading workspaces" color={Colors.gold} /></Centered>}

      {!!workspacesError && <Centered>
        <Text accessibilityRole="alert" className="text-center text-[14px] text-coral">{workspacesError}</Text>
        <RetryButton onPress={loadWorkspaces} />
      </Centered>}

      {workspaces !== null && !workspacesError && workspaces.length === 0 && <Centered>
        <Text className="text-[34px]">🎟️</Text>
        <Text className="mt-2 text-[16px] font-extrabold text-foreground">No workspaces to manage</Text>
        <Text className="mt-1 text-center text-[13px] text-muted">You’ll see ticket credits here for workspaces where you’re an owner or admin.</Text>
      </Centered>}

      {!!workspaces?.length && <ScrollView contentContainerClassName="pb-8">
        {workspaces.length > 1 && <View className="pt-3"><WorkspacePicker workspaces={workspaces} selectedId={selectedId} onSelect={setSelectedId} /></View>}

        {!!selected && <View className="pt-3"><BalanceCard workspace={selected} balance={overview?.balance ?? selected.ticketBalance} /></View>}

        {selected?.role === 'OWNER' && <Group title="Buy ticket credits">
          {packsLoading && <Centered><ActivityIndicator accessibilityLabel="Loading ticket packs" color={Colors.gold} /></Centered>}
          {!!packsError && <View className="px-4 py-3">
            <Text accessibilityRole="alert" className="text-[13px] text-coral">{packsError}</Text>
            {!!selectedId && <RetryButton onPress={() => loadPacks(selectedId)} />}
          </View>}
          {!packsLoading && !packsError && packs.length === 0 && <Text className="px-4 py-3 text-[13px] text-muted">Ticket packs aren’t available right now.</Text>}
          {!!packs.length && <View className="gap-2 px-4">
            {packs.map(pack => {
              const active = selectedPackKey === pack.key;
              return <Pressable key={pack.key} accessibilityRole="radio" accessibilityLabel={`${pack.quantity} ticket credits, ${money(pack.amountMinor, pack.currency)}`}
                accessibilityState={{checked: active}} onPress={() => setSelectedPackKey(pack.key)}
                className={`min-h-[60px] flex-row items-center justify-between rounded-xl border px-4 py-3 ${active ? 'border-primary bg-primary-dark/40' : 'border-border bg-card'}`}>
                <View><Text className="text-[15px] font-semibold text-foreground">{pack.quantity} credits</Text>
                  <Text className="mt-0.5 text-[13px] text-muted">Fixed pack · server-priced</Text></View>
                <Text className="text-[15px] font-bold text-foreground">{money(pack.amountMinor, pack.currency)}</Text>
              </Pressable>;
            })}
            {!!checkoutNotice && <Text accessibilityRole={checkoutNotice.error ? 'alert' : undefined} accessibilityLiveRegion="polite"
              className={`text-[13px] leading-5 ${checkoutNotice.error ? 'text-coral' : 'text-muted'}`}>{checkoutNotice.text}</Text>}
            <Pressable accessibilityRole="button" accessibilityLabel="Buy selected ticket credit pack"
              accessibilityState={{disabled: checkoutBusy || !selectedPackKey, busy: checkoutBusy}}
              disabled={checkoutBusy || !selectedPackKey} onPress={buySelectedPack}
              className={`h-11 items-center justify-center rounded-full px-5 ${checkoutBusy ? 'bg-card' : 'bg-gold'}`}>
              {checkoutBusy ? <ActivityIndicator size="small" color={Colors.goldInk} />
                : <Text className="text-[14px] font-bold text-gold-ink">Buy selected pack</Text>}
            </Pressable>
          </View>}
        </Group>}

        {overviewLoading && <Centered><ActivityIndicator accessibilityLabel="Loading ticket credits" color={Colors.gold} /></Centered>}

        {!!overviewError && <Centered>
          <Text accessibilityRole="alert" className="text-center text-[14px] text-coral">{overviewError}</Text>
          {!!selectedId && <RetryButton onPress={() => loadOverview(selectedId)} />}
        </Centered>}

        {!!overview && <>
          <Group title="Ledger">
            <View className="overflow-hidden rounded-[20px] border border-border bg-card">
              {overview.ledger.length === 0
                ? <Text className="px-4 py-6 text-center text-[13px] text-muted">No ledger activity yet.</Text>
                : overview.ledger.map((entry, index) => <LedgerRow key={entry.id} entry={entry} first={index === 0} />)}
            </View>
          </Group>

          <Group title="Recent purchases">
            <View className="overflow-hidden rounded-[20px] border border-border bg-card">
              {overview.recentPurchases.length === 0
                ? <Text className="px-4 py-6 text-center text-[13px] text-muted">No purchases yet.</Text>
                : overview.recentPurchases.map((purchase, index) => <PurchaseRow key={purchase.id} purchase={purchase} first={index === 0} />)}
            </View>
            {overview.recentPurchases.some(purchase => purchase.status === 'PENDING') && !!selectedId && <Pressable accessibilityRole="button"
              accessibilityLabel="Check ticket credit payment status" accessibilityState={{disabled: statusRefreshing, busy: statusRefreshing}}
              disabled={statusRefreshing} onPress={() => refreshStatus(selectedId)} className="mt-2 min-h-11 items-center justify-center rounded-full active:opacity-70">
              {statusRefreshing ? <ActivityIndicator size="small" color={Colors.primary} /> : <Text className="text-[14px] font-semibold text-primary">Check payment status</Text>}
            </Pressable>}
          </Group>
        </>}
      </ScrollView>}
    </SafeAreaView>
  </Modal>;
}
