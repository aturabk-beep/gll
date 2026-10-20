package tr.com.gulel.gulel_personnel

import org.junit.Assert.*
import org.junit.Test
import tr.com.gulel.gulel_personnel.PermissionFlow.Step

class PermissionFlowTest {
    @Test fun advancesOnlyAfterGrantAndStopsWhenComplete() {
        val flow=PermissionFlow();flow.start()
        val granted=mutableSetOf<Step>()
        for(step in Step.entries){assertEquals(step,flow.next(granted));granted.add(step)}
        assertNull(flow.next(granted));assertFalse(flow.active)
    }
    @Test fun returningWithoutGrantStopsUntilExplicitRetry() {
        val flow=PermissionFlow();flow.start()
        val granted=setOf(Step.LOCATION,Step.NOTIFICATIONS)
        assertEquals(Step.BACKGROUND,flow.next(granted))
        assertNull(flow.next(granted));assertFalse(flow.active)
        assertNull(flow.next(granted))
        flow.start();assertEquals(Step.BACKGROUND,flow.next(granted))
    }
    @Test fun skipsExistingPermissionsAndDoesNotRestartAfterDenial() {
        val flow=PermissionFlow();flow.start()
        assertEquals(Step.NOTIFICATIONS,flow.next(setOf(Step.LOCATION)))
        flow.stop();assertNull(flow.next(Step.entries.toSet()))
        flow.start();assertNull(flow.next(Step.entries.toSet()))
    }
}
