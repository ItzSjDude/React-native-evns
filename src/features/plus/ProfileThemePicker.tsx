import React, {useEffect, useState} from 'react';
import {Pressable, Text, View} from 'react-native';
import IconLock from '@tabler/icons-react-native/IconLock';
import {Colors} from '../../Constants/Colors';
import {loadThemePrices, purchaseTheme, restoreThemePurchases, toThemeBillingError} from './billing';
import {isPlusRequired} from './limits';
import {openPaywall} from './plusStore';
import {themeSwatch} from './profileTheme';
import type {ProfileThemeEntry, ProfileThemeId} from './types';
import {useProfileThemes} from './useProfileThemes';

type Notice = {error: boolean; text: string};
const NOT_OWNED_MESSAGE = 'Buy this theme to use it.';

/**
 * Theme list from the server catalog. Free/owned themes are selectable, Plus themes open the paywall,
 * permanent packs show the Play price and a Buy button. The stored selection is only an id.
 */
export default function ProfileThemePicker({selected, onChange}: {
  selected: ProfileThemeId;
  onChange?: (patch: {profileTheme: ProfileThemeId}) => Promise<unknown> | void;
}) {
  const {themes, refresh} = useProfileThemes();
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  // `productId` is absent while permanent themes are off, so these are only packs that are on sale.
  const sold = (themes ?? []).filter(theme => theme.access === 'PURCHASE' && !!theme.productId).map(theme => theme.productId!);
  const buyableKey = (themes ?? []).filter(theme => theme.access === 'PURCHASE' && !theme.owned && !!theme.productId).map(theme => theme.productId).join(',');
  useEffect(() => {
    if (!buyableKey) return;
    let mounted = true;
    loadThemePrices(buyableKey.split(',')).then(next => {if (mounted) setPrices(next);}).catch(() => {});
    return () => {mounted = false;};
  }, [buyableKey]);

  /** PATCHes the selection; PLUS_REQUIRED means our cached plan is stale, THEME_NOT_OWNED that the catalog is. */
  const select = async (id: ProfileThemeId): Promise<boolean> => {
    try {
      await onChange?.({profileTheme: id});
      return true;
    } catch (error) {
      refresh().catch(() => {});
      if (isPlusRequired(error)) openPaywall();
      else setNotice({error: true, text: (error as {code?: string})?.code === 'THEME_NOT_OWNED' ? NOT_OWNED_MESSAGE : (error as {message?: string})?.message ?? 'Couldn’t change your theme. Please try again.'});
      return false;
    }
  };

  const run = async (task: () => Promise<void>) => {
    if (busy) return;
    setBusy(true); setNotice(null);
    try {await task();}
    catch (error) {setNotice({error: true, text: toThemeBillingError(error).message});}
    finally {setBusy(false);}
  };

  const buy = (theme: ProfileThemeEntry) => run(async () => {
    const outcome = await purchaseTheme(theme.productId!);
    if (outcome.status === 'pending') {setNotice({error: false, text: toThemeBillingError({code: 'pending'}).message}); return;}
    if (await select(outcome.themeId)) setNotice({error: false, text: `${theme.name} unlocked.`});
  });

  const restore = () => run(async () => {
    await restoreThemePurchases(sold);
    setNotice({error: false, text: 'Theme purchases restored.'});
  });

  const onPress = (theme: ProfileThemeEntry) => {
    if (busy) return;
    setNotice(null);
    if (theme.owned && theme.available) select(theme.id);
    else if (theme.access === 'PLUS') openPaywall();
    else if (theme.productId) buy(theme);
  };

  // A pack that isn't on sale (no productId) and isn't usable can't be bought or picked: hide it.
  const visible = (themes ?? []).filter(theme => theme.access !== 'PURCHASE' || !!theme.productId || (theme.owned && theme.available));
  if (!visible.length) return null;
  const usable = visible.some(theme => theme.id === selected && theme.owned && theme.available);

  return <View className="border-t border-border/60 dark:border-[#211D2C] px-4 py-3">
    <Text className="text-[14px] font-semibold text-foreground">Profile theme</Text>
    <Text className="mb-2.5 text-xs text-muted">Everyone who visits your profile sees it.</Text>
    <View accessibilityRole="radiogroup" className="flex-row flex-wrap gap-2.5">
      {visible.map(theme => {
        const active = (usable ? selected : 'default') === theme.id;
        const locked = !(theme.owned && theme.available);
        const price = theme.access === 'PURCHASE' && locked ? prices[theme.productId ?? ''] ?? 'Buy' : null;
        return <Pressable key={theme.id} accessibilityRole="radio" accessibilityState={{checked: active, disabled: busy}}
          accessibilityLabel={price ? `Buy ${theme.name} theme, ${price}` : `${theme.name} theme`} onPress={() => onPress(theme)}
          className={`h-11 min-w-[104px] flex-row items-center justify-center gap-2 rounded-full border-2 px-4 active:opacity-80 ${active ? 'border-gold bg-gold-bg' : 'border-border'}`}>
          <View style={{backgroundColor: themeSwatch(theme.id)}} className="h-3.5 w-3.5 rounded-full" />
          <Text className="text-[13px] font-bold text-foreground">{theme.name}</Text>
          {theme.access === 'PLUS' && locked && <IconLock size={14} color={Colors.gold} />}
          {!!price && <Text className="text-[12px] font-extrabold text-gold">{price}</Text>}
        </Pressable>;
      })}
    </View>
    {sold.length > 0 && <Pressable accessibilityRole="button" accessibilityLabel="Restore theme purchases" accessibilityState={{busy}} disabled={busy} onPress={restore}
      className="mt-2.5 self-start active:opacity-70">
      <Text className="text-[12px] font-semibold text-purple-soft">{busy ? 'Working…' : 'Restore theme purchases'}</Text>
    </Pressable>}
    {!!notice && <Text accessibilityRole={notice.error ? 'alert' : undefined} className={`mt-2 text-[12px] font-semibold ${notice.error ? 'text-coral' : 'text-purple-soft'}`}>{notice.text}</Text>}
  </View>;
}
