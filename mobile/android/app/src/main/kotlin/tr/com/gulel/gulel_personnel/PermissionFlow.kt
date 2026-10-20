package tr.com.gulel.gulel_personnel

// One attempt per missing step; returning without granting never opens a loop.
class PermissionFlow {
    enum class Step { LOCATION, NOTIFICATIONS, BACKGROUND, LOCATION_SERVICE }
    private val attempted = mutableSetOf<Step>()
    var active = false
        private set
    fun start() { attempted.clear(); active = true }
    fun stop() { active = false }
    fun next(granted: Set<Step>): Step? {
        if (!active) return null
        val step = Step.entries.firstOrNull { it !in granted }
        if (step == null || !attempted.add(step)) { stop(); return null }
        return step
    }
}
