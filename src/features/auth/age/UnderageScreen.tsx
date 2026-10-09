import React, {useState} from 'react';
import {StatusBar, Text, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import IconShieldLock from '@tabler/icons-react-native/IconShieldLock';
import BottomSheet, {SheetButton} from '../../../components/BottomSheet';
import {useAppDispatch} from '../../../core/store/hooks';
import {Colors} from '../../../Constants/Colors';
import {logoutFromApi} from '../authService';
import {clearSession} from '../authSlice';
import {deleteAccount} from './ageService';

const messageOf = (error: unknown) => (error as {message?: string})?.message || 'Could not delete your account. Please try again.';

/** Terminal screen for `ageStatus: 'minor'`. The only ways out are logging out or deleting the account. */
const UnderageScreen = () => {
  const dispatch = useAppDispatch();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [busy, setBusy] = useState<'logout' | 'delete' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const signOut = async () => {
    try { await logoutFromApi(); } catch { /* Local sign-out still happens. */ } finally { dispatch(clearSession()); }
  };

  const logout = async () => {
    if (busy) return;
    setBusy('logout');
    await signOut();
  };

  const remove = async () => {
    if (busy) return;
    setBusy('delete');
    setError(null);
    try {
      await deleteAccount();
    } catch (cause) {
      setError(messageOf(cause));
      setBusy(null);
      return;
    }
    await signOut();
  };

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']}>
      <StatusBar barStyle="light-content" />
      <View className="flex-1 justify-center px-6">
        <View className="mb-6 h-14 w-14 items-center justify-center rounded-full bg-primary-dark"><IconShieldLock size={28} color={Colors.primary} /></View>
        <Text accessibilityRole="header" className="text-[26px] font-bold text-foreground">Hiva is only for people 18+</Text>
        <Text className="mt-3 text-[15px] leading-[22px] text-muted">
          Thanks for your interest. Based on the date of birth on your account, you can't use Hiva. You can log out, or delete your account and the data in it.
        </Text>
        {error && !confirmingDelete ? <Text accessibilityRole="alert" className="mt-4 text-sm text-coral">{error}</Text> : null}
      </View>
      <View className="px-5 pb-3">
        <SheetButton label={busy === 'logout' ? 'Logging out…' : 'Log out'} busy={busy === 'logout'} disabled={!!busy} onPress={logout} />
        <SheetButton label="Delete account" variant="danger" disabled={!!busy} onPress={() => { setError(null); setConfirmingDelete(true); }} />
      </View>
      <BottomSheet visible={confirmingDelete} onClose={() => setConfirmingDelete(false)} dismissible={busy !== 'delete'}
        title="Delete your account?" subtitle="This permanently removes your account, profile and messages. It can't be undone."
        footer={<>
          {error ? <Text accessibilityRole="alert" className="mb-2 text-center text-sm text-coral">{error}</Text> : null}
          <SheetButton label={busy === 'delete' ? 'Deleting…' : 'Delete my account'} variant="destructive" busy={busy === 'delete'} disabled={!!busy} onPress={remove} />
          <SheetButton label="Cancel" variant="ghost" disabled={busy === 'delete'} onPress={() => setConfirmingDelete(false)} />
        </>} />
    </SafeAreaView>
  );
};

export default UnderageScreen;
