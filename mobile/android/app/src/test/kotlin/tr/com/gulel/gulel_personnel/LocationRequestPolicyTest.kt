package tr.com.gulel.gulel_personnel

import com.google.android.gms.location.Priority
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class) @Config(sdk=[28])
class LocationRequestPolicyTest {
    @Test fun stationaryEmployeeDoesNotNeedToWalkToGetFreshFixes() {
        val request = trackingLocationRequest(300, false)
        assertEquals(0f, request.minUpdateDistanceMeters, 0f)
        assertEquals(Priority.PRIORITY_HIGH_ACCURACY, request.priority)
        assertEquals(300_000L, request.intervalMillis)
        assertEquals(300_000L, request.minUpdateIntervalMillis)
        assertFalse(request.isBatched)
        assertEquals(120_000L, request.maxUpdateAgeMillis)
    }
    @Test fun movingEmployeeStillUsesConfiguredInterval() {
        val request = trackingLocationRequest(30, false)
        assertEquals(30_000L, request.intervalMillis)
        assertEquals(0f, request.minUpdateDistanceMeters, 0f)
    }
    @Test fun offSiteHourlyPowerSavingIsPreserved() {
        val request = trackingLocationRequest(3600, true)
        assertEquals(Priority.PRIORITY_BALANCED_POWER_ACCURACY, request.priority)
        assertEquals(3_600_000L, request.intervalMillis)
        assertEquals(25f, request.minUpdateDistanceMeters, 0f)
    }
}
