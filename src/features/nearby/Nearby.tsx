import React from 'react';
import {StyleSheet, View} from 'react-native';
import {Colors} from '../../Constants/Colors';
import Typography from '../../Constants/Typography';

const Nearby = () => {
  return (
    <View style={styles.container}>
      <Typography size={28} color={Colors.text} fontWeight="600">Nearby</Typography>
    </View>
  );
};

export default Nearby;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.background,
  },
});
