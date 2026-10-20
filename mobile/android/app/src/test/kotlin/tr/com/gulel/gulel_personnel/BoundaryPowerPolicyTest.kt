package tr.com.gulel.gulel_personnel

import org.junit.Assert.*
import org.junit.Test

class BoundaryPowerPolicyTest{
    @Test fun reducesOnlyAfterFifteenContinuousMinutesOutside(){
        val policy=BoundaryPowerPolicy();policy.configure(39.8993,32.7732,39.90062,32.77422)
        assertFalse(policy.observe(0,39.896,32.7737));assertFalse(policy.observe(899999,39.896,32.7737));assertTrue(policy.observe(900000,39.896,32.7737))
    }
    @Test fun returningInsideImmediatelyRestoresNormalMode(){
        val policy=BoundaryPowerPolicy();policy.configure(39.8993,32.7732,39.90062,32.77422)
        policy.observe(0,39.896,32.7737);assertTrue(policy.observe(900000,39.896,32.7737));assertFalse(policy.observe(900001,39.8999,32.7737));assertFalse(policy.reduced)
    }
    @Test fun briefReturnInsideResetsTheOutsideTimer(){
        val policy=BoundaryPowerPolicy();policy.configure(39.8993,32.7732,39.90062,32.77422)
        policy.observe(0,39.896,32.7737);policy.observe(800000,39.8999,32.7737);assertFalse(policy.observe(900000,39.896,32.7737));assertFalse(policy.observe(1700000,39.896,32.7737))
    }
    @Test fun geofenceEntryImmediatelyLeavesReducedMode(){
        val policy=BoundaryPowerPolicy();policy.configure(39.8993,32.7732,39.90062,32.77422)
        policy.observe(0,39.896,32.7737);assertTrue(policy.observe(900000,39.896,32.7737));policy.onEntry();assertFalse(policy.reduced)
    }
    @Test fun rectangleCornersAreInsideButPointsPastAnEdgeAreOutside(){
        val policy=BoundaryPowerPolicy(outsideDelayMillis=0);policy.configure(39.8993,32.7732,39.90062,32.77422)
        assertFalse(policy.observe(0,39.9006,32.7742));assertFalse(policy.observe(1,39.8999,32.7743));assertTrue(policy.observe(1,39.8999,32.7743))
    }
}
