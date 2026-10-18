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
    private var fullControls:FullscreenControls?=null
    private var studyLayout:FullscreenStudyLayout?=null
    private var fullWrapper:LinearLayout?=null
    private var slidePage:FullscreenSlides?=null
    private var fullSeek:android.widget.SeekBar?=null
    private var fullTime:TextView?=null
    private var seeking=false
    private var captionView:TextView?=null
    private var captionsEnabled=activity.getSharedPreferences("playback",0).getBoolean("captions-enabled",false)
    private var holdSpeed:HoldSpeed?=null
    private var heldSpeed=1f
    private var holdMessage:TextView?=null
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
    private val sync=object:Runnable{override fun run(){val main=primary;val other=secondary;if(main!=null&&other!=null){if(abs(main.currentPosition-other.currentPosition)>500)other.seekTo(main.currentPosition);other.playWhenReady=main.playWhenReady;other.setPlaybackSpeed(main.playbackParameters.speed)};if(android.os.SystemClock.elapsedRealtime()-lastSavedAt>=5000)savePlayback();updateProgress();slidePage?.updatePosition(primary?.currentPosition?:0);updateCaptions();handler.postDelayed(this,1000)}}
    fun open(value:JSONObject,accountId:String){
        close();args=value;account=accountId;rect=value.getJSONObject("rect");index=0
        val root=LinearLayout(activity).apply{orientation=LinearLayout.VERTICAL;setBackgroundColor(Color.rgb(25,30,24))}
        val screens=LinearLayout(activity).apply{orientation=LinearLayout.HORIZONTAL}
        primaryView=android.view.LayoutInflater.from(activity).inflate(R.layout.lecture_player,null,false) as PlayerView;secondaryView=(android.view.LayoutInflater.from(activity).inflate(R.layout.lecture_player,null,false) as PlayerView).apply{visibility=View.GONE;useController=false}
        screens.addView(primaryView,LinearLayout.LayoutParams(0,-1,1f));screens.addView(secondaryView,LinearLayout.LayoutParams(0,-1,1f));root.addView(screens,LinearLayout.LayoutParams(-1,0,1f))
        root.clipToOutline=true
        root.outlineProvider=object:android.view.ViewOutlineProvider(){override fun getOutline(view:View,outline:android.graphics.Outline){outline.setRoundRect(0,0,view.width,view.height,if(dialog==null)22*activity.resources.displayMetrics.density else 0f)}}
        host=root;decor.addView(root)
        primaryView?.setControllerAutoShow(false);primaryView?.controllerShowTimeoutMs=1800;primaryView?.hideController()
        holdMessage=TextView(activity).apply{text="2× 加速中";textSize=13f;setTextColor(Color.WHITE);gravity=Gravity.CENTER;setPadding(20,10,20,10);background=android.graphics.drawable.GradientDrawable().apply{setColor(0xdd202124.toInt());cornerRadius=24f};visibility=View.GONE}
        captionView=TextView(activity).apply{textSize=16f;setTextColor(Color.WHITE);gravity=Gravity.CENTER;setShadowLayer(3f,0f,1f,Color.BLACK);setPadding(14,7,14,7);setBackgroundColor(0xa6202020.toInt());visibility=View.GONE}
        primaryView?.overlayFrameLayout?.addView(captionView,FrameLayout.LayoutParams(-1,-2,Gravity.BOTTOM).apply{setMargins(12,0,12,12)})
        primaryView?.overlayFrameLayout?.addView(holdMessage,FrameLayout.LayoutParams(-2,-2,Gravity.TOP or Gravity.CENTER_HORIZONTAL).apply{topMargin=(12*activity.resources.displayMetrics.density).roundToInt()})
        holdSpeed=HoldSpeed(primaryView!!,{heldSpeed=primary?.playbackParameters?.speed?:1f;primary?.setPlaybackSpeed(2f);secondary?.setPlaybackSpeed(2f);holdMessage?.visibility=View.VISIBLE},{primary?.setPlaybackSpeed(heldSpeed);secondary?.setPlaybackSpeed(heldSpeed);holdMessage?.visibility=View.GONE},{primaryView?.let{if(it.isControllerFullyVisible)it.hideController()else it.showController()}})

        val saved=activity.getSharedPreferences("playback",0)
        index=saved.getInt(positionKey()+":camera",0).coerceIn(0,args.getJSONArray("tracks").length()-1)
        primary=makePlayer(index);primaryView?.player=primary
        primary?.seekTo(if(value.has("positionMs"))value.optLong("positionMs").coerceAtLeast(0)else saved.getLong(positionKey(),0));primary?.setPlaybackSpeed(saved.getFloat(positionKey()+":speed",1f).coerceIn(.5f,3f))
        primary?.playWhenReady=value.optBoolean("autoplay",true)&&!uiOccluded
        if(saved.getBoolean(positionKey()+":dual",false)&&args.getJSONArray("tracks").length()>1)control(JSONObject().put("action","dual"))
        layout(rect,value.optBoolean("visible",true));handler.post(sync)
    }
    private fun makePlayer(trackIndex:Int):ExoPlayer{
        val track=args.getJSONArray("tracks").getJSONObject(trackIndex);val uri=Uri.parse(track.getString("url"));require(uri.scheme=="https")
        val headers=mutableMapOf<String,String>();track.optJSONObject("headers")?.let{for(k in it.keys())headers[k]=it.getString(k)}
        val player=ExoPlayer.Builder(activity).setMediaSourceFactory(DefaultMediaSourceFactory(DefaultHttpDataSource.Factory().setDefaultRequestProperties(headers).setUserAgent("CanvasMobile/0.2"))).build()
        player.addListener(object:Player.Listener{override fun onIsPlayingChanged(isPlaying:Boolean){updateControls()}
            override fun onPlaybackParametersChanged(parameters:androidx.media3.common.PlaybackParameters){updateControls()}
            override fun onPlayerError(error:PlaybackException){android.widget.Toast.makeText(activity,if(trackIndex!=index)"副机位无法解码，请使用机位切换" else "播放失败，请刷新地址或重新登录",android.widget.Toast.LENGTH_LONG).show();if(trackIndex!=index)stopSecondary()}})
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
        "captions"->{captionsEnabled=!captionsEnabled;activity.getSharedPreferences("playback",0).edit().putBoolean("captions-enabled",captionsEnabled).apply();updateCaptions()}
        "subtitles"->{args.put("subtitles",value.optJSONArray("subtitles")?:org.json.JSONArray());updateCaptions()}
        "documentPrimary"->{require(primary!=null){"请先播放本堂课"};if(dialog==null)toggleFullscreen();studyLayout?.swap()}
        "slides"->{val slides=value.optJSONArray("slides")?:org.json.JSONArray();args.put("slides",slides);if(slidePage!=null)slidePage?.update(slides)else if(dialog!=null&&slides.length()>0){val wrapper=fullWrapper;val root=host;if(wrapper!=null&&root!=null)installStudy(dialog!!,wrapper,root)}}
        "seek"->{require(primary!=null){"请先播放本堂课"};require(!value.has("resourceId")||value.optString("resourceId")==args.optString("resourceId"));val pos=value.optLong("positionMs").coerceAtLeast(0);primary?.seekTo(pos);secondary?.seekTo(pos)}
        "fullscreen"->{require(primary!=null){"请先播放本堂课"};toggleFullscreen()}
        "playPause"->{primary?.let{if(it.isPlaying)pause() else if(!uiOccluded)it.play()}}
        "speed"->{val speed=value.optDouble("speed",1.0).coerceIn(.5,3.0).toFloat();primary?.setPlaybackSpeed(speed);secondary?.setPlaybackSpeed(speed)}
        "camera"->{if(args.getJSONArray("tracks").length()>1){val position=primary?.currentPosition?:0;val speed=primary?.playbackParameters?.speed?:1f;val playing=primary?.playWhenReady?:false;stopSecondary();primary?.release();index=(index+1)%args.getJSONArray("tracks").length();primary=makePlayer(index);primaryView?.player=primary;primary?.seekTo(position);primary?.setPlaybackSpeed(speed);primary?.playWhenReady=playing}}
        "dual"->{if(secondary!=null)stopSecondary() else if(args.getJSONArray("tracks").length()>1){secondary=makePlayer(if(index==0)1 else 0).apply{volume=0f;seekTo(primary?.currentPosition?:0);playWhenReady=primary?.playWhenReady?:false};secondaryView?.player=secondary;secondaryView?.visibility=View.VISIBLE}}
        "play"->if(!uiOccluded)primary?.play()
        "pause"->pause()
        "close"->if(!value.has("resourceId")||value.optString("resourceId")==args.optString("resourceId"))close()
    };updateControls()}
    private fun updateControls(){fullControls?.update(primary?.isPlaying?:false,primary?.playbackParameters?.speed?:1f,secondary!=null,args.optJSONArray("tracks")?.length()?.let{it>1}?:false)}
    private fun updateCaptions(){
        val position=primary?.currentPosition?:0;val lines=args.optJSONArray("subtitles");var text=""
        if(captionsEnabled&&lines!=null){for(i in 0 until lines.length()){val line=lines.optJSONObject(i)?:continue;if(line.optLong("bg")<=position&&line.optLong("ed")>position){text=line.optString("res").take(1500);break}}}
        captionView?.text=text;captionView?.visibility=if(text.isBlank())View.GONE else View.VISIBLE
        fullControls?.captions(captionsEnabled,(lines?.length()?:0)>0)
    }
    private fun updateProgress(){
        val duration=(primary?.duration?:0).coerceAtLeast(0);val position=primary?.currentPosition?:0
        if(!seeking)fullSeek?.progress=if(duration>0)(position*10000/duration).toInt().coerceIn(0,10000)else 0
        fullSeek?.isEnabled=duration>0;fun time(ms:Long):String{val seconds=ms/1000;return "${seconds/60}:${(seconds%60).toString().padStart(2,'0')}"}
        fullTime?.text="${time(position)} / ${time(duration)}"
    }
    private fun question(frame:JSONObject,full:Dialog){pause();full.dismiss();val name=if(frame.has("id"))"canvas-document-question"else"canvas-player-question";findWeb(decor)?.evaluateJavascript("window.dispatchEvent(new CustomEvent('"+name+"',{detail:"+frame.toString()+"}))",null)}
    private fun captureSlide(view:View,window:Window,done:(JSONObject?,String?)->Unit){
        val location=IntArray(2);val bounds=Rect();if(!view.getLocalVisibleRect(bounds)||bounds.width()<2||bounds.height()<2){done(null,"请先显示课件小窗");return};view.getLocationInWindow(location);bounds.offset(location[0],location[1])
        val scale=minOf(1.0,1280.0/maxOf(bounds.width(),bounds.height()));val bitmap=android.graphics.Bitmap.createBitmap((bounds.width()*scale).roundToInt().coerceAtLeast(1),(bounds.height()*scale).roundToInt().coerceAtLeast(1),android.graphics.Bitmap.Config.ARGB_8888)
        val position=slidePage?.questionPosition?:primary?.currentPosition?:0;val resource=args.optString("resourceId")
        try{android.view.PixelCopy.request(window,bounds,bitmap,{result->try{if(result==android.view.PixelCopy.SUCCESS){val output=java.io.ByteArrayOutputStream();bitmap.compress(android.graphics.Bitmap.CompressFormat.JPEG,88,output);done(JSONObject().put("image","data:image/jpeg;base64,"+android.util.Base64.encodeToString(output.toByteArray(),android.util.Base64.NO_WRAP)).put("resourceId",resource).put("positionMs",position),null)}else done(null,"截图未完成，请重试")}finally{bitmap.recycle()}},handler)}catch(_:Exception){bitmap.recycle();done(null,"截图未完成，请重试")}
    }
    private fun installStudy(full:Dialog,wrapper:LinearLayout,root:View):FullscreenStudyLayout{
        studyLayout?.let{wrapper.removeView(it);it.release()}
        var page:EmbeddedDocument.LecturePage?=null
        val slides=FullscreenSlides(activity,args.optJSONArray("slides")?:org.json.JSONArray())
        if(slides.available){slidePage=slides;slides.updatePosition(primary?.currentPosition?:0);page=EmbeddedDocument.LecturePage(slides,"课堂课件",{done->captureSlide(slides.captureView,full.window!!,done)},{slides.dispose();slidePage=null})}else{slides.dispose();page=activity.embeddedDocument.borrowForLecture(args.optString("resourceId"),full.window!!)}
        val document=page
        val stage=FullscreenStudyLayout(activity,root,page){document?.capture?.invoke{frame,error->if(frame!=null)question(frame,full)else android.widget.Toast.makeText(activity,error,android.widget.Toast.LENGTH_SHORT).show()}}
        studyLayout=stage;wrapper.addView(stage,0,LinearLayout.LayoutParams(-1,0,1f));return stage
    }
    private fun toggleFullscreen(){
        if(uiOccluded)return
        if(dialog!=null){dialog?.dismiss();return};val root=host?:return
        oldOrientation=activity.requestedOrientation
        (root.parent as? ViewGroup)?.removeView(root);root.clipBounds=null;root.visibility=View.VISIBLE
        primaryView?.hideController();primaryView?.useController=false
        val full=Dialog(activity,android.R.style.Theme_Black_NoTitleBar_Fullscreen);full.requestWindowFeature(Window.FEATURE_NO_TITLE);dialog=full
        val wrapper=LinearLayout(activity).apply{orientation=LinearLayout.VERTICAL;setBackgroundColor(Color.BLACK)}
        fullWrapper=wrapper;installStudy(full,wrapper,root)
        val progress=LinearLayout(activity).apply{gravity=Gravity.CENTER_VERTICAL;setPadding(16,0,16,0)}
        fullTime=TextView(activity).apply{textSize=12f;setTextColor(Color.LTGRAY);setPadding(8,0,16,0)};progress.addView(fullTime)
        fullSeek=android.widget.SeekBar(activity).apply{max=10000;progressTintList=android.content.res.ColorStateList.valueOf(Color.WHITE);thumbTintList=android.content.res.ColorStateList.valueOf(Color.WHITE);contentDescription="播放进度";setOnSeekBarChangeListener(object:android.widget.SeekBar.OnSeekBarChangeListener{override fun onProgressChanged(bar:android.widget.SeekBar,value:Int,user:Boolean){};override fun onStartTrackingTouch(bar:android.widget.SeekBar){seeking=true};override fun onStopTrackingTouch(bar:android.widget.SeekBar){val duration=primary?.duration?:0;if(duration>0)control(JSONObject().put("action","seek").put("positionMs",duration*bar.progress/10000));seeking=false;updateProgress()}})}
        progress.addView(fullSeek,LinearLayout.LayoutParams(0,(32*activity.resources.displayMetrics.density).roundToInt(),1f));wrapper.addView(progress)
        val toolbar=FullscreenControls(activity){action->try{when(action){
            "exit"->full.dismiss()
            "document"->studyLayout?.toggleSmall()
            "swap"->studyLayout?.swap()
            "speed"->{val speeds=listOf(.75f,1f,1.25f,1.5f,2f);val at=speeds.indexOf(primary?.playbackParameters?.speed?:1f);control(JSONObject().put("action","speed").put("speed",speeds[(at+1)%speeds.size]))}
            "capture"->question(capture(),full)
            else->control(JSONObject().put("action",action))
        }}catch(_:Exception){android.widget.Toast.makeText(activity,"操作未完成，请待画面稳定后重试",android.widget.Toast.LENGTH_SHORT).show()}}
        fullControls=toolbar;wrapper.addView(toolbar);full.setContentView(wrapper)
        androidx.core.view.ViewCompat.setOnApplyWindowInsetsListener(wrapper){view,insets->val bars=insets.getInsets(androidx.core.view.WindowInsetsCompat.Type.systemBars() or androidx.core.view.WindowInsetsCompat.Type.displayCutout());view.setPadding(bars.left,bars.top,bars.right,bars.bottom);androidx.core.view.WindowInsetsCompat.CONSUMED}
        full.setOnDismissListener{studyLayout?.release();studyLayout=null;fullWrapper=null;fullControls=null;fullSeek=null;fullTime=null;seeking=false;dialog=null;primaryView?.useController=true;primaryView?.hideController();activity.requestedOrientation=oldOrientation;decor.addView(root);layout(rect,inlineVisible);activity.embeddedDocument.raiseVisible()}
        full.show();full.window?.let{androidx.core.view.WindowCompat.setDecorFitsSystemWindows(it,false);it.setLayout(-1,-1);it.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)};androidx.core.view.ViewCompat.requestApplyInsets(wrapper);root.invalidateOutline();updateControls();updateProgress();updateCaptions();activity.requestedOrientation=ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
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
    private fun savePlayback(){primary?.let{activity.getSharedPreferences("playback",0).edit().putLong(positionKey(),it.currentPosition).putFloat(positionKey()+":speed",if(holdMessage?.visibility==View.VISIBLE)heldSpeed else it.playbackParameters.speed).putInt(positionKey()+":camera",index).putBoolean(positionKey()+":dual",secondary!=null).apply();lastSavedAt=android.os.SystemClock.elapsedRealtime()}}
    fun pause(){holdSpeed?.cancel();savePlayback();primary?.pause();secondary?.pause()}
    private fun stopSecondary(){secondaryView?.player=null;secondary?.release();secondary=null;secondaryView?.visibility=View.GONE}
    fun close(){handler.removeCallbacks(sync);pause();holdSpeed=null;holdMessage=null;captionView=null;dialog?.dismiss();dialog=null;primaryView?.player=null;primary?.release();primary=null;stopSecondary();host?.let{(it.parent as? ViewGroup)?.removeView(it)};host=null}
}
