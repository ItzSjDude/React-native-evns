import React, {memo, type ReactNode} from 'react';
import {ActivityIndicator, Pressable, Text, View} from 'react-native';
import IconMapPin from '@tabler/icons-react-native/IconMapPin';
import IconMessageCircle from '@tabler/icons-react-native/IconMessageCircle';
import {Colors} from '../Constants/Colors';
import RemoteImage from './RemoteImage';

export type PersonRowProps = {
  name: string;
  avatarUrl?: string | null;
  /** Shown as `@handle`. */
  handle?: string | null;
  /** True only when the API says the person opted in to the Plus badge. */
  plusBadge?: boolean;
  /** True only when the API says the person is active now and allows it to be shown. */
  activeNow?: boolean;
  /** "Follows you". Only pass it when the API provides it. */
  followsYou?: boolean;
  /** Short intent / bio line. */
  bio?: string | null;
  bioLines?: number;
  /** Coarse place line, e.g. "Under 2 km" or a city. Never exact distance. */
  meta?: string | null;
  /** Extra highlighted line, e.g. "Both at Sunburn". */
  hint?: string | null;
  /** Inline error, shown in coral under the text. */
  notice?: string | null;
  interests?: readonly string[];
  /** Interests the viewer shares; they are drawn first and highlighted. */
  sharedInterests?: readonly string[];
  /** Chips shown before the overflow "+N" chip. */
  maxChips?: number;
  /** Tapping the identity area. */
  onPress?: () => void;
  accessibilityLabel?: string;
  /** Primary call to action (Say hi). */
  actionLabel?: string;
  actionAccessibilityLabel?: string;
  actionBusy?: boolean;
  onAction?: () => void;
  /** Anything after the primary action: a follow button, a status pill, a chevron. */
  trailing?: ReactNode;
  /** Content under the identity block, full width (card variant). */
  footer?: ReactNode;
  /** `row` is a list row with a divider; `card` is a standalone rounded card. */
  variant?: 'row' | 'card';
  testID?: string;
};

const initialsOf = (name: string) => name.trim().split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase() || '?';
const isRemote = (url?: string | null): url is string => !!url && /^https?:\/\//i.test(url);
const AVATAR = 48;

/** Orders shared interests first and splits what fits from the overflow count. Exported for tests. */
export function arrangeChips(interests: readonly string[] = [], shared: readonly string[] = [], max = 3) {
  const sharedKeys = new Set(shared.map(item => item.trim().toLowerCase()));
  const unique = [...new Set(interests.map(item => item.trim()).filter(Boolean))];
  const isShared = (item: string) => sharedKeys.has(item.toLowerCase());
  const ordered = [...unique.filter(isShared), ...unique.filter(item => !isShared(item))];
  const limit = Math.max(0, max);
  return {chips: ordered.slice(0, limit).map(label => ({label, shared: isShared(label)})), overflow: Math.max(0, ordered.length - limit)};
}

