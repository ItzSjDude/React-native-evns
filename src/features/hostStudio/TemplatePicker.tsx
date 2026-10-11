import React, {useCallback, useEffect, useState} from 'react';
import {ActivityIndicator, Pressable, Text, TextInput, View} from 'react-native';
import {Colors} from '../../Constants/Colors';
import IconTrash from '@tabler/icons-react-native/IconTrash';
import {markTemplatesUnavailable, useTemplatesAvailable} from './availability';
import {buildTemplate, deleteTemplate, errorMessage, isUnavailable, listTemplates, saveTemplate} from './hostStudioService';
import {TEMPLATE_NAME_MAX} from './types';
import type {PartyTemplate, TemplateConfig} from './types';

type Props = {
  /** The create form's current values, saved as the template config. */
  current: TemplateConfig;
  onApply: (config: TemplateConfig) => void;
  disabled?: boolean;
};

const Pill = ({label, active, onPress, disabled}: {label: string; active?: boolean; onPress: () => void; disabled?: boolean}) =>
  <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{selected: !!active, disabled: !!disabled}} disabled={disabled} onPress={onPress}
    className={`min-h-11 justify-center rounded-full px-4 ${active ? 'bg-gold' : 'bg-card'} ${disabled ? 'opacity-40' : ''}`}>
    <Text className={`text-sm font-semibold ${active ? 'text-text-dark' : 'text-foreground'}`}>{label}</Text>
  </Pressable>;

const summary = (config: TemplateConfig) => [config.kind?.toLowerCase(), config.category?.toLowerCase(), config.language,
  config.visibility === 'PRIVATE' ? 'invite-only' : undefined, config.seatCount ? `${config.seatCount} seats` : undefined].filter(Boolean).join(' · ');

/** Renders nothing when Host Studio is unavailable (flag off, no Organizer Pro entitlement, or no endpoint). */
export default function TemplatePicker({current, onApply, disabled}: Props) {
  const available = useTemplatesAvailable();
  const [mode, setMode] = useState<'use' | 'save' | null>(null);
  const [templates, setTemplates] = useState<PartyTemplate[] | null>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fail = useCallback((cause: unknown, fallback: string) => {
    if (isUnavailable(cause)) markTemplatesUnavailable(); else setError(errorMessage(cause, fallback));
  }, []);

  useEffect(() => {
    let live = true;
    listTemplates().then(rows => {if (live) setTemplates(Array.isArray(rows) ? rows : []);}).catch(cause => {if (live) fail(cause, 'Could not load templates.');});
    return () => {live = false;};
  }, [fail]);

  // Probing happens on mount; until it succeeds there is nothing to show, so no dead entry point.
  if (!available || templates === null) return null;

  const save = async () => {
    const built = buildTemplate(name, current);
    if (!built || busy) return;
    setBusy(true); setError(null);
    try {
      const saved = await saveTemplate(built.name, built.config);
      setTemplates(rows => [saved, ...(rows || []).filter(row => row.id !== saved.id)]);
      setName(''); setMode(null);
    } catch (cause) {fail(cause, 'Could not save the template.');} finally {setBusy(false);}
  };
  const remove = async (template: PartyTemplate) => {
    if (busy) return;
    setBusy(true); setError(null);
    try {
      await deleteTemplate(template.id);
      setTemplates(rows => (rows || []).filter(row => row.id !== template.id));
    } catch (cause) {fail(cause, 'Could not delete the template.');} finally {setBusy(false);}
  };

  return <View className="mb-4">
    <View className="flex-row gap-2">
      <Pill label="Use a template" active={mode === 'use'} disabled={disabled} onPress={() => setMode(mode === 'use' ? null : 'use')} />
      <Pill label="Save as template" active={mode === 'save'} disabled={disabled} onPress={() => setMode(mode === 'save' ? null : 'save')} />
    </View>
    {mode === 'use' && (templates.length ? <View className="mt-2 overflow-hidden rounded-2xl bg-card">
      {templates.map(template => <View key={template.id} className="min-h-[52px] flex-row items-center border-b border-sheet">
        <Pressable accessibilityRole="button" accessibilityLabel={`Apply template ${template.name}`} disabled={disabled || busy}
          onPress={() => {onApply(template.config || {}); setMode(null);}} className="min-w-0 flex-1 px-4 py-2.5 active:opacity-70">
          <Text numberOfLines={1} className="text-[15px] font-semibold text-foreground">{template.name}</Text>
          {!!summary(template.config || {}) && <Text numberOfLines={1} className="mt-0.5 text-xs capitalize text-muted">{summary(template.config || {})}</Text>}
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={`Delete template ${template.name}`} disabled={busy} onPress={() => remove(template)} hitSlop={6}
          className="h-11 w-11 items-center justify-center active:opacity-70"><IconTrash size={18} color={Colors.coral} /></Pressable>
      </View>)}
    </View> : <Text className="mt-2 text-xs text-muted">No templates yet. Fill in the form and tap Save as template.</Text>)}
    {mode === 'save' && <View className="mt-2 flex-row items-center gap-2">
      <TextInput accessibilityLabel="Template name" value={name} onChangeText={setName} maxLength={TEMPLATE_NAME_MAX} placeholder="Template name"
        placeholderTextColor={Colors.muted} className="h-12 min-w-0 flex-1 rounded-[14px] border border-border bg-card px-4 text-[15px] text-foreground" />
      <Pressable accessibilityRole="button" accessibilityLabel="Save template" disabled={busy || !name.trim()} onPress={save}
        className={`h-12 items-center justify-center rounded-full bg-gold px-5 ${busy || !name.trim() ? 'opacity-40' : ''}`}>
        {busy ? <ActivityIndicator /> : <Text className="text-sm font-bold text-text-dark">Save</Text>}
      </Pressable>
    </View>}
    {!!error && <Text accessibilityRole="alert" className="mt-2 text-xs text-coral">{error}</Text>}
  </View>;
}
