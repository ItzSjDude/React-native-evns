package com.hivachat.app.geofence

import android.content.Intent
import com.facebook.react.HeadlessJsTaskService
import com.facebook.react.jstasks.HeadlessJsTaskConfig
import com.facebook.react.bridge.Arguments

class VibeNoteGeofenceTaskService : HeadlessJsTaskService() {
  override fun getTaskConfig(intent: Intent?): HeadlessJsTaskConfig? {
    val ids = intent?.getStringArrayListExtra("enteredNoteIds") ?: arrayListOf()
    if (ids.isEmpty() && intent?.getBooleanExtra("restoreRegions", false) != true) return null
    val data = Arguments.createMap().apply {
      putArray("enteredNoteIds", Arguments.fromList(ids))
    }
    return HeadlessJsTaskConfig("HivaVibeNoteGeofenceEntry", data, 45_000, true)
  }
}