function PersonAvatar({name, url, activeNow}: {name: string; url?: string | null; activeNow?: boolean}) {
  return <View style={{width: AVATAR, height: AVATAR}}>
    <View className="h-full w-full items-center justify-center overflow-hidden rounded-full bg-primary-dark">
      {isRemote(url)
        ? <RemoteImage uri={url} fadeDuration={0} accessibilityIgnoresInvertColors className="h-full w-full" />
        : <Text style={{fontSize: 16}} className="font-bold text-primary">{initialsOf(name)}</Text>}
    </View>
    {activeNow ? <View accessibilityLabel="Active now" className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-background bg-glow-green" /> : null}
  </View>;
}

/**
 * The one person row used by Nearby, Passport, follow lists, search and event attendees.
 * Purely presentational: callers own every handler and pass only fields the API provides.
 */
const PersonRow = memo(function PersonRow({
  name, avatarUrl, handle, plusBadge, activeNow, followsYou, bio, bioLines = 1, meta, hint, notice, interests, sharedInterests, maxChips = 3,
  onPress, accessibilityLabel, actionLabel, actionAccessibilityLabel, actionBusy, onAction, trailing, footer, variant = 'row', testID,
}: PersonRowProps) {
  const {chips, overflow} = arrangeChips(interests, sharedInterests, maxChips);
  const shell = variant === 'card' ? 'mb-3 rounded-2xl border border-border bg-card/60 p-4' : 'min-h-[76px] border-b border-border py-3';
  const identity = <>
    <PersonAvatar name={name} url={avatarUrl} activeNow={activeNow} />
    <View className="ml-3 min-w-0 flex-1">
      <View className="flex-row items-center gap-1.5">
        <Text numberOfLines={1} className="shrink text-[15px] font-semibold text-foreground">{name}</Text>
        {plusBadge ? <View accessibilityLabel="Hiva Plus member" className="rounded-full bg-gold-bg px-1.5 py-0.5"><Text className="text-[10px] font-extrabold text-gold">PLUS</Text></View> : null}
      </View>
      {handle || followsYou ? <View className="mt-0.5 flex-row items-center gap-1.5">
        {handle ? <Text numberOfLines={1} className="shrink text-[13px] text-muted">@{handle}</Text> : null}
        {followsYou ? <View className="rounded-md bg-card px-1.5 py-0.5"><Text className="text-[11px] font-semibold text-muted">Follows you</Text></View> : null}
      </View> : null}
      {bio ? <Text numberOfLines={bioLines} className="mt-0.5 text-[13px] leading-[18px] text-text-body">{bio}</Text> : null}
      {meta || hint ? <View className="mt-1 flex-row items-center gap-1">
        {meta ? <><IconMapPin size={13} color={Colors.muted} /><Text numberOfLines={1} className="shrink text-[12px] text-muted">{meta}</Text></> : null}
        {hint ? <Text numberOfLines={1} className={`${meta ? 'ml-1 ' : ''}min-w-0 flex-1 text-[12px] text-primary`}>{meta ? '· ' : ''}{hint}</Text> : null}
      </View> : null}
      {chips.length ? <View className="mt-2 flex-row flex-wrap gap-1.5">
        {chips.map(chip => <View key={chip.label} accessibilityLabel={chip.shared ? `${chip.label}, shared interest` : chip.label}
          className={`rounded-full px-2.5 py-1 ${chip.shared ? 'border border-gold-line bg-gold-bg' : 'bg-card'}`}>
          <Text numberOfLines={1} className={`text-[11px] font-semibold ${chip.shared ? 'text-gold' : 'text-muted'}`}>{chip.label}</Text>
        </View>)}
        {overflow ? <View accessibilityLabel={`${overflow} more interests`} className="rounded-full bg-card px-2.5 py-1"><Text className="text-[11px] font-semibold text-muted">+{overflow}</Text></View> : null}
      </View> : null}
      {notice ? <Text numberOfLines={2} className="mt-1 text-[11px] text-coral">{notice}</Text> : null}
    </View>
  </>;
  const hasActions = !!(actionLabel || trailing);
  return <View testID={testID} className={shell}>
    <View className="flex-row items-center">
      {onPress
        ? <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} onPress={onPress} className="min-w-0 flex-1 flex-row items-center active:opacity-70">{identity}</Pressable>
        : <View accessibilityLabel={accessibilityLabel} className="min-w-0 flex-1 flex-row items-center">{identity}</View>}
      {hasActions ? <View className="ml-2 flex-row items-center gap-2">
        {actionLabel ? <Pressable accessibilityRole="button" accessibilityLabel={actionAccessibilityLabel ?? actionLabel} accessibilityState={{disabled: !!actionBusy, busy: !!actionBusy}}
          disabled={actionBusy} onPress={onAction} className="h-11 min-w-11 flex-row items-center justify-center gap-1.5 rounded-full bg-primary-dark px-3.5 active:opacity-70">
          {actionBusy ? <ActivityIndicator size="small" color={Colors.primary} /> : <><IconMessageCircle size={17} color={Colors.primary} /><Text className="text-[13px] font-semibold text-primary">{actionLabel}</Text></>}
        </Pressable> : null}
        {trailing}
      </View> : null}
    </View>
    {footer}
  </View>;
});

export default PersonRow;

/** Placeholder with the same height and rhythm as a PersonRow. */
export function PersonRowSkeleton({chips = true}: {chips?: boolean}) {
  return <View className="min-h-[76px] flex-row items-center border-b border-border py-3">
    <View style={{width: AVATAR, height: AVATAR}} className="rounded-full bg-border" />
    <View className="ml-3 flex-1 gap-2">
      <View className="h-3 w-2/5 rounded-full bg-border" />
      <View className="h-2.5 w-3/5 rounded-full bg-border" />
      {chips ? <View className="flex-row gap-1.5"><View className="h-5 w-14 rounded-full bg-border" /><View className="h-5 w-12 rounded-full bg-border" /></View> : null}
    </View>
    <View className="ml-2 h-11 w-[84px] rounded-full bg-border" />
  </View>;
}
