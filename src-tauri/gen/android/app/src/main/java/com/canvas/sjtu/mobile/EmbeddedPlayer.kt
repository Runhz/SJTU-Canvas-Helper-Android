package com.canvas.sjtu.mobile

import android.app.Dialog
import android.content.pm.ActivityInfo
import android.graphics.Color
import android.graphics.Rect
import android.net.Uri
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.Window
import android.view.WindowManager
import android.webkit.WebView
import android.widget.Button
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.ui.PlayerView
import org.json.JSONObject
import kotlin.math.abs
import kotlin.math.roundToInt

/** One native player stays attached to the learning page and is reparented for fullscreen. */
class EmbeddedPlayer(private val activity:MainActivity){
    private val decor get()=activity.window.decorView as ViewGroup
    private var host:LinearLayout?=null
    private var primary:ExoPlayer?=null
    private var secondary:ExoPlayer?=null
    private var primaryView:PlayerView?=null
    private var secondaryView:PlayerView?=null
    private var dialog:Dialog?=null
    private var args=JSONObject()
    private var rect=JSONObject()
    private var account=""
    private var index=0
    // Keep dialog occlusion independent of geometry and player lifetime. A late
    // open/layout callback must not put native video back above a web dialog.
    private var uiOccluded=false
    private var inlineVisible=true
    private var lastSavedAt=0L
    private var oldOrientation=ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED
    private val handler=android.os.Handler(android.os.Looper.getMainLooper())
    private val sync=object:Runnable{override fun run(){val main=primary;val other=secondary;if(main!=null&&other!=null){if(abs(main.currentPosition-other.currentPosition)>500)other.seekTo(main.currentPosition);other.playWhenReady=main.playWhenReady;other.setPlaybackSpeed(main.playbackParameters.speed)};if(android.os.SystemClock.elapsedRealtime()-lastSavedAt>=5000)savePlayback();handler.postDelayed(this,1000)}}
    fun open(value:JSONObject,accountId:String){
        close();args=value;account=accountId;rect=value.getJSONObject("rect");index=0
        val root=LinearLayout(activity).apply{orientation=LinearLayout.VERTICAL;setBackgroundColor(Color.rgb(25,30,24))}
        val screens=LinearLayout(activity).apply{orientation=LinearLayout.HORIZONTAL}
        primaryView=android.view.LayoutInflater.from(activity).inflate(R.layout.lecture_player,null,false) as PlayerView;secondaryView=(android.view.LayoutInflater.from(activity).inflate(R.layout.lecture_player,null,false) as PlayerView).apply{visibility=View.GONE;useController=false}
        screens.addView(primaryView,LinearLayout.LayoutParams(0,-1,1f));screens.addView(secondaryView,LinearLayout.LayoutParams(0,-1,1f));root.addView(screens,LinearLayout.LayoutParams(-1,0,1f))
        root.clipToOutline=true
        root.outlineProvider=object:android.view.ViewOutlineProvider(){override fun getOutline(view:View,outline:android.graphics.Outline){outline.setRoundRect(0,0,view.width,view.height,if(dialog==null)22*activity.resources.displayMetrics.density else 0f)}}
        host=root;decor.addView(root)
        val saved=activity.getSharedPreferences("playback",0)
        index=saved.getInt(positionKey()+":camera",0).coerceIn(0,args.getJSONArray("tracks").length()-1)
        primary=makePlayer(index);primaryView?.player=primary
        primary?.seekTo(saved.getLong(positionKey(),0));primary?.setPlaybackSpeed(saved.getFloat(positionKey()+":speed",1f).coerceIn(.5f,3f))
        primary?.playWhenReady=value.optBoolean("autoplay",true)&&!uiOccluded
        if(saved.getBoolean(positionKey()+":dual",false)&&args.getJSONArray("tracks").length()>1)control(JSONObject().put("action","dual"))
        layout(rect,value.optBoolean("visible",true));handler.post(sync)
    }
    private fun makePlayer(trackIndex:Int):ExoPlayer{
        val track=args.getJSONArray("tracks").getJSONObject(trackIndex);val uri=Uri.parse(track.getString("url"));require(uri.scheme=="https")
        val headers=mutableMapOf<String,String>();track.optJSONObject("headers")?.let{for(k in it.keys())headers[k]=it.getString(k)}
        val player=ExoPlayer.Builder(activity).setMediaSourceFactory(DefaultMediaSourceFactory(DefaultHttpDataSource.Factory().setDefaultRequestProperties(headers).setUserAgent("CanvasMobile/0.2"))).build()
        player.addListener(object:Player.Listener{override fun onPlayerError(error:PlaybackException){android.widget.Toast.makeText(activity,if(trackIndex!=index)"副机位无法解码，请使用机位切换" else "播放失败，请刷新地址或重新登录",android.widget.Toast.LENGTH_LONG).show();if(trackIndex!=index)stopSecondary()}})
        player.setMediaItem(MediaItem.fromUri(uri));player.prepare();return player
    }
    private fun findWeb(view:View):WebView?{if(view is WebView)return view;if(view is ViewGroup)for(i in 0 until view.childCount){findWeb(view.getChildAt(i))?.let{return it}};return null}
    fun layout(value:JSONObject,visible:Boolean){
        rect=value;inlineVisible=visible;if(dialog!=null)return
        val root=host?:return;val web=findWeb(decor)?:return
        val scale=web.width/value.optDouble("viewportWidth",1.0);if(!scale.isFinite()||scale<=0)return
        val webLocation=IntArray(2);val parentLocation=IntArray(2);web.getLocationOnScreen(webLocation);decor.getLocationOnScreen(parentLocation)
        val width=(value.optDouble("width")*scale).roundToInt();val height=(value.optDouble("height")*scale).roundToInt()
        root.layoutParams=FrameLayout.LayoutParams(width.coerceAtLeast(1),height.coerceAtLeast(1)).apply{leftMargin=(value.optDouble("left")*scale).roundToInt()+webLocation[0]-parentLocation[0];topMargin=(value.optDouble("top")*scale).roundToInt()+webLocation[1]-parentLocation[1]}
        val clipTop=((value.optDouble("clipTop")-value.optDouble("top"))*scale).roundToInt().coerceIn(0,height.coerceAtLeast(0));val clipBottom=((value.optDouble("clipBottom")-value.optDouble("top"))*scale).roundToInt().coerceIn(0,height.coerceAtLeast(0))
        root.clipBounds=Rect(0,clipTop,width.coerceAtLeast(0),clipBottom);root.invalidateOutline()
        root.visibility=if(visible&&!uiOccluded&&clipBottom>clipTop)View.VISIBLE else View.INVISIBLE
        if(!visible||uiOccluded)pause()
    }
    fun control(value:JSONObject){if(value.has("resourceId")&&value.optString("resourceId")!=args.optString("resourceId"))return;when(value.getString("action")){
        "occlusion"->{uiOccluded=value.optBoolean("obscured");if(uiOccluded){pause();dialog?.dismiss()};layout(rect,inlineVisible)}
        "layout"->layout(value.getJSONObject("rect"),value.optBoolean("visible",true))
        "seek"->{require(primary!=null){"请先播放本堂课"};require(!value.has("resourceId")||value.optString("resourceId")==args.optString("resourceId"));val pos=value.optLong("positionMs").coerceAtLeast(0);primary?.seekTo(pos);secondary?.seekTo(pos)}
        "fullscreen"->{require(primary!=null){"请先播放本堂课"};toggleFullscreen()}
        "playPause"->{primary?.let{if(it.isPlaying)pause() else if(!uiOccluded)it.play()}}
        "speed"->{val speed=value.optDouble("speed",1.0).coerceIn(.5,3.0).toFloat();primary?.setPlaybackSpeed(speed);secondary?.setPlaybackSpeed(speed)}
        "camera"->{if(args.getJSONArray("tracks").length()>1){val position=primary?.currentPosition?:0;val speed=primary?.playbackParameters?.speed?:1f;val playing=primary?.playWhenReady?:false;stopSecondary();primary?.release();index=(index+1)%args.getJSONArray("tracks").length();primary=makePlayer(index);primaryView?.player=primary;primary?.seekTo(position);primary?.setPlaybackSpeed(speed);primary?.playWhenReady=playing}}
        "dual"->{if(secondary!=null)stopSecondary() else if(args.getJSONArray("tracks").length()>1){secondary=makePlayer(if(index==0)1 else 0).apply{volume=0f;seekTo(primary?.currentPosition?:0);playWhenReady=primary?.playWhenReady?:false};secondaryView?.player=secondary;secondaryView?.visibility=View.VISIBLE}}
        "pause"->pause()
        "close"->if(!value.has("resourceId")||value.optString("resourceId")==args.optString("resourceId"))close()
    }}
    private fun toggleFullscreen(){
        if(uiOccluded)return
        if(dialog!=null){dialog?.dismiss();return};val root=host?:return
        oldOrientation=activity.requestedOrientation
        (root.parent as? ViewGroup)?.removeView(root);root.clipBounds=null;root.visibility=View.VISIBLE;root.invalidateOutline()
        val full=Dialog(activity,android.R.style.Theme_Black_NoTitleBar_Fullscreen);full.requestWindowFeature(Window.FEATURE_NO_TITLE);full.setContentView(root,ViewGroup.LayoutParams(-1,-1));dialog=full
        full.setOnDismissListener{(root.parent as? ViewGroup)?.removeView(root);dialog=null;activity.requestedOrientation=oldOrientation;decor.addView(root);layout(rect,inlineVisible)}
        full.show();full.window?.setLayout(-1,-1);full.window?.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);activity.requestedOrientation=ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
    }
    private fun positionKey()="${accountHash(account)}:${args.optString("resourceId")}"
    fun snapshot()=JSONObject().put("opened",primary!=null).put("positionMs",primary?.currentPosition?:0).put("durationMs",(primary?.duration?:0).coerceAtLeast(0)).put("playing",primary?.isPlaying?:false).put("fullscreen",dialog!=null).put("dual",secondary!=null).put("resourceId",args.optString("resourceId")).put("speed",primary?.playbackParameters?.speed?:1f).put("camera",index).put("state",primary?.playbackState?:Player.STATE_IDLE)
    fun capture():JSONObject {
        require(primary!=null){"请先播放本堂课"}
        require(primary?.playbackState==Player.STATE_READY||primary?.playbackState==Player.STATE_ENDED){"视频正在缓冲，请稍后截图"}
        val texture=primaryView?.videoSurfaceView as? android.view.TextureView ?: error("当前播放器无法截图")
        require(texture.isAvailable){"视频画面尚未就绪"}
        val source=texture.bitmap ?: error("尚未获取到视频画面")
        val scale=(1280f/maxOf(source.width,source.height)).coerceAtMost(1f)
        val image=if(scale<1f)android.graphics.Bitmap.createScaledBitmap(source,(source.width*scale).roundToInt().coerceAtLeast(1),(source.height*scale).roundToInt().coerceAtLeast(1),true)else source
        val output=java.io.ByteArrayOutputStream();image.compress(android.graphics.Bitmap.CompressFormat.JPEG,88,output)
        if(image!==source)image.recycle();source.recycle()
        return JSONObject().put("image","data:image/jpeg;base64,"+android.util.Base64.encodeToString(output.toByteArray(),android.util.Base64.NO_WRAP)).put("positionMs",primary?.currentPosition?:0).put("resourceId",args.optString("resourceId"))
    }
    private fun savePlayback(){primary?.let{activity.getSharedPreferences("playback",0).edit().putLong(positionKey(),it.currentPosition).putFloat(positionKey()+":speed",it.playbackParameters.speed).putInt(positionKey()+":camera",index).putBoolean(positionKey()+":dual",secondary!=null).apply();lastSavedAt=android.os.SystemClock.elapsedRealtime()}}
    fun pause(){savePlayback();primary?.pause();secondary?.pause()}
    private fun stopSecondary(){secondaryView?.player=null;secondary?.release();secondary=null;secondaryView?.visibility=View.GONE}
    fun close(){handler.removeCallbacks(sync);pause();dialog?.dismiss();dialog=null;primaryView?.player=null;primary?.release();primary=null;stopSecondary();host?.let{(it.parent as? ViewGroup)?.removeView(it)};host=null}
}
