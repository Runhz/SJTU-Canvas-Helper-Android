package com.canvas.sjtu.mobile

import android.Manifest
import android.app.Activity
import android.app.DownloadManager
import android.content.ClipData
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.OpenableColumns
import android.provider.MediaStore
import android.util.Base64
import android.webkit.CookieManager
import androidx.activity.result.ActivityResult
import androidx.core.app.ActivityCompat
import androidx.core.content.FileProvider
import app.tauri.annotation.ActivityCallback
import app.tauri.annotation.Command
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.security.MessageDigest
import java.util.UUID
import java.util.concurrent.Executors

internal fun accountHash(id: String): String = MessageDigest.getInstance("MD5").digest(id.toByteArray(Charsets.UTF_8)).joinToString("") { "%02x".format(it) }
internal class TaskDb(context: Context) : SQLiteOpenHelper(context, "downloads.db", null, 1) {
    override fun onCreate(db: SQLiteDatabase) { db.execSQL("CREATE TABLE tasks(id INTEGER PRIMARY KEY,account TEXT NOT NULL,resource TEXT NOT NULL,name TEXT NOT NULL,path TEXT NOT NULL,course TEXT NOT NULL,cancelled INTEGER NOT NULL DEFAULT 0)") }
    override fun onUpgrade(db: SQLiteDatabase, old: Int, new: Int) { error("Unsupported database upgrade") }
}

