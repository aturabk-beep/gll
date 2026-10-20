import Foundation
import CoreLocation

// No pairing credentials, shared Keychain or arbitrary callback URLs in pushes.
// The server issues a device-bound, short-lived, single-use response credential.
final class LocationPushService: NSObject, CLLocationPushServiceExtension, CLLocationManagerDelegate {
  private var manager: CLLocationManager?
  private var completion: (() -> Void)?
  private var credentials: [String:Any] = [:]
  private var started = Date()
  private var uploading = false
  private var deadline: DispatchWorkItem?
  private var measurementDeadline: DispatchWorkItem?
  private var retry: DispatchWorkItem?
  private var requesting = false
  private var lastFailure = "LocationTimedOut"
  private var networkTask: URLSessionDataTask?
  private var serviceSession: Any?

  func didReceiveLocationPushPayload(_ payload: [String:Any], completion: @escaping () -> Void) {
    DispatchQueue.main.async {
      self.completion=completion;self.started=Date();self.uploading=false;self.requesting=false
      self.lastFailure="LocationTimedOut"
      guard let id=payload["request_id"] as? String,UUID(uuidString:id) != nil,
        let token=payload["response_token"] as? String,token.range(of:"^[a-f0-9]{64}$",options:.regularExpression) != nil else { self.finish();return }
      self.credentials=["request_id":id,"response_token":token]
      let timeout=DispatchWorkItem { [weak self] in self?.finish() };self.deadline=timeout
      DispatchQueue.main.asyncAfter(deadline:.now()+24,execute:timeout)
      // Reserve the last eight seconds for uploading a result. iOS may still
      // terminate the extension earlier; a missing response remains a timeout.
      let measurementTimeout=DispatchWorkItem { [weak self] in
        guard let self=self,self.manager != nil else { return }
        self.sendUnavailable(self.lastFailure)
      }
      self.measurementDeadline=measurementTimeout
      DispatchQueue.main.asyncAfter(deadline:.now()+16,execute:measurementTimeout)
      // Re-check sharing before asking Core Location; withdrawn/expired/replayed
      // requests never start a GPS query.
      self.post("location-push-authorize",self.credentials) { allowed in
        guard self.completion != nil else { return }
        guard allowed else { self.finish();return }
        if #available(iOS 18.0, *) { self.serviceSession=CLServiceSession(authorization:.always) }
        let manager=CLLocationManager();self.manager=manager;manager.delegate=self
        manager.desiredAccuracy=kCLLocationAccuracyNearestTenMeters
        self.requestFix()
      }
    }
  }
  func locationManager(_ manager: CLLocationManager,didUpdateLocations locations: [CLLocation]) {
    guard completion != nil,!uploading else { return }
    requesting=false
    guard let fix=locations.filter({Self.rejectionReason($0,started:started,now:Date()) == nil}).max(by:{$0.timestamp<$1.timestamp}) else {
      if let fix=locations.max(by:{$0.timestamp<$1.timestamp}) {
        lastFailure=Self.rejectionReason(fix,started:started,now:Date()) ?? "LocationTimedOut"
      }
      scheduleRetry();return
    }
    uploading=true
    stopMeasuring()
    var body=credentials
    body["fix"]=["measured_at":ISO8601DateFormatter().string(from:fix.timestamp),"latitude":fix.coordinate.latitude,"longitude":fix.coordinate.longitude,"accuracy":fix.horizontalAccuracy]
    post("location-push-result",body) { _ in self.finish() }
  }
  // Internal so the native test target can exercise freshness/accuracy rules.
  static func rejectionReason(_ fix:CLLocation,started:Date,now:Date)->String? {
    if fix.timestamp < started.addingTimeInterval(-5) || abs(fix.timestamp.timeIntervalSince(now)) >= 60 || fix.timestamp > now.addingTimeInterval(5) { return "StaleLocation" }
    if !fix.horizontalAccuracy.isFinite || fix.horizontalAccuracy < 0 || fix.horizontalAccuracy > 35 { return "InsufficientAccuracy" }
    return nil
  }
  func locationManagerDidChangeAuthorization(_ manager:CLLocationManager) { requestFix() }
  private func requestFix() {
    guard completion != nil,!uploading,!requesting,let manager=manager else { return }
    guard Date().timeIntervalSince(started)<16 else { sendUnavailable(lastFailure);return }
    guard CLLocationManager.locationServicesEnabled() else { sendUnavailable("LocationServicesDisabled");return }
    switch manager.authorizationStatus {
    case .authorizedAlways: break
    case .notDetermined:
      // Newly-created managers can deliver their authorization state later.
      lastFailure="AuthorizationNotReady";scheduleRetry();return
    default: sendUnavailable("AlwaysPermissionRequired");return
    }
    guard manager.accuracyAuthorization == .fullAccuracy else { sendUnavailable("PreciseLocationRequired");return }
    requesting=true;retry?.cancel();retry=nil;manager.requestLocation()
  }
  private func scheduleRetry() {
    guard completion != nil,!uploading,retry == nil else { return }
    let work=DispatchWorkItem { [weak self] in self?.retry=nil;self?.requestFix() }
    retry=work;DispatchQueue.main.asyncAfter(deadline:.now()+1,execute:work)
  }
  func locationManager(_ manager:CLLocationManager,didFailWithError error:Error) {
    guard completion != nil,!uploading else { return };requesting=false
    if (error as? CLError)?.code == .denied { sendUnavailable("LocationDenied");return }
    if (error as? CLError)?.code == .locationUnknown { lastFailure="LocationUnknown";scheduleRetry();return }
    sendUnavailable("LocationServiceError")
  }
  private func stopMeasuring() {
    retry?.cancel();retry=nil;measurementDeadline?.cancel();measurementDeadline=nil
    manager?.stopUpdatingLocation();requesting=false
  }
  private func sendUnavailable(_ reason:String) {
    guard completion != nil,!uploading else { return };uploading=true
    stopMeasuring()
    var body=credentials;body["result"]="unavailable";body["device_error"]=reason
    post("location-push-result",body) { _ in self.finish() }
  }
  private func post(_ route:String,_ body:[String:Any],_ done:@escaping (Bool)->Void) {
    guard let origin=Bundle.main.object(forInfoDictionaryKey:"LocationPushServerURL") as? String,
      let url=URL(string:origin+"/api/device/"+route),url.scheme == "https",
      let data=try? JSONSerialization.data(withJSONObject:body) else { done(false);return }
    var request=URLRequest(url:url,timeoutInterval:8);request.httpMethod="POST";request.httpBody=data
    request.setValue("application/json",forHTTPHeaderField:"Content-Type")
    networkTask=URLSession.shared.dataTask(with:request) { _,response,error in
      DispatchQueue.main.async { done(error == nil && (response as? HTTPURLResponse)?.statusCode == 200) }
    }
    networkTask?.resume()
  }
  private func finish() {
    stopMeasuring()
    deadline?.cancel();deadline=nil;networkTask?.cancel();networkTask=nil
    manager?.stopUpdatingLocation();manager?.delegate=nil;manager=nil
    if #available(iOS 18.0, *) { (serviceSession as? CLServiceSession)?.invalidate() };serviceSession=nil
    let done=completion;completion=nil;done?()
  }
  func serviceExtensionWillTerminate() { finish() }
}
