package tr.com.gulel.gulel_personnel

// Keeps precise tracking near the workplace and switches to an hourly,
// low-power cadence only after a confirmed 15-minute absence.
class BoundaryPowerPolicy(private val outsideDelayMillis:Long=15*60*1000L){
    data class Bounds(val south:Double,val west:Double,val north:Double,val east:Double)
    private var bounds:Bounds?=null
    private var outsideSince:Long?=null
    @Volatile var reduced:Boolean=false;private set

    @Synchronized fun configure(south:Double,west:Double,north:Double,east:Double){
        bounds=if(south in -90.0..90.0&&north in -90.0..90.0&&west in -180.0..180.0&&east in -180.0..180.0&&south<north&&west<east)Bounds(south,west,north,east)else null
        if(bounds==null){outsideSince=null;reduced=false}
    }

    @Synchronized fun observe(now:Long,latitude:Double,longitude:Double):Boolean{
        val boundary=bounds?:return false
        if(latitude in boundary.south..boundary.north&&longitude in boundary.west..boundary.east){outsideSince=null;reduced=false;return false}
        val started=outsideSince
        if(started==null){outsideSince=now;return false}
        if(now-started>=outsideDelayMillis)reduced=true
        return reduced
    }

    @Synchronized fun onEntry(){outsideSince=null;reduced=false}

}
