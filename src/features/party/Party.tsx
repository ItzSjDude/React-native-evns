import React from 'react';
import {StyleSheet, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {Colors} from '../../Constants/Colors';
import AppIcon from '../../Constants/Icons';
import Typography from '../../Constants/Typography';
const Party = () => {
  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.container}>
        <View style={styles.iconCircle}>
          <AppIcon name="party" size={42} color={Colors.primary} />
        </View>
        <Typography size={28} color={Colors.text} fontWeight="600">
          Party
        </Typography>
        <Typography size={15} color={Colors.muted} style={styles.subtitle}>
          Discover parties and connect with your community.
        </Typography>
        <Typography size={14} color={Colors.muted} style={styles.comingSoon}>
          Party rooms are coming soon.
        </Typography>
      </View>
    </SafeAreaView>
  );
};

export default Party;

const styles = StyleSheet.create({
  safeArea: {flex: 1, backgroundColor: Colors.background},
  container: {flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32},
  iconCircle: {width: 86, height: 86, borderRadius: 43, backgroundColor: Colors.primaryDark, alignItems: 'center', justifyContent: 'center', marginBottom: 20},
  subtitle: {textAlign: 'center', marginTop: 8},
  comingSoon: {marginTop: 30},
});
