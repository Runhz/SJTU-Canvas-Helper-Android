package com.canvas.sjtu.mobile

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import org.json.JSONArray
import org.json.JSONObject

/** Fixed content keeps course names and learning questions off the lock screen. */
object AiReplyNotifications {
    fun show(context:Context,args:JSONObject){
        val active=SecureStore(context).activeAccount()?:return
        val scope=JSONArray(args.getString("scope"))
        require(scope.length()==2&&scope.getString(0)==active.optString("accountId")&&scope.getString(1)==active.optString("identityId"))
        if(Build.VERSION.SDK_INT>=33&&context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED)return
        val id=args.getString("conversationId");require(id.length in 1..180)
        val manager=context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.createNotificationChannel(NotificationChannel("ai-replies","AI 回答完成",NotificationManager.IMPORTANCE_HIGH).apply{enableVibration(true)})
        val main=context.packageManager.getLaunchIntentForPackage(context.packageName)?:return
        main.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        val click=PendingIntent.getActivity(context,41008,main,PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        manager.notify("ai-reply",id.hashCode(),NotificationCompat.Builder(context,"ai-replies").setSmallIcon(android.R.drawable.ic_dialog_info).setContentTitle("AI 回答已完成").setContentText("打开学习助手继续查看").setCategory(NotificationCompat.CATEGORY_MESSAGE).setVisibility(NotificationCompat.VISIBILITY_PRIVATE).setContentIntent(click).setAutoCancel(true).build())
    }
}
