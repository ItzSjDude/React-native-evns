package com.hivachat.app.notifications

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.os.Build

/**
 * The API sends every FCM push with android.notification.channel_id = "gathr_default"
 * (gathr-api src/services/fcm.service.js). On Android 8+ a push targeting a channel
 * that does not exist is dropped silently, so the channel is created on every
 * process start, before any message can arrive. createNotificationChannel is a
 * no-op when the channel already exists, and never overrides user changes to it.
 */
object NotificationChannels {
  const val DEFAULT_CHANNEL_ID = "gathr_default"

  fun createDefault(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = context.getSystemService(NotificationManager::class.java) ?: return
    val channel = NotificationChannel(
      DEFAULT_CHANNEL_ID,
      "Notifications",
      NotificationManager.IMPORTANCE_HIGH,
    ).apply {
      description = "Messages, parties, events and activity from Hiva Chat"
      enableVibration(true)
      setShowBadge(true)
    }
    manager.createNotificationChannel(channel)
  }
}
