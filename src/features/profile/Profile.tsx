import React, {useState} from 'react';
import {Alert, Image, Pressable, ScrollView, StatusBar, StyleSheet, TextInput, View} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useAppDispatch, useAppSelector} from '../../core/store/hooks';
import {GoogleSignin} from '@react-native-google-signin/google-signin';
import {clearSession, logoutFromApi} from '../../features/auth';
import {Colors} from '../../Constants/Colors';
import AppIcon, {IconName} from '../../Constants/Icons';
import Typography from '../../Constants/Typography';

type ProfileTab = 'Posts' | 'Parties' | 'Events';

const interests: {label: string; icon: IconName}[] = [
  {label: 'Music', icon: 'music'},
  {label: 'Startups', icon: 'rocket'},
  {label: 'Football', icon: 'football'},
];

const accountItems: {label: string; icon: IconName; message: string}[] = [
  {label: 'Nearby visibility', icon: 'location', message: 'Nearby visibility settings are coming soon.'},
  {label: 'Blocked people', icon: 'people', message: 'You have no blocked people.'},
  {label: 'Security', icon: 'shield', message: 'Your account is secure.'},
];

const Profile = () => {
  const dispatch = useAppDispatch();
  const user = useAppSelector(state => state.auth.user);
  const refreshToken = useAppSelector(state => state.auth.refreshToken);
  const [activeTab, setActiveTab] = useState<ProfileTab>('Posts');
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(user?.name ?? 'Gathr user');
  const [bio, setBio] = useState('Weekend plans, music rooms and Mumbai events.');
  const username = user?.email?.split('@')[0] ?? 'gathruser';

  const handleLogout = async () => {
    Alert.alert('Log out', 'Are you sure you want to log out?', [
      {text: 'Cancel', style: 'cancel'},
      {text: 'Log out', style: 'destructive', onPress: async () => {
        try {
          if (refreshToken) await logoutFromApi(refreshToken);
        } finally {
          await GoogleSignin.signOut();
          dispatch(clearSession());
        }
      }},
    ]);
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <StatusBar barStyle="light-content" />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <LinearGradient colors={['#332452', '#171327', Colors.background]} style={styles.cover}>
          <View style={styles.coverGlow} />
          {/* <View style={styles.topBar}><Typography size={28} color={Colors.primary} fontWeight="600">Gathr</Typography><Pressable accessibilityLabel="More profile options" style={styles.iconButton}><AppIcon name="menu" color={Colors.text} /></Pressable></View> */}
        </LinearGradient>

        <View style={styles.profileBody}>
          <View style={styles.identityRow}>
            <LinearGradient colors={['#F5C58D', '#463B75']} style={styles.avatarRing}><View style={styles.avatar}>{user?.avatar_url ? <Image source={{uri: user.avatar_url}} style={styles.avatarImage} /> : <AppIcon name="user" size={48} color={Colors.text} />}</View></LinearGradient>
            <View style={styles.identity}>{editing ? <TextInput value={name} onChangeText={setName} style={styles.editName} /> : <Typography size={24} color={Colors.text} fontWeight="600">{name}</Typography>}<Typography size={15} color={Colors.muted}>@{username}</Typography><Typography size={13} color={Colors.muted}>{user?.email ?? ''}</Typography></View>
            <Pressable accessibilityRole="button" onPress={() => setEditing(value => !value)} style={({pressed}) => [styles.editButton, pressed && styles.pressed]}><AppIcon name={editing ? 'chevron' : 'edit'} size={17} color={Colors.primary} /><Typography size={14} color={Colors.primary} fontWeight="600" style={styles.editLabel}>{editing ? 'Save' : 'Edit profile'}</Typography></Pressable>
          </View>
          {editing ? <TextInput value={bio} onChangeText={setBio} multiline style={styles.editBio} /> : <Typography size={16} color={Colors.muted} style={styles.bio}>{bio}</Typography>}

          <View style={styles.interests}>{interests.map(item => <View key={item.label} style={styles.interestPill}><AppIcon name={item.icon} size={17} color={Colors.text} /><Typography size={13} color={Colors.textBody} style={styles.interestText}>{item.label}</Typography></View>)}</View>
          <View style={styles.locationRow}><AppIcon name="location" size={19} color={Colors.muted} /><Typography size={15} color={Colors.muted} style={styles.locationText}>Mumbai</Typography></View>
          <View style={styles.stats}><Typography size={15} color={Colors.textBody}><Typography size={15} color={Colors.text} fontWeight="600">12</Typography> Following</Typography><View style={styles.statDivider} /><Typography size={15} color={Colors.textBody}><Typography size={15} color={Colors.text} fontWeight="600">8</Typography> Hosted</Typography></View>

          <View style={styles.tabs}>{(['Posts', 'Parties', 'Events'] as ProfileTab[]).map(tab => <Pressable key={tab} accessibilityRole="tab" accessibilityState={{selected: activeTab === tab}} onPress={() => setActiveTab(tab)} style={styles.tab}><Typography size={16} color={activeTab === tab ? Colors.primary : Colors.muted} fontWeight={activeTab === tab ? '600' : '400'}>{tab}</Typography>{activeTab === tab && <View style={styles.tabIndicator} />}</Pressable>)}</View>
          <View style={styles.postCard}><View style={styles.postHeader}><View style={styles.miniAvatar}>{user?.avatar_url ? <Image source={{uri: user.avatar_url}} style={styles.miniAvatarImage} /> : <AppIcon name="user" size={20} color={Colors.text} />}</View><View style={styles.postAuthor}><Typography size={15} color={Colors.text} fontWeight="600">{name}</Typography><Typography size={12} color={Colors.muted}>@{username} · 3d ago</Typography></View><AppIcon name="menu" size={20} color={Colors.muted} /></View><Typography size={16} color={Colors.textBody} style={styles.postText}>{activeTab === 'Posts' ? 'Golden hour, better company.' : activeTab === 'Parties' ? 'Music, people and good energy.' : 'Mumbai hits different when it’s a room full of people who get it.'}</Typography><View style={styles.postActions}><Typography size={14} color={Colors.coral}>♥ 24</Typography><Typography size={14} color={Colors.muted}>♡ 5</Typography><AppIcon name="share" size={20} color={Colors.muted} /></View></View>

          <Typography size={18} color={Colors.text} fontWeight="600" style={styles.sectionTitle}>Account &amp; privacy</Typography>
          <View style={styles.accountCard}>{accountItems.map((item, index) => <Pressable key={item.label} accessibilityRole="button" onPress={() => Alert.alert(item.label, item.message)} style={({pressed}) => [styles.accountRow, pressed && styles.pressed, index < accountItems.length - 1 && styles.accountBorder]}><AppIcon name={item.icon} size={23} color={Colors.muted} /><Typography size={15} color={Colors.textBody} style={styles.accountLabel}>{item.label}</Typography><AppIcon name="chevron" size={19} color={Colors.muted} /></Pressable>)}</View>
          <Pressable accessibilityRole="button" onPress={handleLogout} style={({pressed}) => [styles.logoutButton, pressed && styles.pressed]}><AppIcon name="logout" size={20} color={Colors.coral} /><Typography size={16} color={Colors.coral} fontWeight="600" style={styles.logoutText}>Log out</Typography></Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

export default Profile;

const styles = StyleSheet.create({
  safeArea: {flex: 1, backgroundColor: Colors.background},
  content: {paddingBottom: 125},
  cover: {height: 142, paddingHorizontal: 25, overflow: 'hidden'},
  coverGlow: {position: 'absolute', width: 250, height: 110, right: -40, bottom: 10, borderRadius: 120, backgroundColor: '#5B4086', opacity: 0.2, transform: [{rotate: '-12deg'}]},
  topBar: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 6},
  iconButton: {padding: 8},
  profileBody: {paddingHorizontal: 20, marginTop: -36},
  identityRow: {flexDirection: 'row', alignItems: 'center'},
  avatarRing: {width: 116, height: 116, borderRadius: 58, padding: 3},
  avatar: {flex: 1, borderRadius: 55, backgroundColor: '#28253B', alignItems: 'center', justifyContent: 'center'},
  avatarImage: {width: '100%', height: '100%', borderRadius: 55},
  identity: {flex: 1, marginLeft: 15, paddingTop: 31},
  editButton: {borderWidth: 1, borderColor: Colors.primaryBorder, borderRadius: 22, paddingVertical: 10, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', marginTop: 28},
  editLabel: {marginLeft: 5},
  editName: {fontSize: 21, color: Colors.text, borderBottomWidth: 1, borderBottomColor: Colors.primary, paddingVertical: 0},
  bio: {marginTop: 17, lineHeight: 23},
  editBio: {marginTop: 17, color: Colors.textBody, fontSize: 16, borderBottomWidth: 1, borderBottomColor: Colors.primary, paddingVertical: 3},
  interests: {flexDirection: 'row', gap: 8, marginTop: 13},
  interestPill: {flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: Colors.borderMuted, borderRadius: 22, paddingVertical: 8, paddingHorizontal: 12, backgroundColor: Colors.card},
  interestText: {marginLeft: 6},
  locationRow: {flexDirection: 'row', alignItems: 'center', marginTop: 14},
  locationText: {marginLeft: 7},
  stats: {flexDirection: 'row', alignItems: 'center', marginTop: 18},
  statDivider: {height: 22, width: 1, backgroundColor: Colors.borderMuted, marginHorizontal: 22},
  tabs: {flexDirection: 'row', justifyContent: 'space-around', marginTop: 22, borderBottomWidth: 1, borderBottomColor: Colors.border},
  tab: {alignItems: 'center', paddingHorizontal: 15, paddingBottom: 11},
  tabIndicator: {height: 3, width: 62, borderRadius: 2, backgroundColor: Colors.primary, position: 'absolute', bottom: -1},
  postCard: {backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.border, borderRadius: 18, padding: 15, marginTop: 14},
  postHeader: {flexDirection: 'row', alignItems: 'center'},
  miniAvatar: {width: 38, height: 38, borderRadius: 19, backgroundColor: '#453E60', alignItems: 'center', justifyContent: 'center'},
  miniAvatarImage: {width: '100%', height: '100%', borderRadius: 19},
  postAuthor: {flex: 1, marginLeft: 10},
  postText: {marginTop: 14, lineHeight: 23},
  postActions: {flexDirection: 'row', alignItems: 'center', gap: 20, marginTop: 18},
  sectionTitle: {marginTop: 25, marginBottom: 11},
  accountCard: {backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.border, borderRadius: 17, paddingHorizontal: 15},
  accountRow: {height: 57, flexDirection: 'row', alignItems: 'center'},
  accountBorder: {borderBottomWidth: 1, borderBottomColor: Colors.border},
  accountLabel: {flex: 1, marginLeft: 15},
  logoutButton: {height: 54, borderWidth: 1, borderColor: '#713A48', borderRadius: 17, marginTop: 19, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#291722'},
  logoutText: {marginLeft: 9},
  pressed: {opacity: 0.7},
});
