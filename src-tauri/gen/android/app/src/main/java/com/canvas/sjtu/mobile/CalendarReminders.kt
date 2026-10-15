package com.canvas.sjtu.mobile

import android.app.*
import android.content.*
import android.os.Build
import androidx.core.app.NotificationCompat
import org.json.JSONArray
import org.json.JSONObject

class CalendarReminders(private val context:Context) {
    private val prefs=context.getSharedPreferences("calendar-reminders",Context.MODE_PRIVATE)
    private val alarm=context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    fun clear(account:String) {
        val hash=accountHash(account);val keys=JSONArray(prefs.getString("keys:$hash","[]"))
        for(i in 0 until keys.length()){val key=keys.getString(i);PendingIntent.getBroadcast(context,0,Intent(context,CalendarReminderReceiver::class.java).setAction(key),PendingIntent.FLAG_NO_CREATE or PendingIntent.FLAG_IMMUTABLE)?.let{alarm.cancel(it);it.cancel()};(context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).cancel(key.hashCode())}
        prefs.edit().remove("keys:$hash").remove("data:$hash").apply()
    }
    fun snapshot(account:String)=prefs.getString("data:${accountHash(account)}",null)?.let{JSONObject(it)}
    @Synchronized fun replace(data:JSONObject) {
        val account=data.getString("accountId");clear(account);val hash=accountHash(account)
        prefs.edit().putString("data:$hash",data.toString()).apply();if(!data.optBoolean("enabled"))return
        val events=data.optJSONArray("events")?:JSONArray();val keys=JSONArray();val now=System.currentTimeMillis()
        for(i in 0 until events.length()){
            val event=events.getJSONObject(i);val start=event.optLong("startAt");if(event.optBoolean("allDay")||start<=now||start>now+8L*86400000)continue
            val key="calendar:$hash:${event.optString("id")}:$start";if(prefs.getBoolean("sent:$key",false))continue
            val intent=Intent(context,CalendarReminderReceiver::class.java).setAction(key).putExtra("account",account).putExtra("event",event.toString())
            val pending=PendingIntent.getBroadcast(context,0,intent,PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
            alarm.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP,maxOf(now+2000,start-15*60000),pending);keys.put(key)
        }
        prefs.edit().putString("keys:$hash",keys.toString()).apply()
    }
    fun notify(intent:Intent){
        val account=intent.getStringExtra("account")?:return;if(SecureStore(context).settings().optString("currentId")!=account)return
        val data=snapshot(account)?:return;if(!data.optBoolean("enabled"))return
        val event=JSONObject(intent.getStringExtra("event")?:return);val key=intent.action?:return
        val current=data.optJSONArray("events")?:return
        if((0 until current.length()).none{val item=current.getJSONObject(it);item.optString("id")==event.optString("id")&&item.optLong("startAt")==event.optLong("startAt")})return
        if(prefs.getBoolean("sent:$key",false)||event.optLong("startAt")<System.currentTimeMillis()-5*60000)return
        if(Build.VERSION.SDK_INT>=33&&context.checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS)!=android.content.pm.PackageManager.PERMISSION_GRANTED)return
        val manager=context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.createNotificationChannel(NotificationChannel("calendar","日程提醒",NotificationManager.IMPORTANCE_HIGH))
        val launch=context.packageManager.getLaunchIntentForPackage(context.packageName)?:return
        val click=PendingIntent.getActivity(context,key.hashCode(),launch,PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val time=java.text.SimpleDateFormat("HH:mm",java.util.Locale.CHINA).format(java.util.Date(event.getLong("startAt")))
        val content=listOf(time,event.optString("course"),event.optString("location")).filter{it.isNotBlank()}.joinToString(" · ")
        manager.notify(key.hashCode(),NotificationCompat.Builder(context,"calendar").setSmallIcon(android.R.drawable.ic_menu_my_calendar).setContentTitle(event.optString("title")).setContentText(content).setContentIntent(click).setAutoCancel(true).build())
        prefs.edit().putBoolean("sent:$key",true).apply()
    }
}
class CalendarReminderReceiver:BroadcastReceiver(){override fun onReceive(context:Context,intent:Intent){try{CalendarReminders(context).notify(intent)}catch(_:Exception){}}}
