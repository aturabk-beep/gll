import Flutter
import UIKit
import CoreLocation
import Security
import CryptoKit
import SQLite3
import Network

@main
@objc class AppDelegate: FlutterAppDelegate, FlutterImplicitEngineDelegate {
  private let tracker = PilotTracker()
  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    // Core Location may relaunch the process before Flutter creates its engine.
    // Restore native monitoring here so a location wake-up can be handled.
    if launchOptions?[.location] != nil { tracker.resumeForLocationLaunch() }
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  func didInitializeImplicitFlutterEngine(_ engineBridge: FlutterImplicitEngineBridge) {
    GeneratedPluginRegistrant.register(with: engineBridge.pluginRegistry)
    let channel = FlutterMethodChannel(name: "gulel/personnel", binaryMessenger: engineBridge.applicationRegistrar.messenger())
    channel.setMethodCallHandler { [weak self] call, result in self?.tracker.handle(call, result) }
    tracker.resume()
  }
}

// Native Core Location engine. iOS delivery is event-driven, never a guaranteed 10s timer.
final class PilotTracker: NSObject, CLLocationManagerDelegate {
  private let manager = CLLocationManager()
  private let monitor = NWPathMonitor()
  private let queue = PilotQueue()
  private var credentials: [String:Any]? = Vault.read()
  private var connected = false, uploading = false, running = false, waiting = true
  private var nextUpload = Date.distantPast, nextHeartbeat = Date.distantPast, lastSample = Date.distantPast, lastMovement = Date()
  private var anchor: CLLocation?, lastDelivered = Date.distantPast
  private var moving = 30, stationary = 300, after = 180, heartbeat = 600, failures = 0
  private var diagnostic = "", isStill = false
  private var boundarySouth: Double?, boundaryWest: Double?, boundaryNorth: Double?, boundaryEast: Double?
  private var wakeLatitude: Double?, wakeLongitude: Double?, wakeRadius: Double?, outsideSince: Date?, outsideMode = false
  private var precisionBoostUntil = Date.distantPast
  private var forceNextSample = false
  private var heartbeatTimer: Timer?
  private var significantChangesActive = false
  private var pushRegistering = false
  private var remoteConsentPresenting = false
  private var nextPushRegistration = Date.distantPast
  private var pushServiceSession: Any?
  private var task: UIBackgroundTaskIdentifier = .invalid
  private let prefs = UserDefaults.standard
  override init() {
    super.init(); manager.delegate = self
    manager.desiredAccuracy = kCLLocationAccuracyNearestTenMeters
    manager.distanceFilter = kCLDistanceFilterNone
    manager.activityType = .fitness
    manager.pausesLocationUpdatesAutomatically = false
    manager.allowsBackgroundLocationUpdates = true
    manager.showsBackgroundLocationIndicator = false
    UIDevice.current.isBatteryMonitoringEnabled = true
    monitor.pathUpdateHandler = { [weak self] path in DispatchQueue.main.async {
      guard let self = self else { return }; self.connected = path.status == .satisfied
      if self.connected { if !self.outsideMode { self.nextUpload = .distantPast }; self.upload() }
    }}
    monitor.start(queue: DispatchQueue(label:"gulel.network"))
    heartbeatTimer=Timer.scheduledTimer(withTimeInterval:60,repeats:true){[weak self] _ in self?.upload()}
    if prefs.object(forKey:"boundary_south") != nil && prefs.object(forKey:"boundary_west") != nil && prefs.object(forKey:"boundary_north") != nil && prefs.object(forKey:"boundary_east") != nil && prefs.object(forKey:"boundary_lat") != nil && prefs.object(forKey:"boundary_lon") != nil && prefs.object(forKey:"boundary_radius") != nil {
      configureBoundary(prefs.double(forKey:"boundary_south"),prefs.double(forKey:"boundary_west"),prefs.double(forKey:"boundary_north"),prefs.double(forKey:"boundary_east"),prefs.double(forKey:"boundary_lat"),prefs.double(forKey:"boundary_lon"),prefs.double(forKey:"boundary_radius"))
    }
  }
  private var ready: Bool {
    credentials != nil && manager.authorizationStatus == .authorizedAlways && CLLocationManager.locationServicesEnabled() && !prefs.bool(forKey:"revoked")
  }
  func resume() {
    guard ready else { return }
    applyLocationProfile()
    monitorBoundary()
    if !significantChangesActive && CLLocationManager.significantLocationChangeMonitoringAvailable() {
      manager.startMonitoringSignificantLocationChanges()
      significantChangesActive = true
    }
    manager.startUpdatingLocation(); running = true; upload()
    if prefs.bool(forKey:"remote_location_enabled") { registerLocationPush { _ in } }
  }
  func resumeForLocationLaunch() {
    guard ready else { return }
    resume()
    beginPrecisionBoost()
  }
  func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
    if ready { resume() } else {
      running = false; manager.stopUpdatingLocation()
      manager.stopMonitoringLocationPushes()
      if #available(iOS 18.0, *) { (pushServiceSession as? CLServiceSession)?.invalidate() }
      pushServiceSession=nil
      nextPushRegistration = .distantPast
      if significantChangesActive { manager.stopMonitoringSignificantLocationChanges(); significantChangesActive = false }
    }
  }
  func handle(_ call: FlutterMethodCall, _ result: @escaping FlutterResult) {
    let args = call.arguments as? [String:Any] ?? [:]
    if call.method == "status" && ready { presentRemoteConsentIfNeeded() }
    switch call.method {
    case "remoteLocation":
      guard !pushRegistering else { result(FlutterError(code:"push",message:"İşlem sürüyor / Please wait",details:nil));return }
      guard let c=credentials,let token=c["token"] as? String,let enabled=args["enabled"] as? Bool else { result(FlutterError(code:"push",message:"Pair device first",details:nil));return }
      if enabled {
        nextPushRegistration = .distantPast
        registerLocationPush { error in
          if let error=error { result(FlutterError(code:"push",message:error,details:nil)) }
          else { self.prefs.set(true,forKey:"remote_location_enabled");result(nil) }
        }
      } else {
        pushRegistering=true
        rpc(c,"location-push",["p_token":token,"enabled":false]) { response,error in
          self.pushRegistering=false
          guard response != nil else { result(FlutterError(code:"push",message:"Paylaşım kapatılamadı; bağlantıyı kontrol edip tekrar deneyin / Could not disable sharing; retry online",details:nil));return }
          self.prefs.set(false,forKey:"remote_location_enabled")
          self.manager.stopMonitoringLocationPushes()
          if #available(iOS 18.0, *) { (self.pushServiceSession as? CLServiceSession)?.invalidate() }
          self.pushServiceSession=nil
          result(nil)
        }
      }
    case "status": result(["paired":credentials != nil,"name":credentials?["name"] ?? "","ready":ready,"running":running,"waiting":waiting,"queue":queue.count,"dropped":queue.dropped,"last_fix":prefs.string(forKey:"last_fix") ?? "—","last_upload":prefs.string(forKey:"last_upload") ?? "—","diagnostic":diagnostic,"remote_location_enabled":prefs.bool(forKey:"remote_location_enabled")])
    case "attendance":
      guard let c = credentials, let token = c["token"] as? String else { result(nil); return }
      let formatter = DateFormatter(); formatter.calendar = Calendar(identifier:.gregorian); formatter.locale = Locale(identifier:"en_US_POSIX"); formatter.timeZone = TimeZone(identifier:"Europe/Istanbul"); formatter.dateFormat = "yyyy-MM-dd"
      rpc(c,"attendance",["p_token":token,"date":formatter.string(from:Date())]) { response,error in
        guard let response=response, let data=try? JSONSerialization.data(withJSONObject:response) else { result(FlutterError(code:"attendance",message:error ?? "Attendance unavailable",details:nil));return }
        result(String(decoding:data,as:UTF8.self))
      }
    case "timeClock":
      guard let c=credentials,let token=c["token"] as? String,let action=args["action"] as? String,["clock_in","clock_out"].contains(action) else{result(FlutterError(code:"time_clock",message:"Invalid clock action",details:nil));return}
      rpc(c,"time_clock",["p_token":token,"action":action]){response,error in
        guard let response=response,let data=try? JSONSerialization.data(withJSONObject:response) else{result(FlutterError(code:"time_clock",message:error ?? "Clock action unavailable",details:nil));return}
        result(String(decoding:data,as:UTF8.self))
      }
    case "prepareClockIn":
      if ready{beginPrecisionBoost()};result(nil)
    case "resume": resume(); result(nil)
    case "permissions":
      switch manager.authorizationStatus {
      case .notDetermined:
        prefs.set(false,forKey:"always_upgrade_requested")
        manager.requestWhenInUseAuthorization()
      case .authorizedWhenInUse:
        if !prefs.bool(forKey:"always_upgrade_requested") {
          prefs.set(true,forKey:"always_upgrade_requested")
          manager.requestAlwaysAuthorization()
        } else { openLocationSettings() }
      default: openLocationSettings()
      }
      result(nil)
    case "settings", "batterySettings":
      openLocationSettings()
      result(nil)
    case "pair":
      guard credentials == nil, let origin = args["url"] as? String,
        let url = URL(string:origin), url.scheme == "https", url.host != nil, url.user == nil, url.query == nil, url.fragment == nil, url.path.isEmpty || url.path == "/",
        let code = args["code"] as? String,
        code.range(of:"^[0-9]{4}$",options:.regularExpression) != nil
        else { result(FlutterError(code:"setup",message:"Valid HTTPS and 4-digit pairing code required",details:nil)); return }
      let pending = Vault.read(account:"pairing")
      let token = (pending?["url"] as? String) == origin && (pending?["code_hash"] as? String) == Vault.hash(code) ? (pending?["token"] as? String ?? Vault.random(32)) : Vault.random(32)
      guard Vault.write(["url":origin,"code_hash":Vault.hash(code),"token":token],account:"pairing") else {result(FlutterError(code:"keychain",message:"Pairing state could not be saved",details:nil));return}
      var value: [String:Any] = ["url":origin.trimmingCharacters(in:CharacterSet(charactersIn:"/")),"backend":"railway","token":token]
      rpc(value,"pair_device",["p_code":code,"p_token":token]) { response, error in
        guard let response = response, response["error"] == nil,
          let id = response["device_id"], let staff = response["staff_id"], let name = response["name"]
          else { result(FlutterError(code:"pair",message:(response?["error"] as? String) ?? error ?? "Pairing failed",details:nil)); return }
        value["device_id"] = id; value["staff_id"] = staff; value["name"] = name
        guard Vault.write(value) else { result(FlutterError(code:"keychain",message:"Keychain write failed. Revoke device and pair again.",details:nil)); return }
        self.credentials = value; self.prefs.set(false,forKey:"revoked"); self.resume(); result(nil)
      }
    default: result(FlutterMethodNotImplemented)
    }
  }
  func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
    guard ready else { return }
    for fix in locations {
      guard fix.horizontalAccuracy >= 0, fix.timestamp > lastDelivered, abs(fix.timestamp.timeIntervalSinceNow) < 120 else { continue }
      lastDelivered = fix.timestamp
      updateBoundaryMode(fix)
      let previous = anchor ?? fix
      let reliable = fix.horizontalAccuracy <= 35 && previous.horizontalAccuracy <= 35
      let moved = reliable && (fix.distance(from:previous) > max(12,fix.horizontalAccuracy+previous.horizontalAccuracy) || (fix.speedAccuracy >= 0 && fix.speed-fix.speedAccuracy > 0.7))
      if moved || !reliable { lastMovement = Date(); isStill = false; anchor = fix }
      else if Date().timeIntervalSince(lastMovement) >= Double(after) { isStill = true }
      if anchor == nil { anchor = fix }
      let seconds = outsideMode ? 3600 : (isStill ? stationary : moving)
      applyLocationProfile()
      guard forceNextSample || fix.timestamp.timeIntervalSince(lastSample) >= Double(seconds), let c = credentials else { continue }
      forceNextSample=false
      lastSample = fix.timestamp
      let battery = UIDevice.current.batteryLevel
      let point: [String:Any] = ["id":UUID().uuidString,"staff_id":c["staff_id"]!,"device_id":c["device_id"]!,"measured_at":ISO8601DateFormatter().string(from:fix.timestamp),"latitude":fix.coordinate.latitude,"longitude":fix.coordinate.longitude,"accuracy":fix.horizontalAccuracy,"speed":fix.speed >= 0 ? fix.speed as Any : NSNull(),"heading":fix.course >= 0 ? fix.course as Any : NSNull(),"battery":battery >= 0 ? Int(battery*100) as Any : NSNull(),"motion":isStill ? "stationary" : reliable ? "moving" : "unknown"]
      do { try queue.add(point); prefs.set(point["measured_at"],forKey:"last_fix") }
      catch { diagnostic = "Kalıcı kuyruk yazılamadı / Persistent queue write failed" }
    }
    upload()
  }
  func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
    diagnostic = "Konum alınamıyor / Location unavailable"
    if (error as? CLError)?.code == .denied { running = false; manager.stopUpdatingLocation() }
  }
  func locationManagerDidPauseLocationUpdates(_ manager: CLLocationManager) {
    running = false
    // Pausing is allowed only in the off-site power-saving profile. An
    // on-site pause must not leave the native engine waiting for Flutter.
    if ready && !outsideMode { resume() }
  }
  func locationManagerDidResumeLocationUpdates(_ manager: CLLocationManager) {
    running = ready
  }
  private func upload() {
    let now=Date()
    guard let c = credentials, !prefs.bool(forKey:"revoked"), !uploading, now >= nextUpload else { return }
    guard connected else { waiting = true; return }
    let batch = queue.batch()
    guard !batch.isEmpty || now >= nextHeartbeat else{return}
    uploading = true
    task = UIApplication.shared.beginBackgroundTask(withName:"Gulel upload") { [weak self] in self?.finishTask() }
    let version = Bundle.main.object(forInfoDictionaryKey:"CFBundleShortVersionString") as? String ?? "0.2.26"
    let build = Bundle.main.object(forInfoDictionaryKey:"CFBundleVersion") as? String ?? "28"
    let status: [String:Any] = ["app_version":version+"+"+build,"queue_count":queue.count,"dropped_count":queue.dropped,"sent_at_ms":Date().timeIntervalSince1970*1000,"location_enabled":CLLocationManager.locationServicesEnabled()]
    rpc(c,"ingest",["p_token":c["token"]!,"p_points":batch,"p_status":status]) { response,error in
      defer { self.uploading = false; self.finishTask() }
      if let response = response, let ids = response["ack_ids"] as? [String] {
        self.queue.acknowledge(ids); self.waiting = false; self.failures = 0; self.diagnostic = ""
        self.prefs.set(ISO8601DateFormatter().string(from:Date()),forKey:"last_upload")
        if let config = response["config"] as? [String:Any] {
          if let m=config["moving_seconds"] as? Int,let s=config["stationary_seconds"] as? Int,let a=config["stationary_after"] as? Int,(10...60).contains(m),(30...300).contains(s),(120...900).contains(a){self.moving=m;self.stationary=s;self.after=a}
          if let h=config["heartbeat_seconds"] as? Int,(30...900).contains(h){self.heartbeat=h}
          if let boundary=config["farm_boundary"] as? [String:Any],let south=(boundary["south"] as? NSNumber)?.doubleValue,let west=(boundary["west"] as? NSNumber)?.doubleValue,let north=(boundary["north"] as? NSNumber)?.doubleValue,let east=(boundary["east"] as? NSNumber)?.doubleValue,let lat=(boundary["centerLat"] as? NSNumber)?.doubleValue,let lon=(boundary["centerLon"] as? NSNumber)?.doubleValue,let radius=(boundary["radius_meters"] as? NSNumber)?.doubleValue{self.configureBoundary(south,west,north,east,lat,lon,radius)}
        }
        self.nextHeartbeat=Date().addingTimeInterval(self.outsideMode ? 3600 : Double(self.heartbeat))
        self.nextUpload = Date().addingTimeInterval(self.queue.count > 0 ? 1 : self.uploadCadence)
        if self.queue.count > 0 && !self.outsideMode { DispatchQueue.main.asyncAfter(deadline:.now()+1.2) { self.upload() } }
      } else {
        self.waiting = true; self.failures = min(7,self.failures+1)
        self.nextUpload = Date().addingTimeInterval(self.outsideMode ? 3600 : min(300,5*pow(2,Double(self.failures))) + Double.random(in:1...5))
        self.diagnostic = error ?? "Upload failed"
        if error == "HTTP 401" || error == "HTTP 403" {
          self.prefs.set(true,forKey:"revoked");self.running=false;self.manager.stopUpdatingLocation()
          if self.significantChangesActive { self.manager.stopMonitoringSignificantLocationChanges();self.significantChangesActive=false }
        }
      }
    }
  }
  private func configureBoundary(_ south:Double,_ west:Double,_ north:Double,_ east:Double,_ latitude:Double,_ longitude:Double,_ radius:Double){
    guard (-90.0...90.0).contains(south),(-90.0...90.0).contains(north),(-180.0...180.0).contains(west),(-180.0...180.0).contains(east),south<north,west<east,(-90.0...90.0).contains(latitude),(-180.0...180.0).contains(longitude),radius>0 else{return}
    let changed=wakeLatitude != latitude || wakeLongitude != longitude || wakeRadius != radius
    boundarySouth=south;boundaryWest=west;boundaryNorth=north;boundaryEast=east;wakeLatitude=latitude;wakeLongitude=longitude;wakeRadius=radius
    prefs.set(south,forKey:"boundary_south");prefs.set(west,forKey:"boundary_west");prefs.set(north,forKey:"boundary_north");prefs.set(east,forKey:"boundary_east");prefs.set(latitude,forKey:"boundary_lat");prefs.set(longitude,forKey:"boundary_lon");prefs.set(radius,forKey:"boundary_radius")
    if changed{monitorBoundary()}
  }
  private func monitorBoundary(){
    guard ready,let latitude=wakeLatitude,let longitude=wakeLongitude,let radius=wakeRadius,CLLocationManager.isMonitoringAvailable(for:CLCircularRegion.self) else{return}
    let maximum=manager.maximumRegionMonitoringDistance
    let targetRadius=maximum>0 ? min(radius,maximum) : radius
    if let current=manager.monitoredRegions.first(where:{$0.identifier=="farm-boundary"}) as? CLCircularRegion,
      abs(current.center.latitude-latitude)<0.0000001,abs(current.center.longitude-longitude)<0.0000001,abs(current.radius-targetRadius)<0.1,
      current.notifyOnEntry,current.notifyOnExit{return}
    for region in manager.monitoredRegions where region.identifier=="farm-boundary"{manager.stopMonitoring(for:region)}
    let region=CLCircularRegion(center:CLLocationCoordinate2D(latitude:latitude,longitude:longitude),radius:targetRadius,identifier:"farm-boundary")
    region.notifyOnEntry=true;region.notifyOnExit=true;manager.startMonitoring(for:region)
  }
  private func updateBoundaryMode(_ fix: CLLocation) {
    guard let south = boundarySouth, let west = boundaryWest, let north = boundaryNorth, let east = boundaryEast else { return }
    let inside = fix.coordinate.latitude >= south && fix.coordinate.latitude <= north && fix.coordinate.longitude >= west && fix.coordinate.longitude <= east
    if inside {
      outsideSince = nil
      if outsideMode {
        outsideMode = false
        nextUpload = .distantPast
        nextHeartbeat = .distantPast
      }
      applyLocationProfile()
      return
    }
    if outsideSince == nil {
      outsideSince = fix.timestamp
      return
    }
    if !outsideMode && fix.timestamp.timeIntervalSince(outsideSince!) >= 15 * 60 {
      outsideMode = true
      lastSample = .distantPast
      applyLocationProfile()
      nextUpload = .distantPast
      nextHeartbeat = .distantPast
    }
  }
  private var uploadCadence: TimeInterval { outsideMode ? 3600 : isStill ? 300 : 60 }
  private func applyLocationProfile() {
    let boosting = Date() < precisionBoostUntil
    let reduced = outsideMode && !boosting
    manager.pausesLocationUpdatesAutomatically = reduced
    if reduced {
      manager.desiredAccuracy = kCLLocationAccuracyThreeKilometers
      manager.distanceFilter = 500
    } else {
      // A stationary employee still needs fresh fixes. A distance filter
      // would suppress those callbacks; a Timer cannot wake a suspended app.
      // Retain accuracy compatible with the panel's <=35 m reliable fixes.
      manager.desiredAccuracy = boosting ? kCLLocationAccuracyBest : kCLLocationAccuracyNearestTenMeters
      manager.distanceFilter = kCLDistanceFilterNone
    }
  }
  private func beginPrecisionBoost() {
    precisionBoostUntil = Date().addingTimeInterval(30)
    forceNextSample = true
    nextUpload = .distantPast
    applyLocationProfile()
    manager.startUpdatingLocation()
    running = true
    manager.requestLocation()
    DispatchQueue.main.asyncAfter(deadline: .now() + 30) { [weak self] in 
      guard let self = self, Date() >= self.precisionBoostUntil else { return }
      self.applyLocationProfile()
    }
  }
  func locationManager(_ manager: CLLocationManager, didEnterRegion region: CLRegion) {
    guard region.identifier == "farm-boundary", ready else { return }
    outsideSince = nil
    outsideMode = false
    nextHeartbeat = .distantPast
    beginPrecisionBoost()
  }
  func locationManager(_ manager:CLLocationManager,didExitRegion region:CLRegion){
    guard region.identifier=="farm-boundary",ready else{return}
    beginPrecisionBoost()
  }
  private func openLocationSettings() {
    if let url=URL(string:UIApplication.openSettingsURLString) { UIApplication.shared.open(url) }
  }
  private func presentRemoteConsentIfNeeded() {
    guard UIApplication.shared.applicationState == .active,
      !remoteConsentPresenting,!prefs.bool(forKey:"remote_location_choice_made"),
      !prefs.bool(forKey:"remote_location_enabled"),!pushRegistering else { return }
    guard let scene=UIApplication.shared.connectedScenes.first(where:{$0.activationState == .foregroundActive}) as? UIWindowScene,
      let controller=scene.windows.first(where:{$0.isKeyWindow})?.rootViewController,
      controller.presentedViewController == nil else { return }
    remoteConsentPresenting=true
    let alert=UIAlertController(title:"Yönetici konum isteği / Admin location requests",
      message:"Bu uygulamadaki yetkili şirket yöneticilerinin uygulama açık değilken de konumunuzu istemesine izin veriyor musunuz? Alan dışındaki koordinatlar kaydedilmez veya gösterilmez. İzni iPhone Ayarlar > bu uygulama > Konum bölümünden Her Zaman iznini kaldırarak durdurabilirsiniz.\n\nAllow authorized company administrators to request your location even when the app is not open? Off-site coordinates are not stored or displayed. Remove Always location permission in iPhone Settings to stop this access.",
      preferredStyle:.alert)
    alert.addAction(UIAlertAction(title:"İzin verme / Don't allow",style:.cancel){ _ in
      self.prefs.set(true,forKey:"remote_location_choice_made");self.remoteConsentPresenting=false
    })
    alert.addAction(UIAlertAction(title:"İzin ver / Allow",style:.default){ _ in
      self.prefs.set(true,forKey:"remote_location_choice_made")
      self.prefs.set(true,forKey:"remote_location_enabled");self.remoteConsentPresenting=false
      self.nextPushRegistration = .distantPast
      self.registerLocationPush { error in if let error=error { self.diagnostic=error } }
    })
    controller.present(alert,animated:true)
  }
  private func registerLocationPush(_ completion:@escaping (String?)->Void) {
    guard ready,let c=credentials,let token=c["token"] as? String else { completion("Konum izni Her Zaman olmalı / Always location permission required");return }
    guard !pushRegistering else { completion("İşlem sürüyor / Please wait");return }
    guard Date() >= nextPushRegistration else { completion(nil);return }
    guard let environment=Bundle.main.object(forInfoDictionaryKey:"LocationPushEnvironment") as? String,["development","production"].contains(environment),
      let server=Bundle.main.object(forInfoDictionaryKey:"LocationPushServerURL") as? String,server == (c["url"] as? String) else { completion("Konum uzantısı sunucu ayarı eşleşmiyor / Location extension server mismatch");return }
    pushRegistering=true
    if #available(iOS 18.0, *) { if pushServiceSession == nil { pushServiceSession=CLServiceSession(authorization:.always) } }
    manager.startMonitoringLocationPushes { data,error in DispatchQueue.main.async {
      guard self.ready else {
        self.pushRegistering=false;self.nextPushRegistration = .distantPast
        self.manager.stopMonitoringLocationPushes()
        completion("Konum izni Her Zaman olmalı / Always location permission required");return
      }
      guard error == nil,let data=data else {
        self.pushRegistering=false;self.nextPushRegistration=Date().addingTimeInterval(60)
        completion("Apple konum isteği kaydı başarısız; imza ve izinleri kontrol edin / Location push registration failed");return
      }
      self.rpc(c,"location-push",["p_token":token,"enabled":true,"token":data.map{String(format:"%02x",$0)}.joined(),"environment":environment]) { response,error in
        self.pushRegistering=false
        self.nextPushRegistration=Date().addingTimeInterval(response == nil ? 60 : 3600)
        if response == nil && !self.prefs.bool(forKey:"remote_location_enabled") { self.manager.stopMonitoringLocationPushes() }
        completion(response == nil ? "Sunucuya kayıt yapılamadı / Could not register with server" : nil)
      }
    }}
  }
  private func finishTask() { if task != .invalid { UIApplication.shared.endBackgroundTask(task);task = .invalid } }
  private func rpc(_ c:[String:Any],_ method:String,_ body:[String:Any],_ completion:@escaping ([String:Any]?,String?)->Void) {
    let route = method == "pair_device" ? "pair" : method == "attendance" ? "attendance" : method == "time_clock" ? "time-clock" : method == "location-push" ? "location-push" : "ingest"
    let endpoint = (c["backend"] as? String) == "railway" ? "/api/device/" + route : "/rest/v1/rpc/" + method
    guard let origin = c["url"] as? String, let url = URL(string:origin+endpoint), url.scheme == "https",
      let data = try? JSONSerialization.data(withJSONObject:body) else { completion(nil,"Invalid request");return }
    var request = URLRequest(url:url,timeoutInterval:25);request.httpMethod="POST";request.httpBody=data
    if (c["backend"] as? String) != "railway" { request.setValue(c["key"] as? String,forHTTPHeaderField:"apikey") };request.setValue("application/json",forHTTPHeaderField:"Content-Type")
    URLSession.shared.dataTask(with:request) { data,response,error in DispatchQueue.main.async {
      guard error == nil, let http = response as? HTTPURLResponse else { completion(nil,"Bağlantı bekleniyor / Waiting for network");return }
      guard (200...299).contains(http.statusCode) else { completion(nil,"HTTP \(http.statusCode)");return }
      guard let data=data, let json=(try? JSONSerialization.jsonObject(with:data)) as? [String:Any] else {completion(nil,"Invalid response");return}
      completion(json,nil)
    }}.resume()
  }
}

