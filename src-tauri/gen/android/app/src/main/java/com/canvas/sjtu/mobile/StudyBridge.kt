package com.canvas.sjtu.mobile

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.security.MessageDigest

/** Account-scoped prepared learning materials. No credentials. */
class StudyBridge(private val context:Context):SQLiteOpenHelper(context,"study-attachments.db",null,2){
    override fun onCreate(db:SQLiteDatabase){
        db.execSQL("CREATE TABLE state(k TEXT PRIMARY KEY,v TEXT NOT NULL)")
        db.execSQL("CREATE TABLE items(id TEXT NOT NULL,scope TEXT NOT NULL,name TEXT NOT NULL,mime TEXT NOT NULL,path TEXT NOT NULL,size INTEGER NOT NULL,kind TEXT NOT NULL,course TEXT NOT NULL,resource TEXT NOT NULL,updated INTEGER NOT NULL,lease INTEGER NOT NULL DEFAULT 0,hidden INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(scope,id))")
    }
    override fun onUpgrade(db:SQLiteDatabase,old:Int,new:Int){if(old<2){db.execSQL("DROP TABLE IF EXISTS requests");db.execSQL("UPDATE items SET lease=0")}}
    fun scope():String=readableDatabase.rawQuery("SELECT v FROM state WHERE k='scope'",null).use{if(it.moveToFirst())it.getString(0)else "anonymous"}
    fun setScope(value:String){
        val db=writableDatabase;db.beginTransaction();try{
            db.insertWithOnConflict("state",null,ContentValues().apply{put("k","scope");put("v",value)},SQLiteDatabase.CONFLICT_REPLACE)
            db.setTransactionSuccessful()
        }finally{db.endTransaction()}
    }
    fun items(value:String):JSONArray=JSONArray().apply{
        readableDatabase.rawQuery("SELECT id,name,mime,path,size,kind,course,resource,updated FROM items WHERE scope=? AND hidden=0 ORDER BY updated DESC LIMIT 100",arrayOf(value)).use{c->while(c.moveToNext()){
            val file=File(c.getString(3));if(file.isFile)put(JSONObject().put("id",c.getString(0)).put("name",c.getString(1)).put("mime",c.getString(2)).put("size",c.getLong(4)).put("kind",c.getString(5)).put("courseId",c.getString(6)).put("resourceId",c.getString(7)).put("updatedAt",c.getLong(8)))
        }}
    }
    fun register(value:String,id:String,name:String,mime:String,file:File,kind:String,course:String,resource:String):JSONObject{
        require(scope()==value&&file.isFile);val now=System.currentTimeMillis()
        val row=ContentValues().apply{put("id",id);put("scope",value);put("name",name);put("mime",mime);put("path",file.canonicalPath);put("size",file.length());put("kind",kind);put("course",course);put("resource",resource);put("updated",now);put("hidden",0)}
        val db=writableDatabase
        if(db.update("items",row,"scope=? AND id=?",arrayOf(value,id))==0)db.insertOrThrow("items",null,row)
        return JSONObject().put("id",id).put("name",name).put("mime",mime).put("size",file.length()).put("kind",kind).put("courseId",course).put("resourceId",resource).put("updatedAt",now)
    }
    fun forget(value:String,id:String){writableDatabase.execSQL("UPDATE items SET hidden=1 WHERE scope=? AND id=?",arrayOf(value,id))}
    fun document(value:String,id:String):File=readableDatabase.rawQuery("SELECT path FROM items WHERE scope=? AND id=? AND hidden=0",arrayOf(value,id)).use{c->
        require(c.moveToFirst()){"文件记录已失效"};val file=File(c.getString(0)).canonicalFile
        val roots=listOf(File(context.filesDir,"exports/attachments/${hash(value)}"),File(context.getExternalFilesDir(android.os.Environment.DIRECTORY_DOWNLOADS),accountHash(org.json.JSONArray(value).getString(0))))
        require(roots.any{file.path.startsWith(it.canonicalPath+File.separator)}&&file.isFile){"文件已丢失，请重新下载"};file
    }
    fun payload(value:String,id:String):JSONObject=readableDatabase.rawQuery("SELECT path,mime,kind FROM items WHERE scope=? AND id=? AND hidden=0",arrayOf(value,id)).use{c->
        require(c.moveToFirst()){ "附件已移除" };val file=File(c.getString(0));require(file.isFile){"文件已丢失，请重新准备"}
        require(c.getString(2)!="file"&&file.length()<=8*1024*1024){"请从课程目录选择原文件，或缩小字幕及截图范围"}
        if(c.getString(1)=="image/jpeg")JSONObject().put("image","data:image/jpeg;base64,"+android.util.Base64.encodeToString(file.readBytes(),android.util.Base64.NO_WRAP))
        else{require(c.getString(1) in listOf("text/plain","application/x-subrip"));val text=Charsets.UTF_8.newDecoder().decode(java.nio.ByteBuffer.wrap(file.readBytes())).toString();JSONObject().put("text",text)}
    }
    fun clearTemporary(value:String):Int{
        val root=File(context.filesDir,"exports/attachments/${hash(value)}").canonicalFile;var removed=0
        writableDatabase.rawQuery("SELECT id,path FROM items WHERE scope=? AND lease<? AND kind!='file'",arrayOf(value,System.currentTimeMillis().toString())).use{c->while(c.moveToNext()){
            val file=File(c.getString(1)).canonicalFile
            if(file.path.startsWith(root.path+File.separator)&&(!file.exists()||file.delete())){writableDatabase.delete("items","scope=? AND id=?",arrayOf(value,c.getString(0)));removed++}
        }};return removed
    }
    companion object { @JvmStatic fun hash(text:String):String=hashBytes(text.toByteArray(Charsets.UTF_8));fun hashBytes(bytes:ByteArray):String=MessageDigest.getInstance("SHA-256").digest(bytes).joinToString(""){"%02x".format(it)} }
}
