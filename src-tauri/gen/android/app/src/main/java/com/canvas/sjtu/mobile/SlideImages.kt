package com.canvas.sjtu.mobile

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.webkit.CookieManager
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors
import java.util.concurrent.ThreadPoolExecutor

/** Only official image URLs, bounded download/decode. No Office runtime or webpage per slide. */
object SlideImages {
    val executor=Executors.newFixedThreadPool(2) as ThreadPoolExecutor
    fun load(value:String,maxSide:Int=2560):Bitmap {
        var url=value
        repeat(5){
            require(SlidePolicy.allowed(url)){"Invalid slide origin"}
            if(Thread.currentThread().isInterrupted)throw InterruptedException()
            val connection=URL(url).openConnection() as HttpURLConnection
            try{
                connection.connectTimeout=12000;connection.readTimeout=15000;connection.instanceFollowRedirects=false
                connection.setRequestProperty("Referer","https://v.sjtu.edu.cn/")
                CookieManager.getInstance().getCookie(url)?.let{connection.setRequestProperty("Cookie",it)}
                val code=connection.responseCode
                if(code in listOf(301,302,303,307,308)){url=URL(URL(url),connection.getHeaderField("Location")?:error("Missing image location")).toString();return@repeat}
                require(code in 200..299&&connection.contentLengthLong<=16L*1024*1024){"Image unavailable"}
                val bytes=connection.inputStream.use{input->val output=java.io.ByteArrayOutputStream();val buffer=ByteArray(16384);while(true){if(Thread.currentThread().isInterrupted)throw InterruptedException();val n=input.read(buffer);if(n<0)break;require(output.size()+n<=16*1024*1024){"Image too large"};output.write(buffer,0,n)};output.toByteArray()}
                val bounds=BitmapFactory.Options().apply{inJustDecodeBounds=true};BitmapFactory.decodeByteArray(bytes,0,bytes.size,bounds)
                require(bounds.outWidth>0&&bounds.outHeight>0&&bounds.outWidth.toLong()*bounds.outHeight<=100_000_000){"Invalid image"}
                var sample=1;while(maxOf(bounds.outWidth,bounds.outHeight)/sample>maxSide)sample*=2
                return BitmapFactory.decodeByteArray(bytes,0,bytes.size,BitmapFactory.Options().apply{inSampleSize=sample;inPreferredConfig=Bitmap.Config.ARGB_8888})?:error("Image decode failed")
            }finally{connection.disconnect()}
        }
        error("Too many image redirects")
    }
}