private enum Vault {
  static let query: [String:Any] = [kSecClass as String:kSecClassGenericPassword,kSecAttrService as String:"tr.com.gulel.personnel",kSecAttrAccount as String:"device"]
  static func read(account:String="device")->[String:Any]? {
    var q=query;q[kSecAttrAccount as String]=account;q[kSecReturnData as String]=true;q[kSecMatchLimit as String]=kSecMatchLimitOne
    var result:CFTypeRef?;guard SecItemCopyMatching(q as CFDictionary,&result)==errSecSuccess,let data=result as? Data else{return nil}
    return (try? JSONSerialization.jsonObject(with:data)) as? [String:Any]
  }
  static func write(_ value:[String:Any],account:String="device")->Bool {
    var query=Self.query;query[kSecAttrAccount as String]=account
    guard let data=try? JSONSerialization.data(withJSONObject:value) else{return false}
    let attributes:[String:Any]=[kSecValueData as String:data,kSecAttrAccessible as String:kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly]
    let status=SecItemUpdate(query as CFDictionary,attributes as CFDictionary)
    if status==errSecSuccess{return true}
    var q=query;attributes.forEach{q[$0.key]=$0.value};return SecItemAdd(q as CFDictionary,nil)==errSecSuccess
  }
  static func hash(_ text:String)->String{SHA256.hash(data:Data(text.utf8)).map{String(format:"%02x",$0)}.joined()}
  static func random(_ count:Int)->String{var bytes=[UInt8](repeating:0,count:count);precondition(SecRandomCopyBytes(kSecRandomDefault,count,&bytes)==errSecSuccess);return bytes.map{String(format:"%02x",$0)}.joined()}
}

