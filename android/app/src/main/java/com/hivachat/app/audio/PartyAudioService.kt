package com.hivachat.app.audio

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import com.hivachat.app.MainActivity
import com.hivachat.app.R

class PartyAudioService : Service() {
  override fun onBind(intent: Intent?): IBinder? = null
  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val manager = getSystemService(NotificationManager::class.java)
    manager.createNotificationChannel(NotificationChannel("party_audio", "Live audio rooms", NotificationManager.IMPORTANCE_LOW))
    val open = PendingIntent.getActivity(this, 0, Intent(this, MainActivity::class.java).apply {
      addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP)
    }, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    val notification = NotificationCompat.Builder(this, "party_audio")
      .setSmallIcon(R.drawable.ic_stat_audio)
      .setContentTitle("Hiva audio party")
      .setContentText("Audio room active · Tap to return")
      .setContentIntent(open).setOngoing(true).setSilent(true).build()
    var types = ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK
    if (intent?.getBooleanExtra("microphone", false) == true && checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
      types = types or ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
    }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) startForeground(711, notification, types)
    else startForeground(711, notification)
    return START_NOT_STICKY
  }
  override fun onDestroy() {stopForeground(STOP_FOREGROUND_REMOVE);super.onDestroy()}
}
