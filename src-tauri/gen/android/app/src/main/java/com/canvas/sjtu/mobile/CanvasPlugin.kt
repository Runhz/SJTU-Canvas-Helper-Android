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
internal class TaskDb(context: Context) : SQLiteOpenHelper(context, "downloads.db", null, 2) {
    override fun onCreate(db: SQLiteDatabase) { db.execSQL("CREATE TABLE tasks(id INTEGER PRIMARY KEY,account TEXT NOT NULL,resource TEXT NOT NULL,name TEXT NOT NULL,path TEXT NOT NULL,course TEXT NOT NULL,cancelled INTEGER NOT NULL DEFAULT 0,version TEXT NOT NULL DEFAULT '')") }
    override fun onUpgrade(db: SQLiteDatabase, old: Int, new: Int) { if(old<2)db.execSQL("ALTER TABLE tasks ADD COLUMN version TEXT NOT NULL DEFAULT ''") }
}

@TauriPlugin
class CanvasPlugin(private val activity: Activity): Plugin(activity) {
    @Command fun notifyAiComplete(invoke:Invoke)=guarded(invoke){AiReplyNotifications.show(activity,data(invoke));invoke.resolve()}
    private val documents by lazy{StudyDocuments(activity)}
    @Command fun embedDocument(invoke:Invoke){val args=data(invoke);activity.runOnUiThread{guarded(invoke){(activity as MainActivity).embeddedDocument.open(args);invoke.resolve()}}}
    @Command fun documentPreviewControl(invoke:Invoke){val args=data(invoke);activity.runOnUiThread{guarded(invoke){resolve(invoke,(activity as MainActivity).embeddedDocument.control(args))}}}
    @Command fun captureDocument(invoke:Invoke){val args=data(invoke);activity.runOnUiThread{guarded(invoke){(activity as MainActivity).embeddedDocument.capture(args.getString("id")){result,error->if(result!=null)resolve(invoke,result)else invoke.reject(error?:"截图未完成")}}}}
    @Command fun captureSlideImage(invoke:Invoke){
        val args=data(invoke);val scope=args.getString("scope");val active=SecureStore(activity).activeAccount();val parts=JSONArray(scope)
        if(active==null||parts.length()!=2||parts.getString(0)!=active.optString("accountId")||parts.getString(1)!=active.optString("identityId")){invoke.reject("请先连接当前账号");return}
        SlideImages.executor.execute{try{val image=SlideImages.load(args.getString("url"),1600);try{val output=java.io.ByteArrayOutputStream();image.compress(android.graphics.Bitmap.CompressFormat.JPEG,90,output);activity.runOnUiThread{val current=SecureStore(activity).activeAccount();if(current?.optString("accountId")==active.optString("accountId")&&current.optString("identityId")==active.optString("identityId"))resolve(invoke,JSONObject().put("image","data:image/jpeg;base64,"+Base64.encodeToString(output.toByteArray(),Base64.NO_WRAP)))else invoke.reject("账号已切换，请重新提问")}}finally{image.recycle()}}catch(_:Exception){invoke.reject("课件图片暂时无法读取，请重试")}}
    }
    @Command fun documentInfo(invoke:Invoke)=documents.command("documentInfo",invoke)
    @Command fun documentPage(invoke:Invoke)=documents.command("documentPage",invoke)
    @Command fun documentChunk(invoke:Invoke)=documents.command("documentChunk",invoke)
    @Command fun documentPackage(invoke:Invoke)=documents.command("documentPackage",invoke)
    @Command fun documentMedia(invoke:Invoke)=documents.command("documentMedia",invoke)
    @Command fun openPreparedDocument(invoke:Invoke)=documents.command("openPreparedDocument",invoke)
    @Command fun openDocumentPreview(invoke:Invoke){activity.runOnUiThread{guarded(invoke){
        val args=data(invoke);val active=SecureStore(activity).activeAccount()?:error("No account");val parts=JSONArray(args.getString("scope"))
        require(parts.length()==2&&parts.getString(0)==active.optString("accountId")&&parts.getString(1)==active.optString("identityId"))
        val uri=Uri.parse(args.getString("url"));require(DocumentPolicy.allowedUrl(uri.toString(),true))
        val intent=Intent(activity,DocumentPreviewActivity::class.java).putExtra("url",uri.toString()).putExtra("scope",args.getString("scope")).putExtra("title",args.optString("title","文件预览"))
        if(args.optString("downloadPath").isNotBlank()){val file=ownedFile(args.getString("downloadPath"));intent.putExtra("downloadPath",file.path).putExtra("mime",args.optString("mime","application/octet-stream"))}
        activity.startActivity(intent);invoke.resolve()
    }}}
    private val study by lazy { StudyAttachments(activity) }
    @Command fun studyPrepared(invoke:Invoke)=study.command("studyPrepared",invoke)
    @Command fun studyRead(invoke:Invoke)=study.command("studyRead",invoke)
    @Command fun studyStageForAi(invoke:Invoke)=study.command("studyStageForAi",invoke)
    @Command fun studyForget(invoke:Invoke)=study.command("studyForget",invoke)
    @Command fun studyClear(invoke:Invoke)=study.command("studyClear",invoke)
    @Command fun studySave(invoke:Invoke)=study.command("studySave",invoke)
    @Command fun studyRegisterDownload(invoke:Invoke)=study.command("studyRegisterDownload",invoke)
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
    private fun officialCookie()=CookieManager.getInstance().getCookie("https://jaccount.sjtu.edu.cn")?.split(';')?.map{it.trim()}?.firstOrNull{it.startsWith("JAAuthCookie=")}
    @Command fun loadSettings(invoke: Invoke) = guarded(invoke) {
        val store=SecureStore(activity);val settings=store.settings();val id=settings.optString("currentId")
        // Only reuse the WebView belonging to the account whose official login completed here.
        if(id.isNotBlank()&&store.read("web-login-account")==id){val cookie=officialCookie();if(!cookie.isNullOrBlank()){val accounts=settings.optJSONArray("accounts");if(accounts!=null)for(i in 0 until accounts.length()){val row=accounts.optJSONObject(i);if(row?.optString("accountId")==id)row.put("cookie",cookie)};store.write("settings",settings.toString())}}
        resolve(invoke,settings)
    }
    @Command fun resumeWebSession(invoke:Invoke)=guarded(invoke){
        val store=SecureStore(activity);val id=data(invoke).getString("accountId");require(id==currentId());val cookies=JSONObject()
        if(store.read("web-login-account")==id)for(host in listOf("jaccount.sjtu.edu.cn","my.sjtu.edu.cn","oc.sjtu.edu.cn","v.sjtu.edu.cn","courses.sjtu.edu.cn")){val url="https://$host/";val cookie=CookieManager.getInstance().getCookie(url);if(!cookie.isNullOrBlank())cookies.put(url,cookie)}
        resolve(invoke,JSONObject().put("webCookies",cookies))
    }
    @Command fun saveSettings(invoke: Invoke) = guarded(invoke) {
        val value = data(invoke).getJSONObject("settings")
        require(value.has("accounts") && value.has("currentId"))
        SecureStore(activity).write("settings",value.toString()); invoke.resolve()
    }
    @Command fun deviceInfo(invoke: Invoke) = guarded(invoke) { resolve(invoke,JSONObject().put("android",Build.VERSION.SDK_INT).put("model",Build.MODEL).put("smallestWidthDp",activity.resources.configuration.smallestScreenWidthDp).put("landscape",activity.resources.configuration.orientation==android.content.res.Configuration.ORIENTATION_LANDSCAPE).put("notifications",Build.VERSION.SDK_INT<33 || activity.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)==PackageManager.PERMISSION_GRANTED)) }
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
        val version=args.optString("studyVersion")
        db.readableDatabase.rawQuery("SELECT id,path,version FROM tasks WHERE account=? AND resource=? AND course=? AND cancelled=0",arrayOf(account,resource,course)).use { cursor -> while(cursor.moveToNext()){val id=cursor.getLong(0);manager.query(DownloadManager.Query().setFilterById(id))?.use { q -> if(q.moveToFirst()){
            val status=q.getInt(q.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS));val file=File(cursor.getString(1))
            val sameVersion=version.isEmpty()||cursor.getString(2)==version
            val freshCompleted=status==DownloadManager.STATUS_SUCCESSFUL&&args.optLong("requiredAfter",0)>0&&q.getLong(q.getColumnIndexOrThrow(DownloadManager.COLUMN_LAST_MODIFIED_TIMESTAMP))>=args.getLong("requiredAfter")
            val sizeOk=!args.has("expectedSize")||file.length()==args.getLong("expectedSize")
            if(status!=DownloadManager.STATUS_FAILED&&(sameVersion||freshCompleted)&&(status!=DownloadManager.STATUS_SUCCESSFUL||file.isFile&&sizeOk)){resolve(invoke,JSONObject().put("id",id).put("existing",true));return@guarded}
        }}} }
        val url=Uri.parse(args.getString("url"));require(url.scheme=="https")
        val name=args.getString("name").replace(Regex("[\\\\/:*?\"<>|\\p{Cntrl}]"),"_").take(180).ifBlank{"课程资料"}
        val relative="${accountHash(account)}/${UUID.randomUUID()}/$name"
        val request=DownloadManager.Request(url).setTitle(name).setDescription("Canvas 随行 · 课程资料").setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED).setDestinationInExternalFilesDir(activity,Environment.DIRECTORY_DOWNLOADS,relative)
        args.optJSONObject("headers")?.let { headers -> for(key in headers.keys()) request.addRequestHeader(key,headers.getString(key)) }
        val id=manager.enqueue(request)
        val values=ContentValues().apply{put("id",id);put("account",account);put("resource",resource);put("name",name);put("path",File(activity.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS),relative).path);put("course",course);put("version",version)}
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
    @Command fun deleteDownload(invoke:Invoke)=guarded(invoke){
        val id=data(invoke).getLong("id");val account=currentId();var path=""
        db.readableDatabase.rawQuery("SELECT path FROM tasks WHERE id=? AND account=?",arrayOf(id.toString(),account)).use{if(it.moveToFirst())path=it.getString(0)}
        require(path.isNotBlank())
        manager.remove(id)
        if(path.isNotBlank()){val file=File(path).canonicalFile;val root=File(activity.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS),accountHash(account)).canonicalFile;require(file.path.startsWith(root.path+File.separator));if(file.isFile)file.delete();file.parentFile?.let{parent->if(parent.listFiles()?.isEmpty()==true)parent.delete()}}
        db.writableDatabase.delete("tasks","id=? AND account=?",arrayOf(id.toString(),account));invoke.resolve()
    }
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
        val cookies=CookieManager.getInstance();val store=SecureStore(activity)
        val open={if(officialCookie().isNullOrBlank()&&cached.isNotBlank())cookies.setCookie("https://jaccount.sjtu.edu.cn",cached);startActivityForResult(invoke,Intent(activity,LoginActivity::class.java).putExtra("accountId",account).putExtra("url",url),"loginFinished")}
        if(store.read("web-login-account")==account)open()else cookies.removeAllCookies{open()}
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
    @ActivityCallback fun loginFinished(invoke:Invoke,result:ActivityResult){if(result.resultCode==Activity.RESULT_OK){val id=result.data?.getStringExtra("accountId")?:"";if(id!=currentId()){invoke.reject("账号已切换，请重新验证");return};SecureStore(activity).write("web-login-account",id);resolve(invoke,JSONObject().put("cookie",result.data?.getStringExtra("cookie")?:""))}else invoke.reject("登录已取消")}
    @Command fun openPlayer(invoke:Invoke)=guarded(invoke){val args=data(invoke);args.put("accountId",currentId());PlayerActivity.pending=args;activity.startActivity(Intent(activity,PlayerActivity::class.java));invoke.resolve()}
    @Command fun embedPlayer(invoke:Invoke){val args=data(invoke);activity.runOnUiThread{guarded(invoke){(activity as MainActivity).embeddedPlayer.open(args,currentId());invoke.resolve()}}}
    @Command fun playerControl(invoke:Invoke){val args=data(invoke);activity.runOnUiThread{guarded(invoke){(activity as MainActivity).embeddedPlayer.control(args);invoke.resolve()}}}
    @Command fun capturePlayer(invoke:Invoke){activity.runOnUiThread{try{resolve(invoke,(activity as MainActivity).embeddedPlayer.capture())}catch(_:Exception){invoke.reject("截图暂未就绪，请待画面稳定后重试")}}}
    @Command fun playerStatus(invoke:Invoke){activity.runOnUiThread{guarded(invoke){resolve(invoke,(activity as MainActivity).embeddedPlayer.snapshot())}}}
    @Command fun syncCalendar(invoke:Invoke)=guarded(invoke){val args=data(invoke);require(args.getString("accountId")==currentId());CalendarReminders(activity).replace(args);invoke.resolve()}
    @Command fun syncReminders(invoke:Invoke)=guarded(invoke){val args=data(invoke);require(args.getString("accountId")==currentId());ReminderEngine(activity).replace(args);invoke.resolve()}
}
