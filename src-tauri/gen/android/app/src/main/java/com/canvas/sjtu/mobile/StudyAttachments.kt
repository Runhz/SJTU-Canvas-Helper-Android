package com.canvas.sjtu.mobile

import android.app.Activity
import android.os.Environment
import android.util.Base64
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.util.concurrent.Executors

/** Trusted local operations for prepared course files and study excerpts. */
class StudyAttachments(private val activity:Activity){
    private val io=Executors.newSingleThreadExecutor()
    private val store by lazy{StudyBridge(activity)}
    private fun verified(args:JSONObject):String{
        val scope=args.getString("scope");val account=SecureStore(activity).activeAccount()
        if(account==null){require(scope=="anonymous"){"请重新选择账号"}}else{
            val parts=JSONArray(scope);require(parts.length()==2&&parts.getString(0)==account.optString("accountId")&&parts.getString(1)==account.optString("identityId")){"账号已切换，请重新选择"}
        }
        return scope
    }
    fun command(method:String,invoke:Invoke){io.execute{
        try{
            val args=JSONObject(invoke.getRawArgs());val scope=verified(args)
            store.setScope(scope)
            val result:Any?=when(method){
                "studyPrepared"->JSONObject().put("items",store.items(scope))
                "studyRead"->store.payload(scope,args.getString("id"))
                "studyForget"->{store.forget(scope,args.getString("id"));JSONObject()}
                "studyClear"->JSONObject().put("removed",store.clearTemporary(scope))
                "studySave"->{
                    val name=args.optString("name","课堂资料.txt").replace(Regex("[\\\\/:*?\"<>|\\p{Cntrl}]"),"_").take(180).ifBlank{"课堂资料.txt"}
                    val bytes=if(args.has("base64")){val encoded=args.getString("base64");require(encoded.length<=8*1024*1024){"截图过大，请裁剪后重试"};Base64.decode(encoded,Base64.DEFAULT)}else args.getString("text").toByteArray(Charsets.UTF_8)
                    val id=StudyBridge.hash(args.getString("key")+":"+StudyBridge.hashBytes(bytes))
                    val folder=File(activity.filesDir,"exports/attachments/${StudyBridge.hash(scope)}/$id").apply{mkdirs()};val file=File(folder,name)
                    if(!file.isFile){val temporary=File(folder,".preparing");temporary.writeBytes(bytes);check(temporary.renameTo(file))}
                    store.register(scope,id,name,args.optString("mime","text/plain"),file,args.optString("kind","subtitle"),args.optString("courseId"),args.optString("resourceId"))
                }
                "studyRegisterDownload"->{
                    val account=SecureStore(activity).activeAccount()?:error("No account");val db=TaskDb(activity)
                    val id=args.getString("taskId");val resource=args.getString("resourceId");val course=args.getString("courseId")
                    val file=db.readableDatabase.rawQuery("SELECT path FROM tasks WHERE id=? AND account=? AND resource=? AND course=? AND cancelled=0",arrayOf(id,account.optString("accountId"),resource,course)).use{c->require(c.moveToFirst()){ "下载记录已失效" };File(c.getString(0)).canonicalFile};db.close()
                    val root=File(activity.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS),accountHash(account.optString("accountId"))).canonicalFile
                    require(file.path.startsWith(root.path+File.separator)&&file.isFile){"文件已丢失，请重新下载"}
                    if(args.optLong("size",-1)>=0)require(file.length()==args.getLong("size")){"文件大小不符，请重新下载"}
                    store.register(scope,args.getString("key"),args.getString("name"),args.optString("mime","application/octet-stream"),file,"file",course,resource)
                }
                else->error("Unknown study operation")
            }
            invoke.resolve(JSObject((result as JSONObject).toString()))
        }catch(e:Exception){invoke.reject(if(e is IllegalArgumentException&&e.message!=null&&!e.message!!.contains(" at "))e.message!!else "资料准备未完成，请检查文件、网络或可用空间后重试")}
    }}
}
