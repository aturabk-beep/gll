package tr.com.gulel.gulel_personnel

import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel
import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.location.LocationManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import org.json.JSONObject
import java.net.URI
import java.time.LocalDate
import java.time.ZoneId
import java.util.concurrent.Executors

class MainActivity : FlutterActivity(){
    private val permissionFlow=PermissionFlow()
    private var permissionDialog=false
    private val worker=Executors.newSingleThreadExecutor()
    override fun configureFlutterEngine(engine:FlutterEngine){
        super.configureFlutterEngine(engine)
        MethodChannel(engine.dartExecutor.binaryMessenger,"gulel/personnel").setMethodCallHandler{call,result->
            try{when(call.method){
                "status"->{val c=SecureStore(this).read();val p=getSharedPreferences("health",MODE_PRIVATE);val q=QueueStore(this);val ready=c!=null&&TrackingService.permissions(this)&&backgroundGranted()&&notificationGranted()&&getSystemService(LocationManager::class.java).isLocationEnabled&&!p.getBoolean("revoked",false);result.success(mapOf("fine_location" to TrackingService.permissions(this),"background_location" to backgroundGranted(),"notifications" to notificationGranted(),"location_enabled" to getSystemService(LocationManager::class.java).isLocationEnabled,"paired" to (c!=null),"name" to c?.optString("name"),"ready" to ready,"running" to TrackingService.running,"waiting" to TrackingService.waiting,"queue" to q.count(),"dropped" to q.dropped(),"last_fix" to p.getString("last_fix",null),"last_upload" to p.getString("last_upload",null),"diagnostic" to p.getString("diagnostic","")));q.close()}
                "pair"->{val url=(call.argument<String>("url")?:"").trimEnd('/');val code=call.argument<String>("code")?:"";val uri=URI(url);require(uri.scheme=="https"&&uri.host!=null&&uri.rawUserInfo==null&&uri.rawQuery==null&&uri.rawFragment==null&&uri.path.isNullOrEmpty()){ "Geçerli HTTPS adresi gerekli / Valid HTTPS origin required" };require(code.matches(Regex("[0-9]{4}"))){"Kod geçersiz / Invalid code"};require(SecureStore(this).read()==null){"Cihaz zaten eşleşmiş / Already paired"};worker.execute{try{val store=SecureStore(this);val pending=store.read("pairing");val token=if(pending?.optString("url")==url && pending.optString("code_hash")==SecureStore.hash(code))pending.getString("token") else SecureStore.randomHex(32);store.write(JSONObject().put("url",url).put("code_hash",SecureStore.hash(code)).put("token",token),"pairing");val c=JSONObject().put("url",url).put("backend","railway");val response=Api.call(c,"pair_device",JSONObject().put("p_code",code).put("p_token",token));if(response.has("error"))throw Exception(response.getString("error"));c.put("token",token).put("device_id",response.getString("device_id")).put("staff_id",response.getString("staff_id")).put("name",response.getString("name"));SecureStore(this).write(c);getSharedPreferences("health",MODE_PRIVATE).edit().clear().commit();runOnUiThread{result.success(null);beginPermissions()}}catch(e:Exception){runOnUiThread{result.error("pair",e.message,null)}}}}
                "attendance"->{val c=SecureStore(this).read();if(c==null)result.success(null)else worker.execute{try{val date=LocalDate.now(ZoneId.of("Europe/Istanbul")).toString();val response=Api.call(c,"attendance",JSONObject().put("p_token",c.getString("token")).put("date",date));runOnUiThread{result.success(response.toString())}}catch(e:Exception){runOnUiThread{result.error("attendance",e.message,null)}}}}
                "timeClock"->{val c=SecureStore(this).read();val action=call.argument<String>("action")?:"";if(c==null)result.error("time_clock","Cihaz eşleşmemiş / Device not paired",null)else worker.execute{try{require(action=="clock_in"||action=="clock_out");val response=Api.call(c,"time_clock",JSONObject().put("p_token",c.getString("token")).put("action",action));runOnUiThread{result.success(response.toString())}}catch(e:Exception){runOnUiThread{result.error("time_clock",e.message,null)}}}}
                "permissions"->{beginPermissions();result.success(null)}
                "settings"->{if(Build.VERSION.SDK_INT==29&&!backgroundGranted())requestPermissions(arrayOf(Manifest.permission.ACCESS_BACKGROUND_LOCATION),102)else startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,Uri.parse("package:$packageName")));result.success(null)}
                "batterySettings"->{startActivity(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS));result.success(null)}
                "prepareClockIn"->{TrackingService.prepareClockIn(this);result.success(null)}
                "resume"->{autoResume();result.success(null)}
                else->result.notImplemented()
            }}catch(e:Exception){result.error("setup",e.message,null)}
        }
    }
    private fun appSettings(){startActivityForResult(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,Uri.parse("package:$packageName")),900)}
    private fun beginPermissions(){permissionFlow.start();completePermissions()}
    private fun completePermissions(){
        if(permissionDialog)return
        val granted=mutableSetOf<PermissionFlow.Step>()
        if(TrackingService.permissions(this))granted.add(PermissionFlow.Step.LOCATION)
        if(notificationGranted())granted.add(PermissionFlow.Step.NOTIFICATIONS)
        if(backgroundGranted())granted.add(PermissionFlow.Step.BACKGROUND)
        if(getSystemService(LocationManager::class.java).isLocationEnabled)granted.add(PermissionFlow.Step.LOCATION_SERVICE)
        if(permissionFlow.next(granted)==null){autoResume();return}
        val prefs=getSharedPreferences("permission_requests",MODE_PRIVATE)
        if(!TrackingService.permissions(this)){
            if(prefs.getBoolean("location",false)&&!shouldShowRequestPermissionRationale(Manifest.permission.ACCESS_FINE_LOCATION)){appSettings();return}
            prefs.edit().putBoolean("location",true).apply()
            permissionDialog=true;requestPermissions(arrayOf(Manifest.permission.ACCESS_FINE_LOCATION,Manifest.permission.ACCESS_COARSE_LOCATION),100)
        }else if(!notificationGranted()){
            if(Build.VERSION.SDK_INT>=33&&prefs.getBoolean("notification",false)&&!shouldShowRequestPermissionRationale(Manifest.permission.POST_NOTIFICATIONS)){
                startActivityForResult(Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE,packageName),900);return
            }
            prefs.edit().putBoolean("notification",true).apply()
            requestNotifications()
        }else if(!backgroundGranted()){
            if(Build.VERSION.SDK_INT==29){permissionDialog=true;requestPermissions(arrayOf(Manifest.permission.ACCESS_BACKGROUND_LOCATION),102)}else appSettings()
        }else if(!getSystemService(LocationManager::class.java).isLocationEnabled){
            startActivityForResult(Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS),900)
        }else autoResume()
    }
    private fun notificationGranted()=Build.VERSION.SDK_INT<33||checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)==PackageManager.PERMISSION_GRANTED
    private fun backgroundGranted()=Build.VERSION.SDK_INT<29||checkSelfPermission(Manifest.permission.ACCESS_BACKGROUND_LOCATION)==PackageManager.PERMISSION_GRANTED
    private fun requestNotifications(){if(Build.VERSION.SDK_INT>=33&&!notificationGranted()){permissionDialog=true;requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS),101)}else autoResume()}
    private fun autoResume(){if(backgroundGranted()&&notificationGranted())TrackingService.resume(this)}
    override fun onResume(){super.onResume();autoResume()}
    override fun onActivityResult(requestCode:Int,resultCode:Int,data:Intent?){super.onActivityResult(requestCode,resultCode,data);if(requestCode==900&&permissionFlow.active)completePermissions()}
    override fun onRequestPermissionsResult(requestCode:Int,permissions:Array<out String>,grantResults:IntArray){super.onRequestPermissionsResult(requestCode,permissions,grantResults);if(requestCode in 100..102){
        permissionDialog=false
        val granted=when(requestCode){100->TrackingService.permissions(this);101->notificationGranted();else->backgroundGranted()}
        if(!granted)permissionFlow.stop()
        if(permissionFlow.active)completePermissions()else autoResume()
    }else autoResume()}
    override fun onDestroy(){worker.shutdown();super.onDestroy()}
}
