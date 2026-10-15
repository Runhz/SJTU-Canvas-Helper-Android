package com.canvas.sjtu.mobile

import android.Manifest
import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.Worker
import androidx.work.WorkerParameters
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.TimeUnit

class ReminderEngine(private val context:Context){
    private val prefs=context.getSharedPreferences("canvas-reminders",Context.MODE_PRIVATE)
    private val alarm=context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    private fun identity(account:String,assignment:String,due:Long,offset:Long)="${accountHash(account)}:$assignment:$due:$offset"
    private fun intent(key:String,account:String,assignment:String,due:Long,offset:Long)=Intent(context,ReminderReceiver::class.java).setAction(key).putExtra("key",key).putExtra("account",account).putExtra("assignment",assignment).putExtra("due",due).putExtra("offset",offset)
    fun clear(account:String){
        val keys=JSONArray(prefs.getString("scheduled:${accountHash(account)}","[]"))
        for(i in 0 until keys.length()){val key=keys.getString(i);val pi=PendingIntent.getBroadcast(context,0,Intent(context,ReminderReceiver::class.java).setAction(key),PendingIntent.FLAG_NO_CREATE or PendingIntent.FLAG_IMMUTABLE);if(pi!=null){alarm.cancel(pi);pi.cancel()};(context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).cancel(key.hashCode())}
        prefs.edit().remove("scheduled:${accountHash(account)}").remove("snapshot:${accountHash(account)}").apply()
    }
    @Synchronized fun replace(data:JSONObject){
        val account=data.getString("accountId");clear(account)
        prefs.edit().putString("snapshot:${accountHash(account)}",data.toString()).apply()
        val settings=data.getJSONObject("settings");if(!settings.optBoolean("enabled",true))return
        val assignments=data.getJSONArray("assignments");val now=System.currentTimeMillis();val offsets=settings.optJSONArray("offsets")?:JSONArray("[86400000,7200000,1800000]")
        val keys=JSONArray()
        for(i in 0 until assignments.length()){
            val assignment=assignments.getJSONObject(i);if(assignment.optString("submission")!="unsubmitted"||!inScope(data,assignment))continue
            val due=assignment.optLong("dueAt",0);if(due<=0||due>now+366L*24*3600*1000)continue
            val candidates=mutableListOf<Long>();for(j in 0 until offsets.length())candidates.add(offsets.getLong(j))
            if(settings.optBoolean("overdue",true))candidates.add(0)
            // If a threshold was missed while offline, only issue the most urgent applicable reminder.
            val missed=candidates.filter{due-it<=now}.minOrNull()
            for(offset in candidates.distinct()){
                val key=identity(account,assignment.getString("id"),due,offset)
                if(prefs.getBoolean("sent:$key",false))continue
                if(due-offset<=now&&offset!=missed)continue
                val pending=PendingIntent.getBroadcast(context,0,intent(key,account,assignment.getString("id"),due,offset),PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
                alarm.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP,maxOf(now+2000,due-offset),pending);keys.put(key)
            }
        }
        prefs.edit().putString("scheduled:${accountHash(account)}",keys.toString()).apply()
        androidx.work.WorkManager.getInstance(context).enqueueUniquePeriodicWork("canvas-assignment-sync",ExistingPeriodicWorkPolicy.KEEP,PeriodicWorkRequestBuilder<AssignmentSyncWorker>(15,TimeUnit.MINUTES).build())
    }
    fun snapshot(account:String):JSONObject?=prefs.getString("snapshot:${accountHash(account)}",null)?.let{JSONObject(it)}
    private fun inScope(data:JSONObject,item:JSONObject):Boolean{
        val ignored=data.optJSONArray("ignoredIds")?:JSONArray();for(i in 0 until ignored.length())if(ignored.optString(i)==item.optString("id"))return false
        val courses=data.optJSONArray("courseIds")?:return false
        for(i in 0 until courses.length())if(courses.optString(i)==item.optString("courseId"))return true
        return false
    }
    fun notifyReminder(intent:Intent){
        val account=intent.getStringExtra("account")?:return
        if(SecureStore(context).settings().optString("currentId")!=account)return
        val data=snapshot(account)?:return
        if(!data.getJSONObject("settings").optBoolean("enabled",true))return
        val items=data.getJSONArray("assignments");val aid=intent.getStringExtra("assignment");var item:JSONObject?=null
        for(i in 0 until items.length()){val a=items.getJSONObject(i);if(a.optString("id")==aid)item=a}
        val assignment=item?:return
        if(assignment.optString("submission")!="unsubmitted"||!inScope(data,assignment)||assignment.optLong("dueAt")!=intent.getLongExtra("due",-1))return
        val key=intent.getStringExtra("key")?:return;if(prefs.getBoolean("sent:$key",false))return
        if(Build.VERSION.SDK_INT>=33&&context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED)return
        val manager=context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.createNotificationChannel(NotificationChannel("assignments","作业截止提醒",NotificationManager.IMPORTANCE_HIGH))
        val main=context.packageManager.getLaunchIntentForPackage(context.packageName)!!.putExtra("assignmentId",aid)
        val click=PendingIntent.getActivity(context,key.hashCode(),main,PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val due=assignment.getLong("dueAt");val overdue=System.currentTimeMillis()>=due
        val content="${assignment.optString("title")} · 根据最近同步尚未提交。请打开应用核对最新状态。"
        manager.notify(key.hashCode(),NotificationCompat.Builder(context,"assignments").setSmallIcon(android.R.drawable.ic_dialog_info).setContentTitle(if(overdue)"作业已截止，请核对提交情况" else "作业即将截止").setContentText(content).setStyle(NotificationCompat.BigTextStyle().bigText(content)).setContentIntent(click).setAutoCancel(true).build())
        prefs.edit().putBoolean("sent:$key",true).apply()
    }
}
class ReminderReceiver:BroadcastReceiver(){override fun onReceive(context:Context,intent:Intent){try{ReminderEngine(context).notifyReminder(intent)}catch(_:Exception){/* Never expose credentials in system logs. */}}}
class BootReceiver:BroadcastReceiver(){override fun onReceive(context:Context,intent:Intent){try{val account=SecureStore(context).settings().optString("currentId");ReminderEngine(context).snapshot(account)?.let{ReminderEngine(context).replace(it)};CalendarReminders(context).snapshot(account)?.let{CalendarReminders(context).replace(it)}}catch(_:Exception){}}}
class AssignmentSyncWorker(context:Context,params:WorkerParameters):Worker(context,params){
    private fun get(path:String,token:String):String {
        val connection=URL("https://oc.sjtu.edu.cn/api/v1/$path").openConnection() as HttpURLConnection
        try{connection.connectTimeout=15000;connection.readTimeout=20000;connection.instanceFollowRedirects=false;connection.setRequestProperty("Authorization","Bearer $token");if(connection.responseCode!=200)throw java.io.IOException("Canvas sync unavailable");return connection.inputStream.bufferedReader(Charsets.UTF_8).use{it.readText()}}finally{connection.disconnect()}
    }
    private fun pages(path:String,token:String):JSONArray{val all=JSONArray();var page=1;while(page<=100){val list=JSONArray(get("$path${if(path.contains('?'))'&' else '?'}per_page=100&page=$page",token));if(list.length()==0)break;for(i in 0 until list.length())all.put(list.getJSONObject(i));page++};return all}
    override fun doWork():Result { return try{
        val account=SecureStore(applicationContext).activeAccount()?:return Result.success();val id=account.getString("accountId");val engine=ReminderEngine(applicationContext);val snapshot=engine.snapshot(id)?:return Result.success()
        val token=account.getString("token");val courses=snapshot.optJSONArray("courseIds")?:return Result.success();val assignments=JSONArray()
        for(i in 0 until courses.length()){
            val cid=courses.getString(i).toLongOrNull()?:continue;val list=pages("courses/$cid/assignments?include[]=submission",token)
            for(j in 0 until list.length()){
                val a=list.getJSONObject(j);val submission=a.optJSONObject("submission");val submitted=!submission?.optString("submitted_at","").isNullOrBlank() && submission?.optString("submitted_at")!="null"
                val due=a.optString("due_at");val date=try{java.time.Instant.parse(due).toEpochMilli()}catch(_:Exception){0L}
                assignments.put(JSONObject().put("id","$cid:${a.getLong("id")}").put("courseId",cid.toString()).put("title",a.optString("name")).put("dueAt",date).put("submission",if(submitted)"submitted" else if(submission==null)"unknown" else "unsubmitted"))
            }
        }
        // A foreground ignore/term change may happen while the worker is fetching.
        // Re-read preferences and active identity instead of restoring a stale snapshot.
        if(SecureStore(applicationContext).settings().optString("currentId")!=id)return Result.success()
        val latest=engine.snapshot(id)?:return Result.success()
        latest.put("assignments",assignments).put("syncedAt",System.currentTimeMillis());engine.replace(latest);Result.success()
    }catch(_:Exception){Result.retry()} }
}
