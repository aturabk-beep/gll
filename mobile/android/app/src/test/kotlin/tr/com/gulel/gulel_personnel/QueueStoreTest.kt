package tr.com.gulel.gulel_personnel
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config
import org.json.JSONObject
import org.json.JSONArray
@RunWith(RobolectricTestRunner::class) @Config(sdk=[28])
class QueueStoreTest{
 @Test fun durableIdempotentQueueDeletesOnlyAcknowledged(){val context=RuntimeEnvironment.getApplication();context.deleteDatabase("samples.db");var q=QueueStore(context);q.add(JSONObject().put("id","one").put("latitude",1));q.add(JSONObject().put("id","one").put("latitude",1));q.add(JSONObject().put("id","two"));assertEquals(2,q.count());q.close();q=QueueStore(context);assertEquals(2,q.count());q.acknowledge(JSONArray().put("one"));assertEquals(1,q.count());assertEquals("two",q.batch().getJSONObject(0).getString("id"));q.close()}
 @Test fun expiredQueueReportsLoss(){val context=RuntimeEnvironment.getApplication();context.deleteDatabase("samples.db");val q=QueueStore(context);q.add(JSONObject().put("id","old"));q.writableDatabase.execSQL("UPDATE samples SET created=0");q.add(JSONObject().put("id","new"));assertEquals(1,q.count());assertEquals(1L,q.dropped());q.close()}
}
