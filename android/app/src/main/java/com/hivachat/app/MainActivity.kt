package com.hivachat.app

import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

class MainActivity : ReactActivity() {

  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the main component.
   */
  override fun getMainComponentName(): String = "HivaChat"

  /**
   * Returns the instance of the [ReactActivityDelegate]. We use [DefaultReactActivityDelegate]
   * which allows you to enable New Architecture with a single boolean flags [fabricEnabled]
   */
  override fun createReactActivityDelegate(): ReactActivityDelegate =
      DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)

  /**
   * BACK that JS did not handle (root tab) sends the app to the background instead of finishing
   * the activity. Finishing stops the React surface, which unmounts a live audio party (LiveKit
   * room + foreground audio service) while the JS runtime and the server-side membership survive.
   * Android 12+ already does this for launcher-started root activities; this makes it consistent
   * for every launch path (deep links, notification, `am start`).
   */
  override fun invokeDefaultOnBackPressed() {
    if (!moveTaskToBack(true)) super.invokeDefaultOnBackPressed()
  }
}
