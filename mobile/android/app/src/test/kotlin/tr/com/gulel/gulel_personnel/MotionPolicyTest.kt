package tr.com.gulel.gulel_personnel
import org.junit.Assert.*
import org.junit.Test
class MotionPolicyTest {
 @Test fun stillnessRequiresTimeAndGoodAccuracy(){val p=MotionPolicy(0);assertFalse(p.update(10000,10f,3f,10f,null,null,180));assertTrue(p.update(181000,10f,3f,10f,null,null,180));assertFalse(p.update(182000,10f,30f,10f,null,null,180))}
 @Test fun poorAccuracyCannotProveStillness(){val p=MotionPolicy(0);assertFalse(p.update(500000,200f,0f,200f,null,null,180))}
 @Test fun speedUncertaintyAndSensorWake(){val p=MotionPolicy(0);assertTrue(p.update(181000,10f,0f,10f,1f,2f,180));p.sensorMovement(182000);assertFalse(p.stationary);assertFalse(p.update(190000,10f,0f,10f,2f,.2f,180))}
}
