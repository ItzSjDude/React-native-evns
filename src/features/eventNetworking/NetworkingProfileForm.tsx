import React, {useState} from 'react';
import {Pressable, Switch, Text, TextInput, View} from 'react-native';
import {SheetButton} from '../../components/BottomSheet';
import {Colors} from '../../Constants/Colors';
import {parseInterests} from './networkingPresentation';
import {INTRO_MAX_LENGTH, NETWORKING_GOALS, type EventNetworkingProfile, type NetworkingGoal, type NetworkingProfileInput} from './types';

type Props = {
  /** Present when editing an existing opt-in; absent for the first, explicit opt-in. */
  initial: EventNetworkingProfile | null;
  submitting: boolean;
  error: string | null;
  onSubmit: (input: NetworkingProfileInput) => void;
  onCancel?: () => void;
};

const inputClass = 'rounded-xl border border-border bg-card px-3 text-[15px] text-foreground';
const fieldLabel = 'mb-1.5 mt-4 text-[11px] font-semibold uppercase tracking-[0.8px] text-muted';

const Toggle = ({label, value, onChange}: {label: string; value: boolean; onChange: (value: boolean) => void}) =>
  <View className="mb-2 flex-row items-center justify-between rounded-2xl bg-card px-4 py-3">
    <Text className="mr-3 flex-1 text-[14px] font-semibold text-foreground">{label}</Text>
    <Switch accessibilityLabel={label} value={value} onValueChange={onChange} />
  </View>;

/** Consent + profile form. Joining needs an explicit 18+ confirmation; editing reuses the same fields. */
export default function NetworkingProfileForm({initial, submitting, error, onSubmit, onCancel}: Props) {
  const joining = !initial;
  const [goals, setGoals] = useState<NetworkingGoal[]>(initial?.goals ?? []);
  const [interests, setInterests] = useState((initial?.interests ?? []).join(', '));
  const [intro, setIntro] = useState(initial?.intro ?? '');
  const [before, setBefore] = useState(initial?.discoverableBeforeEvent ?? true);
  const [during, setDuring] = useState(initial?.discoverableDuringEvent ?? true);
  const [after, setAfter] = useState(initial?.discoverableAfterEvent ?? false);
  const [adult, setAdult] = useState(false);

  const toggleGoal = (goal: NetworkingGoal) => setGoals(current => current.includes(goal) ? current.filter(item => item !== goal) : [...current, goal]);
  const submit = () => onSubmit({
    goals, interests: parseInterests(interests),
    ...(intro.trim() ? {intro: intro.trim()} : {}),
    discoverableBefore: before, discoverableDuring: during, discoverableAfter: after,
  });

  return <View>
    {joining && <View className="mb-1 rounded-2xl border border-border bg-card p-4">
      <Text className="text-[14px] font-bold text-foreground">You choose who sees you</Text>
      <Text className="mt-1 text-[13px] leading-5 text-muted">
        Joining is optional and only for this event. Other attendees who also joined can see your name, photo, goals, interests and intro. Nothing else from your profile is shared, and nobody sees where you are. You can leave at any time without losing your ticket or the event chat.
      </Text>
    </View>}

    <Text className={fieldLabel}>What are you open to?</Text>
    <View className="flex-row flex-wrap gap-2">
      {NETWORKING_GOALS.map(({value, label}) => {
        const selected = goals.includes(value);
        return <Pressable key={value} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{selected}} onPress={() => toggleGoal(value)}
          className={`h-9 items-center justify-center rounded-full px-4 active:opacity-70 ${selected ? 'bg-gold' : 'bg-card'}`}>
          <Text className={`text-[13px] font-semibold ${selected ? 'text-text-dark' : 'text-muted'}`}>{label}</Text>
        </Pressable>;
      })}
    </View>

    <Text className={fieldLabel}>Interests (comma separated)</Text>
    <TextInput accessibilityLabel="Interests" value={interests} onChangeText={setInterests} placeholder="Live music, startups, hiking"
      placeholderTextColor={Colors.muted} autoCorrect={false} className={`h-11 ${inputClass}`} />

    <Text className={fieldLabel}>Short intro</Text>
    <TextInput accessibilityLabel="Intro" value={intro} onChangeText={setIntro} maxLength={INTRO_MAX_LENGTH} multiline
      placeholder="Say hi in a line or two" placeholderTextColor={Colors.muted} className={`min-h-[72px] py-2 ${inputClass}`} />

    <Text className={fieldLabel}>When can attendees find you?</Text>
    <Toggle label="Before the event" value={before} onChange={setBefore} />
    <Toggle label="During the event" value={during} onChange={setDuring} />
    <Toggle label="After the event" value={after} onChange={setAfter} />

    {joining && <Pressable accessibilityRole="checkbox" accessibilityLabel="I am 18 or older" accessibilityState={{checked: adult}} onPress={() => setAdult(value => !value)}
      className="my-3 flex-row items-center gap-3 active:opacity-70">
      <View className={`h-6 w-6 items-center justify-center rounded-md border ${adult ? 'border-gold bg-gold' : 'border-border-muted'}`}>
        {adult && <Text className="text-[14px] font-extrabold text-text-dark">✓</Text>}
      </View>
      <Text className="flex-1 text-[13px] leading-5 text-text-body">I am 18 or older and want to meet other attendees at this event.</Text>
    </Pressable>}

    {!!error && <Text accessibilityRole="alert" className="my-2 text-[13px] text-coral">{error}</Text>}
    <SheetButton label={joining ? 'Join networking' : 'Save changes'} busy={submitting} disabled={joining && !adult} onPress={submit} />
    {!!onCancel && <SheetButton label="Cancel" variant="ghost" disabled={submitting} onPress={onCancel} />}
  </View>;
}
