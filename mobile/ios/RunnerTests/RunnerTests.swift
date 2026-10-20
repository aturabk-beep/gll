import Flutter
import UIKit
import XCTest
import CoreLocation

class RunnerTests: XCTestCase {

  func testPushFixValidation() {
    let now=Date()
    func fix(_ accuracy:Double,_ age:Double)->CLLocation {
      CLLocation(coordinate:CLLocationCoordinate2D(latitude:39.9,longitude:32.77),
        altitude:0,horizontalAccuracy:accuracy,verticalAccuracy:-1,
        timestamp:now.addingTimeInterval(-age))
    }
    XCTAssertNil(LocationPushService.rejectionReason(fix(12,0),started:now,now:now))
    XCTAssertNil(LocationPushService.rejectionReason(fix(35,5),started:now,now:now))
    XCTAssertEqual(LocationPushService.rejectionReason(fix(36,0),started:now,now:now),"InsufficientAccuracy")
    XCTAssertEqual(LocationPushService.rejectionReason(fix(-1,0),started:now,now:now),"InsufficientAccuracy")
    XCTAssertEqual(LocationPushService.rejectionReason(fix(12,6),started:now,now:now),"StaleLocation")
    XCTAssertEqual(LocationPushService.rejectionReason(fix(12,-6),started:now,now:now),"StaleLocation")
    // A poor first sample must not make the later fresh sample unacceptable.
    XCTAssertEqual(LocationPushService.rejectionReason(fix(80,0),started:now,now:now),"InsufficientAccuracy")
    XCTAssertNil(LocationPushService.rejectionReason(fix(10,0),started:now,now:now))
  }

}
