package com.hivachat.app.geofence

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.app.PendingIntent
import android.os.Build
import com.google.android.gms.location.Geofence
import com.google.android.gms.location.GeofencingRequest
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.GeofencingEvent
import org.json.JSONArray

class VibeNoteGeofenceReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action == Intent.ACTION_BOOT_COMPLETED || intent.action == Intent.ACTION_MY_PACKAGE_REPLACED || intent.action == Intent.ACTION_USER_UNLOCKED) {
      val prefs = context.getSharedPreferences("vibe_note_geofences", Context.MODE_PRIVATE)
      if (!prefs.getBoolean("enabled", false)) return
      val stored = prefs.getString("regions_json", null) ?: return
      val rows = JSONArray(stored)
      val geofences = (0 until rows.length()).mapNotNull { index ->
        val row = rows.optJSONObject(index) ?: return@mapNotNull null
        val id = row.optString("noteId")
        val lat = row.optDouble("latitude", Double.NaN)
        val lng = row.optDouble("longitude", Double.NaN)
        val radius = row.optDouble("radiusMeters", Double.NaN).toFloat()
        if (id.isBlank() || !lat.isFinite() || !lng.isFinite() || radius <= 0f) return@mapNotNull null
        Geofence.Builder().setRequestId(id).setCircularRegion(lat, lng, radius)
          .setExpirationDuration(Geofence.NEVER_EXPIRE)
          .setTransitionTypes(Geofence.GEOFENCE_TRANSITION_ENTER).build()
      }
      if (geofences.isEmpty()) return
      val flags = PendingIntent.FLAG_UPDATE_CURRENT or if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) PendingIntent.FLAG_MUTABLE else 0
      val pending = PendingIntent.getBroadcast(context, 7421, Intent(context, VibeNoteGeofenceReceiver::class.java).setAction("com.google.android.gms.location.GEOFENCE_TRANSITION"), flags)
      LocationServices.getGeofencingClient(context).addGeofences(GeofencingRequest.Builder().setInitialTrigger(0).addGeofences(geofences).build(), pending)
      return
    }
    if (!context.getSharedPreferences("vibe_note_geofences", Context.MODE_PRIVATE).getBoolean("enabled", false)) return
    val event = GeofencingEvent.fromIntent(intent) ?: return
    if (event.hasError() || event.geofenceTransition != Geofence.GEOFENCE_TRANSITION_ENTER) return
    val ids = event.triggeringGeofences?.map { it.requestId }?.distinct().orEmpty()
    if (ids.isEmpty()) return
    val prefs = context.getSharedPreferences("vibe_note_geofences", Context.MODE_PRIVATE)
    val pending = prefs.getStringSet("pending_note_ids", emptySet()).orEmpty().toMutableSet().apply { addAll(ids) }
    prefs.edit().putStringSet("pending_note_ids", pending).apply()
    val task = Intent(context, VibeNoteGeofenceTaskService::class.java)
      .putStringArrayListExtra("enteredNoteIds", ArrayList(ids))
    com.facebook.react.HeadlessJsTaskService.acquireWakeLockNow(context)
    context.startService(task)
  }
}
