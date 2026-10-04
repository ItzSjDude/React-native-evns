import { View } from 'react-native'
import Typography from '../../Constants/Typography'
import React from 'react'
import { Pressable } from 'react-native'
import {useAppDispatch} from '../../core/store/hooks'
import {completeOnboarding} from '../../features/auth'
import { Colors } from '../../Constants/Colors'

const Onboarding = () => {
  const dispatch = useAppDispatch()
  return (
    <View>
      <Typography size={28} color={Colors.textNavy} fontWeight="600">Onboarding</Typography>
      <Pressable accessibilityRole="button" onPress={() => dispatch(completeOnboarding())}>
        <Typography size={16} color={Colors.textNavy}>Continue</Typography>
      </Pressable>
    </View>
  )
}

export default Onboarding