@TauriPlugin
class CanvasPlugin(private val activity: Activity): Plugin(activity) {
    private val io = Executors.newSingleThreadExecutor()
    private val db by lazy { TaskDb(activity) }
    private val manager get() = activity.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
    private fun resolve(invoke: Invoke, body: JSONObject) = invoke.resolve(JSObject(body.toString()))
    private fun guarded(invoke: Invoke, action: () -> Unit) { try { action() } catch (_: Exception) { invoke.reject("操作未完成，请检查文件、权限或可用空间后重试") } }
    private fun data(invoke: Invoke) = JSONObject(invoke.getRawArgs())
    private fun currentId(): String = SecureStore(activity).settings().optString("currentId").also { require(it.isNotBlank()) }
    private fun ownedFile(path: String): File {
        val file = File(path).canonicalFile
        val account = accountHash(currentId())
        val roots = listOf(File(activity.cacheDir,"uploads/$account"), File(activity.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS),account), File(activity.filesDir,"exports/$account"))
        require(roots.any { file.path.startsWith(it.canonicalPath + File.separator) })
        require(file.isFile)
        return file
    }
    @Command fun loadSettings(invoke: Invoke) = guarded(invoke) { resolve(invoke, SecureStore(activity).settings()) }
    @Command fun saveSettings(invoke: Invoke) = guarded(invoke) {
        val value = data(invoke).getJSONObject("settings")
        require(value.has("accounts") && value.has("currentId"))
        SecureStore(activity).write("settings",value.toString()); invoke.resolve()
    }
    @Command fun deviceInfo(invoke: Invoke) = guarded(invoke) { resolve(invoke,JSONObject().put("android",Build.VERSION.SDK_INT).put("model",Build.MODEL).put("notifications",Build.VERSION.SDK_INT<33 || activity.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)==PackageManager.PERMISSION_GRANTED)) }
    @Command fun startMotion(invoke: Invoke) { activity.runOnUiThread { guarded(invoke) { resolve(invoke,JSONObject().put("available",(activity as MainActivity).waterMotion.start())) } } }
    @Command fun stopMotion(invoke: Invoke) { activity.runOnUiThread { (activity as MainActivity).waterMotion.stop(); invoke.resolve() } }
    @Command fun motionState(invoke: Invoke) { activity.runOnUiThread { resolve(invoke,(activity as MainActivity).waterMotion.snapshot()) } }
    @Command fun setAppearance(invoke:Invoke){val dark=data(invoke).optBoolean("dark");activity.runOnUiThread{guarded(invoke){activity.getSharedPreferences("appearance",Context.MODE_PRIVATE).edit().putBoolean("dark",dark).apply();androidx.core.view.WindowInsetsControllerCompat(activity.window,activity.window.decorView).apply{isAppearanceLightStatusBars=!dark;isAppearanceLightNavigationBars=!dark};activity.window.decorView.setBackgroundColor(android.graphics.Color.parseColor(if(dark)"#111113" else "#f9f9fb"));invoke.resolve()}}}
    @Command fun diagnoseCanvas(invoke:Invoke) {
        io.execute {
            var connection:javax.net.ssl.HttpsURLConnection?=null
            try{
                connection=java.net.URL("https://oc.sjtu.edu.cn/api/v1/users/self").openConnection() as javax.net.ssl.HttpsURLConnection
                connection.connectTimeout=12000;connection.readTimeout=12000;connection.instanceFollowRedirects=false
                val status=connection.responseCode
                resolve(invoke,JSONObject().put("reachable",true).put("httpStatus",status).put("message","系统 HTTPS 已到达 Canvas（HTTP $status）。自检不携带 Token，401 属于正常鉴权响应。"))
            }catch(e:Exception){
                val message=when(e){is javax.net.ssl.SSLException->"系统 HTTPS 证书验证失败，请检查手机时间及网络代理证书";is java.net.UnknownHostException->"无法解析 oc.sjtu.edu.cn，请检查当前网络的 DNS";is java.net.SocketTimeoutException->"连接 Canvas 超时，请切换网络后重试";else->"系统也无法连接 Canvas，请检查网络或代理设置"}
                resolve(invoke,JSONObject().put("reachable",false).put("message",message))
            }finally{connection?.disconnect()}
        }
    }
    @Command fun requestNotifications(invoke: Invoke) {
        if (Build.VERSION.SDK_INT>=33 && activity.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED) ActivityCompat.requestPermissions(activity,arrayOf(Manifest.permission.POST_NOTIFICATIONS),5041)
        invoke.resolve()
    }
    @Command fun pickFiles(invoke: Invoke) = guarded(invoke) {
        val intent=Intent(Intent.ACTION_OPEN_DOCUMENT).apply { type="*/*"; addCategory(Intent.CATEGORY_OPENABLE); putExtra(Intent.EXTRA_ALLOW_MULTIPLE,true); addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION) }
        startActivityForResult(invoke,intent,"filesPicked")
    }
    @ActivityCallback fun filesPicked(invoke: Invoke, result: ActivityResult) {
        if(result.resultCode!=Activity.RESULT_OK){ resolve(invoke,JSONObject().put("files",JSONArray()));return }
        val account=try { currentId() } catch(_:Exception){invoke.reject("请先选择账号");return}
        io.execute { guarded(invoke) {
            val uris=mutableListOf<Uri>(); result.data?.clipData?.let { for(i in 0 until it.itemCount) uris.add(it.getItemAt(i).uri) } ?: result.data?.data?.let { uris.add(it) }
            val files=JSONArray()
            for(uri in uris.distinct()) {
                var name="附件"; var size:Long=-1
                activity.contentResolver.query(uri,arrayOf(OpenableColumns.DISPLAY_NAME,OpenableColumns.SIZE),null,null,null)?.use { if(it.moveToFirst()){name=it.getString(0)?:name;if(!it.isNull(1))size=it.getLong(1)} }
                val safe=name.replace(Regex("[\\\\/:*?\"<>|\\p{Cntrl}]"),"_").take(180).ifBlank { "附件" }
                val folder=File(activity.cacheDir,"uploads/${accountHash(account)}/${UUID.randomUUID()}").apply { mkdirs() }
                val target=File(folder,safe)
                activity.contentResolver.openInputStream(uri)?.use { input -> target.outputStream().use { output -> input.copyTo(output) } } ?: error("Unable to read document")
                files.put(JSONObject().put("name",name).put("path",target.path).put("size",target.length()).put("mime",activity.contentResolver.getType(uri)?:"application/octet-stream"))
            }
            resolve(invoke,JSONObject().put("files",files))
        } }
    }
    @Command fun openFile(invoke: Invoke) = guarded(invoke) {
        val args=data(invoke);val file=ownedFile(args.getString("path"));val uri=FileProvider.getUriForFile(activity,"${activity.packageName}.fileprovider",file)
        val intent=Intent(Intent.ACTION_VIEW).setDataAndType(uri,args.optString("mime","application/octet-stream")).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        try { activity.startActivity(intent);invoke.resolve() } catch(_:android.content.ActivityNotFoundException){invoke.reject("手机上没有兼容的查看应用，可以分享或导出文件")}
    }
    @Command fun shareFile(invoke: Invoke) = guarded(invoke) {
        val args=data(invoke);val file=ownedFile(args.getString("path"));val uri=FileProvider.getUriForFile(activity,"${activity.packageName}.fileprovider",file)
        val intent=Intent(Intent.ACTION_SEND).setType(args.optString("mime","application/octet-stream")).putExtra(Intent.EXTRA_STREAM,uri).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        activity.startActivity(Intent.createChooser(intent,"分享文件"));invoke.resolve()
    }
    @Command fun exportFile(invoke: Invoke) = guarded(invoke) {
        val args=data(invoke)
        if(args.has("text")) {
            val folder=File(activity.filesDir,"exports/${accountHash(currentId())}").apply{mkdirs()}
            val name=args.optString("name","课程资料.txt").replace(Regex("[\\\\/]"),"_")
            File(folder,name).writeText(args.getString("text"),Charsets.UTF_8)
            args.put("path",File(folder,name).path)
        }
        val file=ownedFile(args.getString("path"))
        // Hold a per-invocation export reference in encrypted storage; no arbitrary source paths are accepted.
        SecureStore(activity).write("export:${invoke.id}",file.path)
        startActivityForResult(invoke,Intent(Intent.ACTION_CREATE_DOCUMENT).apply { type=args.optString("mime","text/plain");addCategory(Intent.CATEGORY_OPENABLE);putExtra(Intent.EXTRA_TITLE,file.name) },"fileExported")
    }
    @ActivityCallback fun fileExported(invoke:Invoke,result:ActivityResult) {
        if(result.resultCode!=Activity.RESULT_OK){invoke.resolve();return}
        io.execute {guarded(invoke){
            val path=SecureStore(activity).read("export:${invoke.id}")?:error("Expired export")
            val file=ownedFile(path);val uri=result.data?.data?:error("No destination")
            activity.contentResolver.openOutputStream(uri,"w")?.use { output -> file.inputStream().use { input -> input.copyTo(output) } }?:error("Unable to write")
            invoke.resolve()
        }}
    }
    @Command fun enqueueDownload(invoke:Invoke)=guarded(invoke){
        val args=data(invoke);val account=currentId();require(args.getString("accountId")==account)
        val resource=args.getString("resourceId");val course=args.optString("courseId")
        db.readableDatabase.rawQuery("SELECT id FROM tasks WHERE account=? AND resource=? AND course=? AND cancelled=0",arrayOf(account,resource,course)).use { cursor -> while(cursor.moveToNext()){val id=cursor.getLong(0);manager.query(DownloadManager.Query().setFilterById(id))?.use { q -> if(q.moveToFirst() && q.getInt(q.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS))!=DownloadManager.STATUS_FAILED){resolve(invoke,JSONObject().put("id",id).put("existing",true));return@guarded} }} }
        val url=Uri.parse(args.getString("url"));require(url.scheme=="https")
        val name=args.getString("name").replace(Regex("[\\\\/:*?\"<>|\\p{Cntrl}]"),"_").take(180).ifBlank{"课程资料"}
        val relative="${accountHash(account)}/${UUID.randomUUID()}/$name"
        val request=DownloadManager.Request(url).setTitle(name).setDescription("Canvas 随行 · 课程资料").setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED).setDestinationInExternalFilesDir(activity,Environment.DIRECTORY_DOWNLOADS,relative)
        args.optJSONObject("headers")?.let { headers -> for(key in headers.keys()) request.addRequestHeader(key,headers.getString(key)) }
        val id=manager.enqueue(request)
        val values=ContentValues().apply{put("id",id);put("account",account);put("resource",resource);put("name",name);put("path",File(activity.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS),relative).path);put("course",course)}
        try{db.writableDatabase.insertOrThrow("tasks",null,values)}catch(e:Exception){manager.remove(id);throw e}
        resolve(invoke,JSONObject().put("id",id))
    }
    @Command fun listDownloads(invoke:Invoke)=guarded(invoke){
        val out=JSONArray();val account=currentId()
        db.readableDatabase.rawQuery("SELECT id,resource,name,path,course,cancelled FROM tasks WHERE account=? ORDER BY id DESC",arrayOf(account)).use{cursor->while(cursor.moveToNext()){
            val id=cursor.getLong(0);val task=JSONObject().put("id",id.toString()).put("resourceId",cursor.getString(1)).put("name",cursor.getString(2)).put("path",cursor.getString(3)).put("courseId",cursor.getString(4))
            var status=if(cursor.getInt(5)==1)"cancelled" else "failed";var done=0L;var total=0L;var reason=0
            manager.query(DownloadManager.Query().setFilterById(id))?.use{q->if(q.moveToFirst()&&cursor.getInt(5)!=1){
                done=q.getLong(q.getColumnIndexOrThrow(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR));total=q.getLong(q.getColumnIndexOrThrow(DownloadManager.COLUMN_TOTAL_SIZE_BYTES));reason=q.getInt(q.getColumnIndexOrThrow(DownloadManager.COLUMN_REASON))
                status=when(q.getInt(q.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS))){DownloadManager.STATUS_SUCCESSFUL->if(File(cursor.getString(3)).isFile)"completed" else "failed";DownloadManager.STATUS_FAILED->"failed";DownloadManager.STATUS_PAUSED->"waiting";DownloadManager.STATUS_PENDING->"queued";else->"running"}
            }}
            task.put("status",status).put("progress",if(total>0)(done*100/total).coerceIn(0,100) else 0).put("bytes",done).put("total",total).put("reason",reason);out.put(task)
        }}
        resolve(invoke,JSONObject().put("tasks",out))
    }
    @Command fun cancelDownload(invoke:Invoke)=guarded(invoke){val id=data(invoke).getLong("id");val account=currentId();db.writableDatabase.update("tasks",ContentValues().apply{put("cancelled",1)},"id=? AND account=?",arrayOf(id.toString(),account)).let{if(it>0)manager.remove(id)};invoke.resolve()}
    @Command fun clearAccount(invoke:Invoke)=guarded(invoke){
        val account=data(invoke).getString("accountId")
        db.readableDatabase.rawQuery("SELECT id FROM tasks WHERE account=? AND cancelled=0",arrayOf(account)).use{c->while(c.moveToNext()){val id=c.getLong(0);manager.query(DownloadManager.Query().setFilterById(id))?.use{q->if(q.moveToFirst()&&q.getInt(q.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS))!=DownloadManager.STATUS_SUCCESSFUL)manager.remove(id)}}}
        ReminderEngine(activity).clear(account);CalendarReminders(activity).clear(account);CookieManager.getInstance().removeAllCookies(null);invoke.resolve()
    }
    @Command fun clearCache(invoke:Invoke)=guarded(invoke){
        val root=File(activity.cacheDir,"uploads/${accountHash(currentId())}").canonicalFile
        require(root.path.startsWith(activity.cacheDir.canonicalPath+File.separator))
        root.deleteRecursively();root.mkdirs();val ai=File(activity.cacheDir,"ai/${accountHash(currentId())}").canonicalFile;require(ai.path.startsWith(activity.cacheDir.canonicalPath+File.separator));ai.deleteRecursively();invoke.resolve()
    }
    @Command fun openLogin(invoke:Invoke)=guarded(invoke){
        val account=currentId();val cached=SecureStore(activity).activeAccount()?.optString("cookie","")?:""
        val url=data(invoke).optString("url","https://my.sjtu.edu.cn/ui/appmyinfo")
        val uri=Uri.parse(url)
        require(url=="https://my.sjtu.edu.cn/ui/appmyinfo" || (uri.scheme=="https" && uri.host=="jaccount.sjtu.edu.cn" && uri.path=="/jaccount/confirmscancode"))
        CookieManager.getInstance().removeAllCookies { if(cached.isNotBlank())CookieManager.getInstance().setCookie("https://jaccount.sjtu.edu.cn",cached);startActivityForResult(invoke,Intent(activity,LoginActivity::class.java).putExtra("accountId",account).putExtra("url",url),"loginFinished") }
    }
    @Command fun saveQrImage(invoke:Invoke)=guarded(invoke){
        val bytes=Base64.decode(data(invoke).getString("base64"),Base64.DEFAULT)
        require(bytes.size in 8..262144 && bytes.take(8)==listOf(137,80,78,71,13,10,26,10).map{it.toByte()})
        val values=ContentValues().apply{put(MediaStore.Images.Media.DISPLAY_NAME,"Canvas登录二维码-${System.currentTimeMillis()}.png");put(MediaStore.Images.Media.MIME_TYPE,"image/png");put(MediaStore.Images.Media.RELATIVE_PATH,"Pictures/Canvas随行");put(MediaStore.Images.Media.IS_PENDING,1)}
        val resolver=activity.contentResolver;val uri=resolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI,values)?:error("Unable to create image")
        try{resolver.openOutputStream(uri)?.use{it.write(bytes)}?:error("Unable to save image");resolver.update(uri,ContentValues().apply{put(MediaStore.Images.Media.IS_PENDING,0)},null,null)}catch(e:Exception){resolver.delete(uri,null,null);throw e}
        invoke.resolve()
    }
    @Command fun openWeChat(invoke:Invoke)=guarded(invoke){
        val launch=activity.packageManager.getLaunchIntentForPackage("com.tencent.mm")
        if(launch==null)invoke.reject("未找到微信，可使用官方网页登录")else{activity.startActivity(launch);invoke.resolve()}
    }
    @ActivityCallback fun loginFinished(invoke:Invoke,result:ActivityResult){if(result.resultCode==Activity.RESULT_OK)resolve(invoke,JSONObject().put("cookie",result.data?.getStringExtra("cookie")?:""))else invoke.reject("登录已取消")}
    @Command fun openPlayer(invoke:Invoke)=guarded(invoke){val args=data(invoke);args.put("accountId",currentId());PlayerActivity.pending=args;activity.startActivity(Intent(activity,PlayerActivity::class.java));invoke.resolve()}
    @Command fun embedPlayer(invoke:Invoke){val args=data(invoke);activity.runOnUiThread{guarded(invoke){(activity as MainActivity).embeddedPlayer.open(args,currentId());invoke.resolve()}}}
    @Command fun playerControl(invoke:Invoke){val args=data(invoke);activity.runOnUiThread{guarded(invoke){(activity as MainActivity).embeddedPlayer.control(args);invoke.resolve()}}}
    @Command fun capturePlayer(invoke:Invoke){activity.runOnUiThread{try{resolve(invoke,(activity as MainActivity).embeddedPlayer.capture())}catch(_:Exception){invoke.reject("截图暂未就绪，请待画面稳定后重试")}}}
    @Command fun playerStatus(invoke:Invoke){activity.runOnUiThread{guarded(invoke){resolve(invoke,(activity as MainActivity).embeddedPlayer.snapshot())}}}
    @Command fun syncCalendar(invoke:Invoke)=guarded(invoke){val args=data(invoke);require(args.getString("accountId")==currentId());CalendarReminders(activity).replace(args);invoke.resolve()}
    @Command fun syncReminders(invoke:Invoke)=guarded(invoke){val args=data(invoke);require(args.getString("accountId")==currentId());ReminderEngine(activity).replace(args);invoke.resolve()}
}
