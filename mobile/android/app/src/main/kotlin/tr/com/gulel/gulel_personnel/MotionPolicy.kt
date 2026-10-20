package tr.com.gulel.gulel_personnel

// Pure policy: movement must exceed uncertainty; poor fixes never prove stillness.
class MotionPolicy(private var lastMovement:Long){
    var stationary=false;private set
    fun update(now:Long,accuracy:Float,distance:Float,previousAccuracy:Float,speed:Float?,speedAccuracy:Float?,afterSeconds:Int):Boolean{
        val reliable=accuracy<=35f && previousAccuracy<=35f
        val moved=reliable && (distance>maxOf(12f,accuracy+previousAccuracy) || (speed!=null && speedAccuracy!=null && speed-speedAccuracy>0.7f))
        if(moved){lastMovement=now;stationary=false}
        else if(reliable && now-lastMovement>=afterSeconds*1000L)stationary=true
        else if(!reliable){lastMovement=now;stationary=false}
        return stationary
    }
    fun sensorMovement(now:Long){lastMovement=now;stationary=false}
}
