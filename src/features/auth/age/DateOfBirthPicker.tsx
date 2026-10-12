import React, {useMemo, useState} from 'react';
import {Pressable, Text, View} from 'react-native';
import IconCheck from '@tabler/icons-react-native/IconCheck';
import IconChevronDown from '@tabler/icons-react-native/IconChevronDown';
import BottomSheet, {SheetButton, SheetRow, SheetSection} from '../../../components/BottomSheet';
import {Colors} from '../../../Constants/Colors';
import {daysInMonth, MONTH_NAMES, type DobDraft} from './ageValidation';

type Part = 'day' | 'month' | 'year';
type Option = {value: number; label: string};

const PART_TITLE: Record<Part, string> = {day: 'Day', month: 'Month', year: 'Year'};
const OLDEST_YEARS = 120;

function optionsFor(part: Part, value: DobDraft, today: Date): Option[] {
  if (part === 'month') return MONTH_NAMES.map((label, index) => ({value: index + 1, label}));
  if (part === 'year') {
    const latest = today.getFullYear();
    return Array.from({length: OLDEST_YEARS + 1}, (_, index) => ({value: latest - index, label: String(latest - index)}));
  }
  // Leap-year February until a year is picked, so 29 stays selectable.
  const days = value.month ? daysInMonth(value.month, value.year ?? 2000) : 31;
  return Array.from({length: days}, (_, index) => ({value: index + 1, label: String(index + 1)}));
}

const labelOf = (part: Part, value: DobDraft) => {
  const picked = value[part];
  if (picked == null) return null;
  return part === 'month' ? MONTH_NAMES[picked - 1] : String(picked);
};

type PickerProps = {
  value: DobDraft;
  onChange: (next: DobDraft) => void;
  error?: string | null;
  disabled?: boolean;
  today?: Date;
};

/** Day / month / year selects that open a bottom-sheet list, so no native date picker package is needed. */
export const DateOfBirthPicker = ({value, onChange, error, disabled, today}: PickerProps) => {
  const [open, setOpen] = useState<Part | null>(null);
  const now = useMemo(() => today ?? new Date(), [today]);
  const options = open ? optionsFor(open, value, now) : [];

  const select = (part: Part, picked: number) => {
    onChange({...value, [part]: picked});
    setOpen(null);
  };

  return (
    <View>
      <Text className="mb-2 text-sm font-semibold text-foreground">Date of birth</Text>
      <View className="flex-row gap-2">
        {(['day', 'month', 'year'] as const).map(part => {
          const label = labelOf(part, value);
          return (
            <Pressable key={part} accessibilityRole="button" accessibilityLabel={`Birth ${part}`} accessibilityValue={{text: label ?? 'Not set'}}
              accessibilityState={{disabled: !!disabled}} disabled={disabled} onPress={() => setOpen(part)}
              className={`h-12 flex-row items-center justify-between rounded-[14px] border bg-card px-3 ${part === 'month' ? 'flex-[1.6]' : 'flex-1'} ${error ? 'border-coral' : 'border-border'} ${disabled ? 'opacity-50' : 'active:opacity-70'}`}>
              <Text numberOfLines={1} className={`text-[15px] ${label ? 'text-foreground' : 'text-muted'}`}>{label ?? PART_TITLE[part]}</Text>
              <IconChevronDown size={16} color={Colors.muted} />
            </Pressable>
          );
        })}
      </View>
      {error ? <Text accessibilityRole="alert" className="mt-1.5 text-xs text-coral">{error}</Text> : null}
      <BottomSheet visible={open !== null} onClose={() => setOpen(null)} title={open ? `Birth ${open}` : undefined} maxHeight={0.7}>
        <SheetSection>
          {open ? options.map(option => {
            const selected = value[open] === option.value;
            return (
              <SheetRow key={option.value} label={option.label} accessibilityLabel={`${PART_TITLE[open]} ${option.label}`} onPress={() => select(open, option.value)}
                accessory={selected ? <IconCheck size={18} color={Colors.primary} /> : undefined} />
            );
          }) : null}
        </SheetSection>
      </BottomSheet>
    </View>
  );
};

type ConfirmProps = {
  /** e.g. "12 March 1998"; null hides the sheet. */
  label: string | null;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export const DobConfirmSheet = ({label, busy, onConfirm, onCancel}: ConfirmProps) => (
  <BottomSheet visible={label !== null} onClose={onCancel} dismissible={!busy}
    title={label ? `Is ${label} correct?` : undefined}
    subtitle="Your date of birth can't be changed later."
    footer={<>
      <SheetButton label={busy ? 'Saving…' : "Yes, that's right"} busy={busy} onPress={onConfirm} />
      <SheetButton label="Change" variant="ghost" disabled={busy} onPress={onCancel} />
    </>} />
);
