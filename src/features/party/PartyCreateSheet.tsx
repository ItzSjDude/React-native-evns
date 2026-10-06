import React, {useEffect, useMemo, useState} from 'react';
import {ActivityIndicator, Image, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import IconHeadphones from '@tabler/icons-react-native/IconHeadphones';
import IconX from '@tabler/icons-react-native/IconX';
import {createParty, getPartyInvitees, type PartySeatCount, type CreatedParty} from './partyService';
import {PartyColors, partyCategories, type PartyCategory} from './partyPresentation';

const styles = StyleSheet.create({sheet: {maxHeight: '92%'}});

const PartyCreateSheet = ({onClose, onCreated}: {onClose: () => void; onCreated: (result: CreatedParty) => void}) => {
  const [title, setTitle] = useState('');
  const [topic, setTopic] = useState('');
  const [seatCount, setSeatCount] = useState<PartySeatCount>(8);
  const [category, setCategory] = useState<PartyCategory>('music');
  const [visibility,setVisibility]=useState<'PUBLIC'|'PRIVATE'>('PUBLIC');
  const [language,setLanguage]=useState('Hindi');
  const [schedule,setSchedule]=useState<'NOW'|'HOUR'|'TOMORROW'>('NOW');
  const [invitees,setInvitees]=useState<{id:string;name:string|null;avatarUrl:string|null}[]>([]);
  const [selectedInvitees,setSelectedInvitees]=useState<string[]>([]);
  const [inviteeError,setInviteeError]=useState<string|null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(()=>{
    let mounted=true;
    getPartyInvitees().then(items=>{if(mounted)setInvitees(items);}).catch(()=>{if(mounted)setInviteeError('People list is unavailable. You can still create a public party.');});
    return()=>{mounted=false;};
  },[]);
  const scheduleData=useMemo(()=>{
    if(schedule==='NOW')return {};
    const instant=new Date(Date.now()+(schedule==='HOUR'?60:24*60)*60*1000);
    return {scheduledStartAt:instant.toISOString(),timeZone:Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata'};
  },[schedule]);
  const invalid=!title.trim() || saving || (visibility==='PRIVATE' && selectedInvitees.length===0);
  const submit = async () => {
    if (!title.trim() || saving) return;
    setSaving(true);
    setError(null);
    const selected = partyCategories.find(item => item.key === category)!;
    try {
      const result = await createParty({
        title: title.trim(), topic: topic.trim(), kind: 'AUDIO', seatCount, visibility,
        language, inviteeIds:selectedInvitees, ...scheduleData,
        category: selected.category || 'SOCIAL', interestTags: [selected.interest || selected.key],
      });
      onCreated(result);
    } catch (cause) {
      setError((cause as {message?: string})?.message || 'Could not create your party. Try again.');
    } finally { setSaving(false); }
  };
  return (
    <Modal visible transparent animationType="slide" onRequestClose={() => { if (!saving) onClose(); }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1 justify-end bg-black/60">
        <Pressable accessibilityLabel="Dismiss create party" disabled={saving} onPress={onClose} className="flex-1" />
        <SafeAreaView edges={['bottom']} style={styles.sheet} className="rounded-t-[28px] border border-border bg-background px-5 pt-5">
          <View className="mb-5 flex-row items-center justify-between">
            <Text className="text-[22px] font-bold text-foreground">Create a party</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Close create party" disabled={saving} onPress={onClose} className="h-10 w-10 items-center justify-center rounded-full bg-card"><IconX size={20} color={PartyColors.text} /></Pressable>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerClassName="pb-5">
            <Text className="mb-2 text-sm font-semibold text-foreground">Party name</Text>
            <TextInput accessibilityLabel="Party name" value={title} onChangeText={setTitle} maxLength={120} placeholder="Give your room a vibe" placeholderTextColor={PartyColors.muted} className="h-12 rounded-[14px] border border-border bg-card px-4 text-[15px] text-foreground" />
            <Text className="mb-2 mt-4 text-sm font-semibold text-foreground">What's it about?</Text>
            <TextInput accessibilityLabel="Party description" value={topic} onChangeText={setTopic} maxLength={120} placeholder="Music, good conversations, new friends..." placeholderTextColor={PartyColors.muted} className="h-12 rounded-[14px] border border-border bg-card px-4 text-[15px] text-foreground" />
            <Text className="mb-2 mt-5 text-sm font-semibold text-foreground">Speaker seats</Text>
            <View className="flex-row gap-3">
              {([4, 8] as const).map(value => <Pressable key={value} accessibilityRole="radio" accessibilityLabel={`${value} speaker seats`} accessibilityState={{selected: seatCount === value}} disabled={saving} onPress={() => setSeatCount(value)} className={seatCount === value ? 'h-12 flex-1 flex-row items-center justify-center gap-2 rounded-[14px] border border-primary bg-primary-dark' : 'h-12 flex-1 flex-row items-center justify-center gap-2 rounded-[14px] border border-border bg-card'}>
                <IconHeadphones size={19} color={seatCount === value ? PartyColors.accent : PartyColors.muted} /><Text className={seatCount === value ? 'text-sm font-semibold text-primary' : 'text-sm font-semibold text-muted'}>{value} seats</Text>
              </Pressable>)}
            </View>
            <Text className="mt-2 text-xs text-muted">Includes your host seat. Everyone else can listen.</Text>
            <Text className="mb-2 mt-5 text-sm font-semibold text-foreground">Who can join?</Text>
            <View className="flex-row gap-3">
              {(['PUBLIC','PRIVATE'] as const).map(value=><Pressable key={value} accessibilityRole="radio" accessibilityState={{selected:visibility===value}} onPress={()=>setVisibility(value)} className={visibility===value?'h-12 flex-1 items-center justify-center rounded-[14px] border border-primary bg-primary-dark':'h-12 flex-1 items-center justify-center rounded-[14px] border border-border bg-card'}><Text className={visibility===value?'font-semibold text-primary':'font-semibold text-muted'}>{value==='PUBLIC'?'Public':'Invite-only'}</Text></Pressable>)}
            </View>
            <Text className="mb-2 mt-5 text-sm font-semibold text-foreground">Start time</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2">
              {([['NOW','Start now'],['HOUR','In 1 hour'],['TOMORROW','Tomorrow']] as const).map(([value,label])=><Pressable key={value} accessibilityRole="radio" accessibilityState={{selected:schedule===value}} onPress={()=>setSchedule(value)} className={schedule===value?'min-h-11 justify-center rounded-full bg-primary px-4':'min-h-11 justify-center rounded-full bg-card px-4'}><Text className={schedule===value?'text-sm font-semibold text-text-dark':'text-sm text-muted'}>{label}</Text></Pressable>)}
            </ScrollView>
            <Text className="mb-2 mt-5 text-sm font-semibold text-foreground">Language</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2">
              {['Hindi','English','Punjabi','Bengali'].map(value=><Pressable key={value} accessibilityRole="radio" accessibilityState={{selected:language===value}} onPress={()=>setLanguage(value)} className={language===value?'min-h-11 justify-center rounded-full bg-primary px-4':'min-h-11 justify-center rounded-full bg-card px-4'}><Text className={language===value?'text-sm font-semibold text-text-dark':'text-sm text-muted'}>{value}</Text></Pressable>)}
            </ScrollView>
            {(visibility==='PRIVATE' || invitees.length>0) && <>
              <Text className="mb-2 mt-5 text-sm font-semibold text-foreground">Invite people {visibility==='PRIVATE'?'· required':'· optional'}</Text>
              {!!inviteeError && <Text className="mb-2 text-xs text-coral">{inviteeError}</Text>}
              {invitees.map(person=>{
                const selected=selectedInvitees.includes(person.id);
                return <Pressable key={person.id} accessibilityRole="checkbox" accessibilityState={{checked:selected}} onPress={()=>setSelectedInvitees(current=>selected?current.filter(id=>id!==person.id):[...current,person.id])} className="min-h-14 flex-row items-center gap-3">
                  {person.avatarUrl?<Image source={{uri:person.avatarUrl}} className="h-10 w-10 rounded-full"/>:<View className="h-10 w-10 items-center justify-center rounded-full bg-card"><Text className="font-semibold text-primary">{(person.name||'?').slice(0,2)}</Text></View>}
                  <Text className="flex-1 text-sm text-foreground">{person.name||'Guest'}</Text><Text className={selected?'text-primary':'text-muted'}>{selected?'Selected':'Add'}</Text>
                </Pressable>;
              })}
            </>}
            <Text className="mb-2 mt-5 text-sm font-semibold text-foreground">Choose a category</Text>
            <View className="flex-row flex-wrap gap-2">
              {partyCategories.filter(item => item.key !== 'all').map(item => <Pressable key={item.key} accessibilityRole="button" accessibilityState={{selected: category === item.key}} onPress={() => setCategory(item.key)} className={category === item.key ? 'min-h-11 justify-center rounded-full bg-primary px-4 py-2' : 'min-h-11 justify-center rounded-full bg-card px-4 py-2'}><Text className={category === item.key ? 'text-xs font-semibold text-text-dark' : 'text-xs font-semibold text-muted'}>{item.label}</Text></Pressable>)}
            </View>
            <Text className="mt-4 text-xs leading-5 text-muted">{visibility==='PUBLIC'?'Your public party will appear in discovery.':'Only invited people can open and join this party.'}</Text>
            {!!error && <Text accessibilityRole="alert" className="mt-3 text-sm text-coral">{error}</Text>}
            <Pressable accessibilityRole="button" accessibilityLabel={schedule==='NOW'?'Create party':'Schedule party'} disabled={invalid} onPress={submit} className={'mt-5 h-12 items-center justify-center rounded-full bg-primary ' + (invalid ? 'opacity-40' : 'active:opacity-70')}>
              {saving ? <ActivityIndicator color={PartyColors.ink} /> : <Text className="text-[15px] font-bold text-text-dark">{schedule==='NOW'?'Create party':'Schedule party'}</Text>}
            </Pressable>
          </ScrollView>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  );
};

export default PartyCreateSheet;
