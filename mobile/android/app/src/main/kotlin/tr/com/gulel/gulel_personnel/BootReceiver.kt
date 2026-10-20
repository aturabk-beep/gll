package tr.com.gulel.gulel_personnel
import android.Manifest
import android.content.*
import android.content.pm.PackageManager
import android.os.Build

class BootReceiver:BroadcastReceiver(){override fun onReceive(context:Context,intent:Intent){
    if(intent.action !in listOf(Intent.ACTION_BOOT_COMPLETED,Intent.ACTION_MY_PACKAGE_REPLACED))return
    if(Build.VERSION.SDK_INT>=29&&context.checkSelfPermission(Manifest.permission.ACCESS_BACKGROUND_LOCATION)!=PackageManager.PERMISSION_GRANTED)return
    TrackingService.resume(context)
}}
