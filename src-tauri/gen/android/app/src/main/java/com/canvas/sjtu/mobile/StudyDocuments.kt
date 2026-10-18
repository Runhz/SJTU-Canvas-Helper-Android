package com.canvas.sjtu.mobile

import android.app.Activity
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import android.graphics.pdf.PdfRenderer
import android.os.ParcelFileDescriptor
import android.util.Base64
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.util.concurrent.Executors
import kotlin.math.min
import kotlin.math.roundToInt

/** Only registered files belonging to the current account can be rendered. */
class StudyDocuments(private val activity:Activity){
    private val io=Executors.newSingleThreadExecutor()
    fun command(method:String,invoke:Invoke){io.execute{
        try{
            val args=JSONObject(invoke.getRawArgs());val scope=args.getString("scope")
            fun validate(){val account=SecureStore(activity).activeAccount()?:error("请先连接账号");val parts=JSONArray(scope);require(parts.length()==2&&parts.getString(0)==account.optString("accountId")&&parts.getString(1)==account.optString("identityId")){"账号已切换"}}
            validate();val store=StudyBridge(activity);val file=try{store.document(scope,args.getString("id"))}finally{store.close()}
            if(method=="documentPackage"){
                val size=file.length();val modified=file.lastModified();val data=PptxArchive.structure(file)
                require(file.length()==size&&file.lastModified()==modified){"课件已更新，请重新读取"}
                val entries=JSONArray();data.images.forEach{entries.put(JSONObject().put("name",it.name).put("size",it.size))}
                validate();invoke.resolve(JSObject(JSONObject().put("data",Base64.encodeToString(data.zip,Base64.NO_WRAP)).put("entries",entries).put("size",size).put("modified",modified).toString()));return@execute
            }
            if(method=="documentMedia"){
                require(file.length()==args.getLong("size")&&file.lastModified()==args.getLong("modified")){"课件已更新，请重新读取"}
                val path=args.getString("path");require(PptxArchive.imagePart(path)){"图片引用无效"}
                val result=java.util.zip.ZipFile(file).use{zip->
                    val entry=zip.getEntry(path)?:error("图片已丢失")
                    require(entry.size in 0..256L*1024*1024){"单张图片过大"}
                    val ext=path.substringAfterLast('.').lowercase()
                    if(ext in listOf("svg","emf","wmf","tif","tiff")){
                        val bytes=zip.getInputStream(entry).use{PptxArchive.readBounded(it,8*1024*1024)}
                        JSONObject().put("data",Base64.encodeToString(bytes,Base64.NO_WRAP)).put("path",path)
                    }else{
                        val info=BitmapFactory.Options().apply{inJustDecodeBounds=true};zip.getInputStream(entry).use{BitmapFactory.decodeStream(it,null,info)}
                        require(info.outWidth>0&&info.outHeight>0){"图片无法读取"}
                        if(PptxArchive.directImage(entry.size,info.outWidth,info.outHeight,info.outMimeType)){
                            val bytes=zip.getInputStream(entry).use{PptxArchive.readBounded(it,8*1024*1024)}
                            val suffix=when(info.outMimeType){"image/png"->"png";"image/webp"->"webp";else->"jpg"}
                            JSONObject().put("data",Base64.encodeToString(bytes,Base64.NO_WRAP)).put("path","$path.preview.$suffix")
                        }else{
                        var sample=1;while(info.outWidth/sample>3072||info.outHeight/sample>3072||info.outWidth.toLong()/sample*info.outHeight/sample>6_000_000)sample*=2
                        val bitmap=zip.getInputStream(entry).use{BitmapFactory.decodeStream(it,null,BitmapFactory.Options().apply{inSampleSize=sample})}?:error("图片无法读取")
                        try{
                            val alpha=bitmap.hasAlpha();val out=ByteArrayOutputStream();bitmap.compress(if(alpha)Bitmap.CompressFormat.PNG else Bitmap.CompressFormat.JPEG,92,out)
                            require(out.size()<=16*1024*1024){"图片过于复杂"}
                            JSONObject().put("data",Base64.encodeToString(out.toByteArray(),Base64.NO_WRAP)).put("path",path+if(alpha)".preview.png"else".preview.jpg")
                        }finally{bitmap.recycle()}
                        }
                    }
                }
                validate();invoke.resolve(JSObject(result.toString()));return@execute
            }
            if(method=="documentChunk"){
                val total=file.length()
                val offset=args.getLong("offset");val length=args.optInt("length",262144)
                val bytes=ByteArray(DocumentPolicy.chunkSize(total,offset,length,args.optLong("total",-1)))
                java.io.RandomAccessFile(file,"r").use{it.seek(offset);it.readFully(bytes)}
                validate();invoke.resolve(JSObject(JSONObject().put("data",Base64.encodeToString(bytes,Base64.NO_WRAP)).put("offset",offset).put("total",total).toString()));return@execute
            }
            if(method=="openPreparedDocument"){
                activity.runOnUiThread{try{validate();val uri=androidx.core.content.FileProvider.getUriForFile(activity,"${activity.packageName}.fileprovider",file);activity.startActivity(android.content.Intent(android.content.Intent.ACTION_VIEW).setDataAndType(uri,args.optString("mime","application/octet-stream")).addFlags(android.content.Intent.FLAG_GRANT_READ_URI_PERMISSION));invoke.resolve(JSObject())}catch(_:Exception){invoke.reject("手机上没有兼容的查看应用，可以在下载中心分享或导出")}}
                return@execute
            }
            val ext=file.extension.lowercase();val result=JSONObject();val requested=args.optInt("width",1200).coerceIn(320,2048)
            if(ext=="pdf"){
                ParcelFileDescriptor.open(file,ParcelFileDescriptor.MODE_READ_ONLY).use{fd->PdfRenderer(fd).use{pdf->
                    require(pdf.pageCount>0){"文件没有页面"};result.put("kind","pdf").put("pages",pdf.pageCount)
                    if(method=="documentPage"){
                        val index=args.getInt("page");require(index in 0 until pdf.pageCount){"页码无效"}
                        pdf.openPage(index).use{page->
                            val size=DocumentPolicy.renderSize(page.width,page.height,requested)
                            val bitmap=Bitmap.createBitmap(size[0],size[1],Bitmap.Config.ARGB_8888)
                            try{bitmap.eraseColor(Color.WHITE);page.render(bitmap,null,null,PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY);result.put("image",encode(bitmap,false)).put("width",bitmap.width).put("height",bitmap.height)}finally{bitmap.recycle()}
                        }
                    }
                }}
            }else if(ext in listOf("jpg","jpeg","png","webp","bmp","gif")){
                result.put("kind","image").put("pages",1)
                if(method=="documentPage"){
                    val info=BitmapFactory.Options().apply{inJustDecodeBounds=true};BitmapFactory.decodeFile(file.path,info);require(info.outWidth>0&&info.outHeight>0){"图片无法读取"}
                    var sample=1;while(info.outWidth/sample>requested*2||info.outHeight/sample>3072||info.outWidth.toLong()/sample*info.outHeight/sample>6_000_000)sample*=2
                    val bitmap=BitmapFactory.decodeFile(file.path,BitmapFactory.Options().apply{inSampleSize=sample})?:error("图片无法读取")
                    try{result.put("image",encode(bitmap,bitmap.hasAlpha())).put("width",bitmap.width).put("height",bitmap.height)}finally{bitmap.recycle()}
                }
            }else if(ext in listOf("txt","md","csv","json","log","srt","vtt","py","js","ts","java","c","cpp","h","rs","xml","yaml","yml")){
                // Bounded text pages keep long files out of the WebView heap.
                val index=if(method=="documentPage")args.getInt("page")else 0;require(index>=0&&index<=100000){"页码无效"}
                java.io.InputStreamReader(file.inputStream(),Charsets.UTF_8.newDecoder()).use{reader->
                    var remaining=index.toLong()*32768;while(remaining>0){val skipped=reader.skip(remaining);if(skipped<=0)break;remaining-=skipped}
                    require(remaining==0L){"页码无效"};val chars=CharArray(32769);var length=0
                    while(length<chars.size){val n=reader.read(chars,length,chars.size-length);if(n<0)break;length+=n}
                    result.put("kind","text").put("pages",-1).put("hasNext",length>32768)
                    if(method=="documentPage")result.put("text",String(chars,0,min(length,32768)))
                }
            }else error("此格式请使用平台预览或外部应用打开")
            validate();invoke.resolve(JSObject(result.toString()))
        }catch(_:OutOfMemoryError){invoke.reject("当前内存不足，请关闭其他页面后重试")}
        catch(_:java.nio.charset.CharacterCodingException){invoke.reject("文本不是 UTF-8 编码，请转换编码或用外部应用打开")}
        catch(_:Exception){invoke.reject("文件无法预览，可能已加密、损坏或已被移除；可重新下载或用外部应用打开")}
    }}
    private fun encode(bitmap:Bitmap,alpha:Boolean):String{val bytes=ByteArrayOutputStream();bitmap.compress(if(alpha)Bitmap.CompressFormat.PNG else Bitmap.CompressFormat.JPEG,90,bytes);return "data:image/${if(alpha)"png" else "jpeg"};base64,"+Base64.encodeToString(bytes.toByteArray(),Base64.NO_WRAP)}
}
