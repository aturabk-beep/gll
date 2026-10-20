package tr.com.gulel.gulel_personnel

import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import android.content.ContentValues
import org.json.JSONArray
import org.json.JSONObject

class QueueStore(context:Context):SQLiteOpenHelper(context,"samples.db",null,1){
    override fun onCreate(db:SQLiteDatabase){db.execSQL("CREATE TABLE samples(id TEXT PRIMARY KEY, created INTEGER NOT NULL, body TEXT NOT NULL)");db.execSQL("CREATE TABLE counters(name TEXT PRIMARY KEY,value INTEGER NOT NULL)");db.execSQL("INSERT INTO counters VALUES('dropped',0)")}
    override fun onUpgrade(db:SQLiteDatabase,old:Int,new:Int){}
    @Synchronized fun add(point:JSONObject){val db=writableDatabase;db.beginTransaction();try{
        val values=ContentValues().apply{put("id",point.getString("id"));put("created",System.currentTimeMillis());put("body",point.toString())}
        db.insertWithOnConflict("samples",null,values,SQLiteDatabase.CONFLICT_IGNORE)
        val expired=db.delete("samples","created < ?",arrayOf((System.currentTimeMillis()-7*86400000L).toString()))
        val overflow=(count()-65000).coerceAtLeast(0)
        if(overflow>0)db.execSQL("DELETE FROM samples WHERE id IN (SELECT id FROM samples ORDER BY created LIMIT ?)",arrayOf(overflow))
        db.execSQL("UPDATE counters SET value=value+? WHERE name='dropped'",arrayOf(expired+overflow));db.setTransactionSuccessful()
    }finally{db.endTransaction()}}
    @Synchronized fun batch():JSONArray{val a=JSONArray();readableDatabase.rawQuery("SELECT body FROM samples ORDER BY created,id LIMIT 200",null).use{while(it.moveToNext())a.put(JSONObject(it.getString(0)))};return a}
    @Synchronized fun acknowledge(ids:JSONArray){val db=writableDatabase;db.beginTransaction();try{for(i in 0 until ids.length())db.delete("samples","id=?",arrayOf(ids.getString(i)));db.setTransactionSuccessful()}finally{db.endTransaction()}}
    @Synchronized fun count():Int=readableDatabase.rawQuery("SELECT count(*) FROM samples",null).use{it.moveToFirst();it.getInt(0)}
    @Synchronized fun dropped():Long=readableDatabase.rawQuery("SELECT value FROM counters WHERE name='dropped'",null).use{it.moveToFirst();it.getLong(0)}
}
