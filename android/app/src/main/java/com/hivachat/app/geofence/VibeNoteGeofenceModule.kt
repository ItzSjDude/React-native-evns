package com.hivachat.app.geofence

import android.app.PendingIntent
import android.os.Build
import android.content.Intent
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.google.android.gms.location.Geofence
import com.google.android.gms.location.GeofencingRequest
import com.google.android.gms.location.LocationServices
import org.json.JSONArray
import org.json.JSONObject

class VibeNoteGeofenceModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  override fun getName() = "VibeNoteGeofence"

  private fun pendingIntent(): PendingIntent = PendingIntent.getBroadcast(
    context,
    7421,
    Intent(context, VibeNoteGeofenceReceiver::class.java).setAction("com.google.android.gms.location.GEOFENCE_TRANSITION"),
    PendingIntent.FLAG_UPDATE_CURRENT or if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) PendingIntent.FLAG_MUTABLE else 0,
  )

  @ReactMethod
  fun setAlertsEnabled(enabled: Boolean) {
    context.getSharedPreferences("vibe_note_geofences", 0).edit().putBoolean("enabled", enabled).apply()
  }

  @ReactMethod
  fun getPendingEntries(promise: Promise) {
    val ids = context.getSharedPreferences("vibe_note_geofences", 0).getStringSet("pending_note_ids", emptySet()).orEmpty()
    val row = com.facebook.react.bridge.Arguments.createMap().apply { putArray("enteredNoteIds", com.facebook.react.bridge.Arguments.fromList(ids.toList())) }
    promise.resolve(if (ids.isEmpty()) emptyList<Any>() else listOf(row))
  }

  @ReactMethod
  fun clearPendingEntries(promise: Promise) {
    context.getSharedPreferences("vibe_note_geofences", 0).edit().remove("pending_note_ids").apply()
    promise.resolve(null)
  }

  @ReactMethod
  fun replaceRegions(rows: com.facebook.react.bridge.ReadableArray, promise: Promise) {
    val stored = JSONArray()
    (0 until minOf(rows.size(), 100)).forEach { index ->
      rows.getMap(index)?.let { map -> stored.put(JSONObject()
        .put("noteId", map.getString("noteId"))
        .put("latitude", map.getDouble("latitude"))
        .put("longitude", map.getDouble("longitude"))
        .put("radiusMeters", map.getDouble("radiusMeters"))
        .put("expiresAt", map.getString("expiresAt"))) }
    }
    context.getSharedPreferences("vibe_note_geofences", 0).edit().putString("regions_json", stored.toString()).apply()
    val geofences = (0 until minOf(rows.size(), 100)).mapNotNull { index ->
      val row = rows.getMap(index) ?: return@mapNotNull null
      val id = row.getString("noteId") ?: return@mapNotNull null
      val lat = row.getDouble("latitude")
      val lng = row.getDouble("longitude")
      val radius = row.getDouble("radiusMeters").toFloat()
      if (!lat.isFinite() || !lng.isFinite() || lat !in -90.0..90.0 || lng !in -180.0..180.0 || radius <= 0f) return@mapNotNull null
      Geofence.Builder()
        .setRequestId(id)
        .setCircularRegion(lat, lng, radius)
        .setExpirationDuration(Geofence.NEVER_EXPIRE)
        .setTransitionTypes(Geofence.GEOFENCE_TRANSITION_ENTER)
        .build()
    }
    val client = LocationServices.getGeofencingClient(context)
    client.removeGeofences(pendingIntent()).addOnCompleteListener {
      if (geofences.isEmpty()) { promise.resolve(null); return@addOnCompleteListener }
      val request = GeofencingRequest.Builder()
        .setInitialTrigger(0)
        .addGeofences(geofences)
        .build()
      client.addGeofences(request, pendingIntent())
        .addOnSuccessListener { promise.resolve(geofences.size) }
        .addOnFailureListener { error -> promise.reject("GEOFENCE_REGISTER_FAILED", error) }
    }
  }

  @ReactMethod
  fun clearRegions(promise: Promise) {
    context.getSharedPreferences("vibe_note_geofences", 0).edit().putBoolean("enabled", false).remove("regions_json").remove("pending_note_ids").apply()
    LocationServices.getGeofencingClient(context).removeGeofences(pendingIntent())
      .addOnSuccessListener { promise.resolve(null) }
      .addOnFailureListener { error -> promise.reject("GEOFENCE_CLEAR_FAILED", error) }
  }
}
