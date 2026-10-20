package tr.com.gulel.gulel_personnel

import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.Priority

internal fun trackingLocationRequest(seconds: Int, outsidePowerSaving: Boolean): LocationRequest {
    val intervalMillis = seconds * 1000L
    // A stationary employee still needs fresh fixes. Limit frequency, not
    // displacement. Balanced accuracy is reserved for the off-site profile;
    // the panel only displays reliable fixes with accuracy <= 35 metres.
    return LocationRequest.Builder(
        if (outsidePowerSaving) Priority.PRIORITY_BALANCED_POWER_ACCURACY else Priority.PRIORITY_HIGH_ACCURACY,
        intervalMillis
    ).setMinUpdateIntervalMillis(intervalMillis)
        .setMaxUpdateDelayMillis(intervalMillis)
        .setMaxUpdateAgeMillis(120_000L)
        .setMinUpdateDistanceMeters(if (outsidePowerSaving) 25f else 0f)
        .setWaitForAccurateLocation(false)
        .build()
}
