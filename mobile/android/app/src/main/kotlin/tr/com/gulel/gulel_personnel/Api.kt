package tr.com.gulel.gulel_personnel

import org.json.JSONObject
import java.net.URL
import javax.net.ssl.HttpsURLConnection

class ApiException(val status:Int):Exception("Sunucu / Server HTTP $status")
object Api {
    fun call(credentials:JSONObject,rpc:String,body:JSONObject):JSONObject{
        val endpoint=if(credentials.optString("backend")=="railway") "/api/device/"+when(rpc){"pair_device"->"pair";"attendance"->"attendance";"time_clock"->"time-clock";else->"ingest"} else "/rest/v1/rpc/"+rpc
        val url=URL(credentials.getString("url")+endpoint)
        require(url.protocol=="https" && url.userInfo==null && url.host.isNotBlank())
        val connection=url.openConnection() as HttpsURLConnection
        try{
            connection.requestMethod="POST";connection.connectTimeout=15000;connection.readTimeout=20000;connection.instanceFollowRedirects=false;connection.doOutput=true
            if(credentials.optString("backend")!="railway")connection.setRequestProperty("apikey",credentials.optString("key"));connection.setRequestProperty("Content-Type","application/json")
            connection.outputStream.use{it.write(body.toString().toByteArray(Charsets.UTF_8))}
            if(connection.responseCode !in 200..299)throw ApiException(connection.responseCode)
            return JSONObject(connection.inputStream.bufferedReader().use{it.readText()})
        }finally{connection.disconnect()}
    }
}
