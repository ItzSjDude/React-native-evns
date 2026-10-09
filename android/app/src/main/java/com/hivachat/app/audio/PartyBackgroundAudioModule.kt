package com.hivachat.app.audio

import android.content.Intent
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class PartyBackgroundAudioModule(context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  override fun getName() = "PartyBackgroundAudio"
  @ReactMethod fun start(microphone: Boolean, promise: Promise) {
    try {
      if (reactApplicationContext.currentActivity == null) {promise.reject("AUDIO_FOREGROUND", "Return to the app before enabling audio.");return}
      ContextCompat.startForegroundService(reactApplicationContext, Intent(reactApplicationContext, PartyAudioService::class.java).putExtra("microphone", microphone))
      promise.resolve(null)
    } catch (error: Exception) {promise.reject("AUDIO_SERVICE", "Could not start background audio.", error)}
  }
  @ReactMethod fun stop(promise: Promise) {
    reactApplicationContext.stopService(Intent(reactApplicationContext, PartyAudioService::class.java))
    promise.resolve(null)
  }
}
