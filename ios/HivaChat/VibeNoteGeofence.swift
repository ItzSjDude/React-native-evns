import CoreLocation
import Foundation
import React

@objc(VibeNoteGeofence)
class VibeNoteGeofence: RCTEventEmitter, CLLocationManagerDelegate {
  private let manager = CLLocationManager()
  private var pendingNoteId: String?
  private var authorizationResolve: RCTPromiseResolveBlock?

  override init() {
    super.init()
    manager.delegate = self
    manager.pausesLocationUpdatesAutomatically = true
  }

  @objc override static func requiresMainQueueSetup() -> Bool { true }
  override func supportedEvents() -> [String]! { ["onVibeNoteGeofenceEntry"] }

  @objc(requestAlwaysAuthorization:rejecter:)
  func requestAlwaysAuthorization(resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    let status = manager.authorizationStatus
    if status == .authorizedAlways { resolve(true); return }
    if status == .denied || status == .restricted { resolve(false); return }
    authorizationResolve = resolve
    manager.requestAlwaysAuthorization()
  }

  @objc(hasAlwaysAuthorization:rejecter:)
  func hasAlwaysAuthorization(resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) {
    resolve(manager.authorizationStatus == .authorizedAlways)
  }

  @objc(replaceRegions:resolver:rejecter:)
  func replaceRegions(_ rows: [[String: Any]], resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) {
    guard CLLocationManager.isMonitoringAvailable(for: CLCircularRegion.self) else {
      reject("GEOFENCE_UNAVAILABLE", "Region monitoring is unavailable on this device.", nil)
      return
    }
    guard manager.maximumRegionMonitoringDistance > 0 else {
      reject("GEOFENCE_UNAVAILABLE", "This device cannot monitor location regions.", nil)
      return
    }
    manager.monitoredRegions.filter { $0.identifier.hasPrefix("hiva-vibe-note:") }.forEach(manager.stopMonitoring(for:))
    let regions = rows.prefix(18).compactMap { row -> CLCircularRegion? in
      guard let noteId = row["noteId"] as? String,
            let latitude = row["latitude"] as? Double,
            let longitude = row["longitude"] as? Double,
            let radius = row["radiusMeters"] as? Double,
            CLLocationCoordinate2DIsValid(CLLocationCoordinate2D(latitude: latitude, longitude: longitude)), radius > 0 else { return nil }
      let region = CLCircularRegion(center: CLLocationCoordinate2D(latitude: latitude, longitude: longitude), radius: min(radius, manager.maximumRegionMonitoringDistance), identifier: "hiva-vibe-note:\(noteId)")
      region.notifyOnEntry = true
      region.notifyOnExit = false
      return region
    }
    regions.forEach(manager.startMonitoring(for:))
    resolve(regions.count)
  }

  @objc(clearRegions:rejecter:)
  func clearRegions(resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) {
    manager.monitoredRegions.filter { $0.identifier.hasPrefix("hiva-vibe-note:") }.forEach(manager.stopMonitoring(for:))
    UserDefaults.standard.removeObject(forKey: "hiva.vibeNote.pendingEntries")
    resolve(nil)
  }

  @objc(getPendingEntries:rejecter:)
  func getPendingEntries(resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) {
    let now = Date()
    let formatter = ISO8601DateFormatter()
    let pending = (UserDefaults.standard.array(forKey: "hiva.vibeNote.pendingEntries") as? [[String: Any]] ?? []).filter { entry in
      guard let value = entry["observedAt"] as? String, let observedAt = formatter.date(from: value) else { return false }
      return observedAt <= now && now.timeIntervalSince(observedAt) <= 10 * 60
    }
    UserDefaults.standard.set(pending, forKey: "hiva.vibeNote.pendingEntries")
    resolve(pending)
  }

  @objc(clearPendingEntries:rejecter:)
  func clearPendingEntries(resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) {
    UserDefaults.standard.removeObject(forKey: "hiva.vibeNote.pendingEntries")
    resolve(nil)
  }

  func locationManager(_ manager: CLLocationManager, didEnterRegion region: CLRegion) {
    guard region.identifier.hasPrefix("hiva-vibe-note:") else { return }
    pendingNoteId = String(region.identifier.dropFirst("hiva-vibe-note:".count))
    manager.requestLocation()
  }

  func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
    guard let noteId = pendingNoteId, let location = locations.last else { return }
    pendingNoteId = nil
    let formatter = ISO8601DateFormatter()
    let entry: [String: Any] = [
      "enteredNoteIds": [noteId],
      "lat": location.coordinate.latitude,
      "lng": location.coordinate.longitude,
      "accuracyMeters": max(0, location.horizontalAccuracy),
      "observedAt": formatter.string(from: location.timestamp),
    ]
    var entries = (UserDefaults.standard.array(forKey: "hiva.vibeNote.pendingEntries") as? [[String: Any]] ?? [])
      .filter { (($0["enteredNoteIds"] as? [String]) ?? []).first != noteId }
    entries.append(entry)
    entries = Array(entries.suffix(100))
    UserDefaults.standard.set(entries, forKey: "hiva.vibeNote.pendingEntries")
    sendEvent(withName: "onVibeNoteGeofenceEntry", body: entry)
  }

  func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
    pendingNoteId = nil
  }

  func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
    guard let resolve = authorizationResolve else { return }
    authorizationResolve = nil
    if manager.authorizationStatus == .authorizedAlways { resolve(true) }
    else if manager.authorizationStatus == .authorizedWhenInUse || manager.authorizationStatus == .denied || manager.authorizationStatus == .restricted { resolve(false) }
  }
}
