package tr.com.gulel.gulel_personnel

import android.Manifest
import android.app.*
import android.content.*
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.hardware.*
import android.location.Location
import android.location.LocationManager
import android.net.*
import android.os.*
import com.google.android.gms.location.*
import org.json.JSONObject
import java.time.Instant
import java.util.UUID
import java.util.concurrent.Executors
import kotlin.random.Random

class TrackingService:Service(){
    private lateinit var fused:FusedLocationProviderClient
    private lateinit var geofencing:GeofencingClient
    private lateinit var queue:QueueStore
    private lateinit var credentials:JSONObject
    private val io=Executors.newSingleThreadExecutor()
    private val main=Handler(Looper.getMainLooper())
    private val motion=MotionPolicy(SystemClock.elapsedRealtime())
    private val boundaryPower=BoundaryPowerPolicy()
    private var anchor:Location?=null
    private var lastNanos=0L
    private var heartbeatSeconds=600
    private var interval=30;private var balanced=false
    private var geofenceSignature=""
    private var movingSeconds=30;private var stationarySeconds=300;private var afterSeconds=180
    @Volatile private var uploading=false
    @Volatile private var nextUpload=0L
    private var failures=0
    private lateinit var sensors:SensorManager
    private var trigger:Sensor?=null
    private val triggerListener=object:TriggerEventListener(){override fun onTrigger(e:TriggerEvent?){motion.sensorMovement(SystemClock.elapsedRealtime());applyInterval(if(boundaryPower.reduced)3600 else movingSeconds,boundaryPower.reduced);main.postDelayed({armMotion()},1000)}}
    private val prefs by lazy{getSharedPreferences("health",MODE_PRIVATE)}
    private val callback=object:LocationCallback(){override fun onLocationResult(result:LocationResult){for(location in result.locations)accept(location)}}
    private val network=object:ConnectivityManager.NetworkCallback(){override fun onAvailable(n:Network){main.post{if(!boundaryPower.reduced)nextUpload=0;upload()}}}
    private val heartbeat=object:Runnable{override fun run(){upload();main.postDelayed(this,(if(boundaryPower.reduced)3600 else heartbeatSeconds)*1000L)}}
    override fun onCreate(){
        super.onCreate();running=true
        val stored=try{SecureStore(this).read()}catch(_:Exception){null}
        if(stored==null||!permissions(this)||prefs.getBoolean("revoked",false)){running=false;stopSelf();return};credentials=stored
        val nm=getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(NotificationChannel("personnel-location","Gülel Personnel",NotificationManager.IMPORTANCE_LOW))
        val launch=PendingIntent.getActivity(this,0,Intent(this,MainActivity::class.java),PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        val notification=Notification.Builder(this,"personnel-location").setSmallIcon(android.R.drawable.ic_menu_mylocation).setContentTitle("Gülel Personnel").setContentText("Vardiya başladı").setContentIntent(launch).setOngoing(true).setCategory(Notification.CATEGORY_SERVICE).build()
        try{if(Build.VERSION.SDK_INT>=29)startForeground(71,notification,ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION)else startForeground(71,notification)}catch(_:Exception){running=false;prefs.edit().putString("diagnostic","Ön plan servisi başlatılamadı / Foreground start denied").apply();stopSelf();return}
        queue=QueueStore(this);fused=LocationServices.getFusedLocationProviderClient(this);geofencing=LocationServices.getGeofencingClient(this)
        movingSeconds=prefs.getInt("moving_seconds",30);stationarySeconds=prefs.getInt("stationary_seconds",300);afterSeconds=prefs.getInt("stationary_after",180)
        heartbeatSeconds=prefs.getInt("heartbeat_seconds",600).coerceIn(30,900)
        val south=prefs.getString("boundary_south",null)?.toDoubleOrNull();val west=prefs.getString("boundary_west",null)?.toDoubleOrNull();val north=prefs.getString("boundary_north",null)?.toDoubleOrNull();val east=prefs.getString("boundary_east",null)?.toDoubleOrNull()
        val boundaryLat=prefs.getString("boundary_lat",null)?.toDoubleOrNull();val boundaryLon=prefs.getString("boundary_lon",null)?.toDoubleOrNull();val boundaryRadius=prefs.getString("boundary_radius",null)?.toDoubleOrNull()
        if(south!=null&&west!=null&&north!=null&&east!=null)boundaryPower.configure(south,west,north,east)
        if(boundaryLat!=null&&boundaryLon!=null&&boundaryRadius!=null)registerGeofence(boundaryLat,boundaryLon,boundaryRadius)
        interval=0;applyInterval(movingSeconds,false)
        sensors=getSystemService(SENSOR_SERVICE) as SensorManager;trigger=sensors.getDefaultSensor(Sensor.TYPE_SIGNIFICANT_MOTION);armMotion()
        getSystemService(ConnectivityManager::class.java).registerDefaultNetworkCallback(network)
        main.post(heartbeat)
    }
    private fun armMotion(){trigger?.let{sensors.requestTriggerSensor(triggerListener,it)}}
    private fun applyInterval(seconds:Int,lowPower:Boolean=boundaryPower.reduced){
        if(interval==seconds&&balanced==lowPower)return;interval=seconds;balanced=lowPower
        if(!::fused.isInitialized)return
        try{fused.removeLocationUpdates(callback);val request=trackingLocationRequest(seconds,lowPower);fused.requestLocationUpdates(request,callback,Looper.getMainLooper()).addOnFailureListener{prefs.edit().putString("diagnostic","Konum isteği başarısız / Location request failed").apply()}}catch(_:SecurityException){prefs.edit().putString("diagnostic","Konum izni kaldırıldı / Permission removed").apply();stopSelf()}
    }
    private fun accept(location:Location){
        if(location.elapsedRealtimeNanos<=lastNanos || SystemClock.elapsedRealtimeNanos()-location.elapsedRealtimeNanos>120_000_000_000L || !location.hasAccuracy())return
        lastNanos=location.elapsedRealtimeNanos
        val previous=anchor?:location
        val stationary=motion.update(SystemClock.elapsedRealtime(),location.accuracy,location.distanceTo(previous),previous.accuracy,if(location.hasSpeed())location.speed else null,if(location.hasSpeedAccuracy())location.speedAccuracyMetersPerSecond else null,afterSeconds)
        if(anchor==null||!stationary&&location.distanceTo(previous)>maxOf(12f,location.accuracy+previous.accuracy))anchor=location
        val wasReduced=boundaryPower.reduced;val reduced=boundaryPower.observe(SystemClock.elapsedRealtime(),location.latitude,location.longitude)
        applyInterval(if(reduced)3600 else if(stationary)stationarySeconds else movingSeconds,reduced)
        if(reduced&&!wasReduced){nextUpload=0;main.removeCallbacks(heartbeat);main.postDelayed(heartbeat,3600000L)}
        else if(!reduced&&wasReduced){nextUpload=0;main.removeCallbacks(heartbeat);main.post(heartbeat)}
        val battery=getSystemService(BatteryManager::class.java).getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY)
        val p=JSONObject().put("id",UUID.randomUUID().toString()).put("staff_id",credentials.getString("staff_id")).put("device_id",credentials.getString("device_id")).put("measured_at",Instant.ofEpochMilli(location.time).toString()).put("latitude",location.latitude).put("longitude",location.longitude).put("accuracy",location.accuracy.toDouble()).put("speed",if(location.hasSpeed())location.speed.toDouble() else JSONObject.NULL).put("heading",if(location.hasBearing())location.bearing.toDouble() else JSONObject.NULL).put("battery",if(battery in 0..100)battery else JSONObject.NULL).put("motion",if(stationary)"stationary" else if(location.accuracy<=35)"moving" else "unknown")
        // Commit to SQLite before attempting network delivery.
        val persistLock=getSystemService(PowerManager::class.java).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK,"gulel:persist").apply{acquire(10000)}
        io.execute{try{queue.add(p);prefs.edit().putString("last_fix",p.getString("measured_at")).apply();main.post{upload()}}catch(_:Exception){prefs.edit().putString("diagnostic","Kuyruk yazılamadı / Queue write failed").apply()}finally{if(persistLock.isHeld)persistLock.release()}}
    }
    private fun upload(){
        if(uploading || SystemClock.elapsedRealtime()<nextUpload || !::queue.isInitialized)return
        val cm=getSystemService(ConnectivityManager::class.java);val caps=cm.getNetworkCapabilities(cm.activeNetwork)
        if(caps?.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)!=true){waiting=true;return}
        uploading=true
        val uploadLock=getSystemService(PowerManager::class.java).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK,"gulel:upload").apply{acquire(45000)}
        io.execute{
            try{
                val status=JSONObject().put("app_version","0.2.23+25").put("queue_count",queue.count()).put("dropped_count",queue.dropped()).put("sent_at_ms",System.currentTimeMillis()).put("location_enabled",getSystemService(LocationManager::class.java).isLocationEnabled)
                val response=Api.call(credentials,"ingest",JSONObject().put("p_token",credentials.getString("token")).put("p_points",queue.batch()).put("p_status",status))
                queue.acknowledge(response.getJSONArray("ack_ids"));val c=response.getJSONObject("config")
                val boundary=c.optJSONObject("farm_boundary")
                if(boundary!=null){val south=boundary.optDouble("south",Double.NaN);val west=boundary.optDouble("west",Double.NaN);val north=boundary.optDouble("north",Double.NaN);val east=boundary.optDouble("east",Double.NaN);val lat=boundary.optDouble("centerLat",Double.NaN);val lon=boundary.optDouble("centerLon",Double.NaN);val radius=boundary.optDouble("radius_meters",Double.NaN);if(south.isFinite()&&west.isFinite()&&north.isFinite()&&east.isFinite()&&lat.isFinite()&&lon.isFinite()&&radius.isFinite()){boundaryPower.configure(south,west,north,east);registerGeofence(lat,lon,radius);prefs.edit().putString("boundary_south",south.toString()).putString("boundary_west",west.toString()).putString("boundary_north",north.toString()).putString("boundary_east",east.toString()).putString("boundary_lat",lat.toString()).putString("boundary_lon",lon.toString()).putString("boundary_radius",radius.toString()).apply()}}
                val hb=c.optInt("heartbeat_seconds",600)
                if(hb in 30..900)main.post{
                    if(heartbeatSeconds!=hb){
                        heartbeatSeconds=hb;prefs.edit().putInt("heartbeat_seconds",hb).apply()
                        main.removeCallbacks(heartbeat);main.postDelayed(heartbeat,(if(boundaryPower.reduced)3600 else hb)*1000L)
                    }
                }
                val ms=c.getInt("moving_seconds");val ss=c.getInt("stationary_seconds");val af=c.getInt("stationary_after")
                if(ms in 10..60 && ss in 30..300 && af in 120..900){movingSeconds=ms;stationarySeconds=ss;afterSeconds=af;prefs.edit().putInt("moving_seconds",ms).putInt("stationary_seconds",ss).putInt("stationary_after",af).apply();main.post{applyInterval(if(boundaryPower.reduced)3600 else if(motion.stationary)ss else ms,boundaryPower.reduced)}}
                failures=0;waiting=false;nextUpload=SystemClock.elapsedRealtime()+(if(queue.count()>0)1000L else uploadCadenceMillis())
                prefs.edit().putString("last_upload",Instant.now().toString()).putString("diagnostic","").apply()
                if(queue.count()>0&&!boundaryPower.reduced)main.postDelayed({upload()},1100)
            }catch(e:Exception){waiting=true;failures=(failures+1).coerceAtMost(7);nextUpload=SystemClock.elapsedRealtime()+(if(boundaryPower.reduced)3600000L else minOf(300000L,5000L*(1L shl failures))+Random.nextLong(1000,5000));prefs.edit().putString("diagnostic",if(e is ApiException)"HTTP ${e.status}" else "Bağlantı bekleniyor / Waiting for network").apply();if(e is ApiException && e.status in listOf(401,403)){prefs.edit().putBoolean("revoked",true).apply();main.post{stopSelf()}}}
            finally{uploading=false;if(uploadLock.isHeld)uploadLock.release()}
        }
    }
    private fun uploadCadenceMillis()=when{boundaryPower.reduced->3600000L;motion.stationary->300000L;else->60000L}
    private fun geofenceIntent()=PendingIntent.getBroadcast(this,72,Intent(this,FarmGeofenceReceiver::class.java),PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE)
    private fun registerGeofence(latitude:Double,longitude:Double,radius:Double){
        if(!::geofencing.isInitialized||!permissions(this))return
        val signature="$latitude,$longitude,$radius";if(signature==geofenceSignature)return
        val fence=Geofence.Builder().setRequestId("farm-boundary").setCircularRegion(latitude,longitude,radius.toFloat()).setTransitionTypes(Geofence.GEOFENCE_TRANSITION_ENTER).setExpirationDuration(Geofence.NEVER_EXPIRE).build()
        val request=GeofencingRequest.Builder().setInitialTrigger(GeofencingRequest.INITIAL_TRIGGER_ENTER).addGeofence(fence).build()
        try{geofencing.removeGeofences(geofenceIntent()).addOnCompleteListener{try{geofencing.addGeofences(request,geofenceIntent()).addOnSuccessListener{geofenceSignature=signature}}catch(_:SecurityException){}}}catch(_:SecurityException){}
    }
    private fun requestFreshLocation(){
        if(!::fused.isInitialized)return
        try{val request=CurrentLocationRequest.Builder().setPriority(Priority.PRIORITY_HIGH_ACCURACY).setMaxUpdateAgeMillis(0).setDurationMillis(15000).build();fused.getCurrentLocation(request,null).addOnSuccessListener{if(it!=null)accept(it)}}catch(_:SecurityException){}
    }
    override fun onStartCommand(intent:Intent?,flags:Int,startId:Int):Int{
        when(intent?.action){ACTION_FARM_ENTRY->{boundaryPower.onEntry();motion.sensorMovement(SystemClock.elapsedRealtime());applyInterval(movingSeconds,false);nextUpload=0;requestFreshLocation()};ACTION_PREPARE_CLOCK_IN->{nextUpload=0;requestFreshLocation()}}
        return START_STICKY
    }
    override fun onBind(intent:Intent?)=null
    override fun onDestroy(){running=false;main.removeCallbacksAndMessages(null);if(::fused.isInitialized)fused.removeLocationUpdates(callback);if(::sensors.isInitialized)sensors.cancelTriggerSensor(triggerListener,trigger);try{getSystemService(ConnectivityManager::class.java).unregisterNetworkCallback(network)}catch(_:Exception){};io.shutdown();super.onDestroy()}
    companion object{
        @Volatile var running=false
        @Volatile var waiting=true
        private const val ACTION_FARM_ENTRY="tr.com.gulel.gulel_personnel.FARM_ENTRY"
        private const val ACTION_PREPARE_CLOCK_IN="tr.com.gulel.gulel_personnel.PREPARE_CLOCK_IN"
        fun permissions(c:Context)=c.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)==PackageManager.PERMISSION_GRANTED
        fun resume(c:Context){if(!permissions(c)||c.getSharedPreferences("health",Context.MODE_PRIVATE).getBoolean("revoked",false))return;try{if(SecureStore(c).read()!=null)c.startForegroundService(Intent(c,TrackingService::class.java))}catch(_:Exception){c.getSharedPreferences("health",Context.MODE_PRIVATE).edit().putString("diagnostic","Uygulamayı açın / Open app to resume").apply()}}
        fun farmEntry(c:Context){if(permissions(c)&&!c.getSharedPreferences("health",Context.MODE_PRIVATE).getBoolean("revoked",false))try{c.startForegroundService(Intent(c,TrackingService::class.java).setAction(ACTION_FARM_ENTRY))}catch(_:Exception){}}
        fun prepareClockIn(c:Context){if(permissions(c)&&!c.getSharedPreferences("health",Context.MODE_PRIVATE).getBoolean("revoked",false))try{c.startForegroundService(Intent(c,TrackingService::class.java).setAction(ACTION_PREPARE_CLOCK_IN))}catch(_:Exception){}}
    }
}