private final class PilotQueue {
  private var db:OpaquePointer?
  private let transient=unsafeBitCast(-1,to:sqlite3_destructor_type.self)
  init(){
    let directory=FileManager.default.urls(for:.applicationSupportDirectory,in:.userDomainMask)[0]
    try? FileManager.default.createDirectory(at:directory,withIntermediateDirectories:true)
    let file=directory.appendingPathComponent("samples.sqlite")
    if sqlite3_open(file.path,&db)==SQLITE_OK {
      sqlite3_exec(db,"PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS samples(id TEXT PRIMARY KEY,created REAL NOT NULL,body TEXT NOT NULL); CREATE TABLE IF NOT EXISTS counters(name TEXT PRIMARY KEY,value INTEGER NOT NULL); INSERT OR IGNORE INTO counters VALUES('dropped',0);",nil,nil,nil)
      try? FileManager.default.setAttributes([.protectionKey:FileProtectionType.completeUntilFirstUserAuthentication],ofItemAtPath:file.path)
      var resource=file;var values=URLResourceValues();values.isExcludedFromBackup=true;try? resource.setResourceValues(values)
    }
  }
  deinit{sqlite3_close(db)}
  private func scalar(_ sql:String)->Int{var stmt:OpaquePointer?;defer{sqlite3_finalize(stmt)};guard sqlite3_prepare_v2(db,sql,-1,&stmt,nil)==SQLITE_OK,sqlite3_step(stmt)==SQLITE_ROW else{return 0};return Int(sqlite3_column_int64(stmt,0))}
  var count:Int{scalar("SELECT count(*) FROM samples")}
  var dropped:Int{scalar("SELECT value FROM counters WHERE name='dropped'")}
  func add(_ point:[String:Any]) throws {
    guard let id=point["id"] as? String else{throw NSError(domain:"queue",code:1)}
    let data=try JSONSerialization.data(withJSONObject:point),body=String(decoding:data,as:UTF8.self)
    guard sqlite3_exec(db,"BEGIN IMMEDIATE",nil,nil,nil)==SQLITE_OK else{throw NSError(domain:"queue",code:2)}
    var committed=false;defer{if !committed{sqlite3_exec(db,"ROLLBACK",nil,nil,nil)}}
    var stmt:OpaquePointer?;defer{sqlite3_finalize(stmt)}
    guard sqlite3_prepare_v2(db,"INSERT OR IGNORE INTO samples VALUES(?,?,?)",-1,&stmt,nil)==SQLITE_OK else{throw NSError(domain:"queue",code:3)}
    sqlite3_bind_text(stmt,1,id,-1,transient);sqlite3_bind_double(stmt,2,Date().timeIntervalSince1970);sqlite3_bind_text(stmt,3,body,-1,transient)
    guard sqlite3_step(stmt)==SQLITE_DONE else{throw NSError(domain:"queue",code:4)}
    sqlite3_exec(db,"DELETE FROM samples WHERE created < \(Date().timeIntervalSince1970-604800)",nil,nil,nil)
    let expired=Int(sqlite3_changes(db)),overflow=max(0,count-65000)
    sqlite3_exec(db,"DELETE FROM samples WHERE id IN(SELECT id FROM samples ORDER BY created LIMIT \(overflow))",nil,nil,nil)
    sqlite3_exec(db,"UPDATE counters SET value=value+\(expired+overflow) WHERE name='dropped'",nil,nil,nil)
    guard sqlite3_exec(db,"COMMIT",nil,nil,nil)==SQLITE_OK else{throw NSError(domain:"queue",code:5)};committed=true
  }
  func batch()->[[String:Any]] {
    var stmt:OpaquePointer?;defer{sqlite3_finalize(stmt)};var rows=[[String:Any]]()
    guard sqlite3_prepare_v2(db,"SELECT body FROM samples ORDER BY created,id LIMIT 200",-1,&stmt,nil)==SQLITE_OK else{return rows}
    while sqlite3_step(stmt)==SQLITE_ROW {if let bytes=sqlite3_column_text(stmt,0),let data=String(cString:bytes).data(using:.utf8),let row=(try? JSONSerialization.jsonObject(with:data)) as? [String:Any]{rows.append(row)}}
    return rows
  }
  func acknowledge(_ ids:[String]) {
    sqlite3_exec(db,"BEGIN IMMEDIATE",nil,nil,nil);var stmt:OpaquePointer?;defer{sqlite3_finalize(stmt)}
    guard sqlite3_prepare_v2(db,"DELETE FROM samples WHERE id=?",-1,&stmt,nil)==SQLITE_OK else{sqlite3_exec(db,"ROLLBACK",nil,nil,nil);return}
    for id in ids{sqlite3_reset(stmt);sqlite3_bind_text(stmt,1,id,-1,transient);if sqlite3_step(stmt) != SQLITE_DONE {sqlite3_exec(db,"ROLLBACK",nil,nil,nil);return}}
    sqlite3_exec(db,"COMMIT",nil,nil,nil)
  }
}
