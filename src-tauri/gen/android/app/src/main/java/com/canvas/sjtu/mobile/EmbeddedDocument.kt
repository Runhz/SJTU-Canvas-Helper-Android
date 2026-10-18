package com.canvas.sjtu.mobile

import android.app.Dialog
import android.content.Context
import android.graphics.Color
import android.graphics.Rect
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import android.webkit.CookieManager
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.TextView
import org.json.JSONArray
import org.json.JSONObject
import kotlin.math.roundToInt

/** Remote documents never receive the Tauri bridge. At most two visible pane sessions. */
class EmbeddedDocument(private val activity:MainActivity){
    private val decor get()=activity.window.decorView as ViewGroup
    private val sessions=linkedMapOf<String,Session>()
    private var occluded=false
    private fun dp(n:Int)=(n*activity.resources.displayMetrics.density).roundToInt()
    private fun owned(scope:String):Boolean=try{val a=SecureStore(activity).activeAccount();val p=JSONArray(scope);a!=null&&p.length()==2&&p.getString(0)==a.optString("accountId")&&p.getString(1)==a.optString("identityId")}catch(_:Exception){false}
    private fun mainWeb(v:View):WebView?{if(v is WebView&&!sessions.values.any{it.web===v})return v;if(v is ViewGroup)for(i in 0 until v.childCount)mainWeb(v.getChildAt(i))?.let{return it};return null}
    fun open(args:JSONObject){
        val id=args.getString("id");require(id.matches(Regex("[A-Za-z0-9-]{1,100}"))&&owned(args.getString("scope")))
        val url=args.getString("url");require(DocumentPolicy.allowedUrl(url,true))
        sessions.remove(id)?.destroy()
        if(sessions.size>=2){val first=sessions.keys.first();sessions.remove(first)?.destroy()}
        val session=Session(id,args.getString("scope"),args.optString("title","文件预览"),args.optString("pane"),args.optString("lectureResourceId"))
        sessions[id]=session;decor.addView(session.host);session.rect=args.getJSONObject("rect");session.visible=args.optBoolean("visible",true);session.layout();session.web.loadUrl(url)
    }
    fun control(args:JSONObject):JSONObject{
        if(args.optString("action")=="occlusion"){occluded=args.optBoolean("obscured");sessions.values.toList().forEach{if(occluded)it.full?.dismiss();it.layout()};return JSONObject()}
        val id=args.getString("id");val s=sessions[id]?:return JSONObject().put("state","closed")
        if(!owned(s.scope)){sessions.remove(id)?.destroy();return JSONObject().put("state","closed")}
        when(args.getString("action")){
            "layout"->{s.rect=args.getJSONObject("rect");s.visible=args.optBoolean("visible",true);s.layout()}
            "reload"->{s.state="loading";s.web.reload()}
            "fullscreen"->s.expand()
            "close"->sessions.remove(id)?.destroy()
        }
        return JSONObject().put("state",s.state).put("progress",s.progress).put("fullscreen",s.full!=null)
    }
    fun pause(){sessions.values.forEach{it.web.onPause()}}
    fun resume(){sessions.values.toList().forEach{if(!owned(it.scope))sessions.remove(it.id)?.destroy()else{it.web.onResume();it.layout()}}}
    fun raiseVisible(){sessions.values.filter{it.full==null&&it.visible&&!occluded}.forEach{it.host.bringToFront()}}
    class LecturePage(val view:View,val title:String,val capture:((JSONObject?,String?)->Unit)->Unit,val release:()->Unit)
    fun borrowForLecture(resourceId:String,window:android.view.Window):LecturePage?{
        val s=sessions.values.lastOrNull{it.lectureResourceId==resourceId&&owned(it.scope)&&it.full==null}?:return null
        s.borrowedWindow=window;(s.host.parent as? ViewGroup)?.removeView(s.host);s.host.clipBounds=null;s.host.visibility=View.VISIBLE
        return LecturePage(s.host,s.title,{done->capture(s.id,done)},{s.borrowedWindow=null;(s.host.parent as? ViewGroup)?.removeView(s.host);if(sessions[s.id]===s&&owned(s.scope)){decor.addView(s.host);s.layout()}})
    }
    fun close(){sessions.values.toList().forEach{it.destroy()};sessions.clear()}
    fun capture(id:String,done:(JSONObject?,String?)->Unit){
        val session=sessions[id]
        if(session==null||!owned(session.scope)||!session.web.isShown||session.state!="ready"){done(null,"预览尚未就绪，请稍后重试");return}
        val lecture=activity.embeddedPlayer.snapshot()
        val window=session.borrowedWindow?:session.full?.window?:activity.window
        val bounds=Rect();if(!session.web.getGlobalVisibleRect(bounds)||bounds.width()<2||bounds.height()<2){done(null,"请先显示需要提问的文件内容");return}
        // Global visible bounds include the preview's zoom, pan and parent clipping.
        val origin=IntArray(2);window.decorView.getLocationOnScreen(origin);bounds.offset(-origin[0],-origin[1])
        val scale=minOf(1.0,1280.0/maxOf(bounds.width(),bounds.height()))
        val bitmap=android.graphics.Bitmap.createBitmap((bounds.width()*scale).roundToInt().coerceAtLeast(1),(bounds.height()*scale).roundToInt().coerceAtLeast(1),android.graphics.Bitmap.Config.ARGB_8888)
        try{android.view.PixelCopy.request(window,bounds,bitmap,{result->
            try{if(result!=android.view.PixelCopy.SUCCESS||!owned(session.scope)||sessions[id]!==session){done(null,"截图未完成，请待画面稳定后重试")}else{
                val output=java.io.ByteArrayOutputStream();bitmap.compress(android.graphics.Bitmap.CompressFormat.JPEG,88,output)
                val frame=JSONObject().put("id",id).put("image","data:image/jpeg;base64,"+android.util.Base64.encodeToString(output.toByteArray(),android.util.Base64.NO_WRAP));if(lecture.optBoolean("opened")){frame.put("videoResourceId",lecture.optString("resourceId")).put("videoPositionMs",lecture.optLong("positionMs"))};done(frame,null)
            }}finally{bitmap.recycle()}
        },android.os.Handler(android.os.Looper.getMainLooper()))}catch(_:Exception){bitmap.recycle();done(null,"截图未完成，请重试")}
    }
    private inner class Session(val id:String,val scope:String,val title:String,val pane:String,val lectureResourceId:String){
        var borrowedWindow:android.view.Window?=null
        private val watchdog=android.os.Handler(android.os.Looper.getMainLooper())
        private val stalled:Runnable=Runnable{if(state=="loading"){state="error";web.stopLoading();problem.text="平台预览连接超时，请重新加载";problem.visibility=View.VISIBLE;loading.visibility=View.GONE}}
        var state="loading";var progress=0;var visible=true;var rect=JSONObject();var full:Dialog?=null
        private val dark=activity.getSharedPreferences("appearance",Context.MODE_PRIVATE).getBoolean("dark",false)
        private val surfaceColor=Color.parseColor(if(dark)"#18191b"else"#ffffff")
        private val ink=Color.parseColor(if(dark)"#edeef0"else"#1c2024")
        val host=FrameLayout(activity).apply{
            setBackgroundColor(surfaceColor);clipToOutline=true
            outlineProvider=object:android.view.ViewOutlineProvider(){override fun getOutline(view:View,outline:android.graphics.Outline){outline.setRoundRect(0,0,view.width,view.height,dp(if(full==null)22 else 0).toFloat())}}
        }
        private val loading:ProgressBar=ProgressBar(activity,null,android.R.attr.progressBarStyleHorizontal).apply{max=100;progressTintList=android.content.res.ColorStateList.valueOf(Color.rgb(62,99,221))}
        private val problem:TextView=TextView(activity).apply{text="预览暂时无法加载，请点上方重新加载";textSize=13f;setTextColor(ink);gravity=Gravity.CENTER;setBackgroundColor(surfaceColor);visibility=View.GONE;setPadding(dp(20),dp(20),dp(20),dp(20))}
        val web:WebView=WebView(activity).apply{
            setBackgroundColor(surfaceColor);settings.javaScriptEnabled=true;settings.domStorageEnabled=true
            settings.allowFileAccess=false;settings.allowContentAccess=false;settings.mixedContentMode=android.webkit.WebSettings.MIXED_CONTENT_NEVER_ALLOW
            settings.useWideViewPort=true;settings.loadWithOverviewMode=true;settings.setSupportZoom(true);settings.builtInZoomControls=true;settings.displayZoomControls=false
            CookieManager.getInstance().setAcceptThirdPartyCookies(this,true)
            setOnTouchListener{_,event->if(event.action==MotionEvent.ACTION_DOWN&&(pane=="left"||pane=="right"))mainWeb(decor)?.evaluateJavascript("window.dispatchEvent(new CustomEvent('canvas-native-focus',{detail:"+JSONObject.quote(pane)+"}))",null);false}
            webChromeClient=object:WebChromeClient(){override fun onProgressChanged(view:WebView,value:Int){this@Session.progress=value;loading.progress=value;loading.visibility=if(value>=100)View.GONE else View.VISIBLE}}
            webViewClient=object:WebViewClient(){
                override fun shouldOverrideUrlLoading(view:WebView,request:WebResourceRequest):Boolean{val allow=DocumentPolicy.allowedNavigation(request.url.toString(),request.isForMainFrame);if(!allow&&request.isForMainFrame)failed();return !allow}
                override fun onPageStarted(view:WebView,url:String,icon:android.graphics.Bitmap?){state="loading";problem.visibility=View.GONE;loading.visibility=View.VISIBLE;watchdog.removeCallbacks(stalled);watchdog.postDelayed(stalled,30000)}
                override fun onPageFinished(view:WebView,url:String){watchdog.removeCallbacks(stalled);if(state!="error")state="ready"}
                override fun onReceivedError(view:WebView,request:WebResourceRequest,error:android.webkit.WebResourceError){if(request.isForMainFrame)failed()}
                override fun onReceivedHttpError(view:WebView,request:WebResourceRequest,response:WebResourceResponse){if(request.isForMainFrame&&response.statusCode>=400)failed()}
                private fun failed(){state="error";problem.visibility=View.VISIBLE;loading.visibility=View.GONE}
            }
        }
        init{host.addView(web,FrameLayout.LayoutParams(-1,-1));host.addView(problem,FrameLayout.LayoutParams(-1,-1));host.addView(loading,FrameLayout.LayoutParams(-1,dp(2),Gravity.TOP))}
        fun layout(){
            if(full!=null||borrowedWindow!=null)return
            val main=mainWeb(decor)?:return
            val scale=main.width/rect.optDouble("viewportWidth",1.0);if(!scale.isFinite()||scale<=0)return
            val webPos=IntArray(2);val parentPos=IntArray(2);main.getLocationOnScreen(webPos);decor.getLocationOnScreen(parentPos)
            val width=(rect.optDouble("width")*scale).roundToInt().coerceAtLeast(1);val height=(rect.optDouble("height")*scale).roundToInt().coerceAtLeast(1)
            host.layoutParams=FrameLayout.LayoutParams(width,height).apply{leftMargin=(rect.optDouble("left")*scale).roundToInt()+webPos[0]-parentPos[0];topMargin=(rect.optDouble("top")*scale).roundToInt()+webPos[1]-parentPos[1]}
            val top=((rect.optDouble("clipTop")-rect.optDouble("top"))*scale).roundToInt().coerceIn(0,height);val bottom=((rect.optDouble("clipBottom")-rect.optDouble("top"))*scale).roundToInt().coerceIn(0,height)
            host.clipBounds=Rect(0,top,width,bottom);host.visibility=if(visible&&!occluded&&bottom>top&&owned(scope))View.VISIBLE else View.INVISIBLE;host.invalidateOutline()
        }
        fun expand(){
            if(full!=null||borrowedWindow!=null||occluded)return
            (host.parent as? ViewGroup)?.removeView(host);host.clipBounds=null;host.visibility=View.VISIBLE
            val dialog=Dialog(activity,if(dark)android.R.style.Theme_Material_NoActionBar else android.R.style.Theme_Material_Light_NoActionBar)
            full=dialog;val root=LinearLayout(activity).apply{orientation=LinearLayout.VERTICAL;setBackgroundColor(surfaceColor)}
            val bar=LinearLayout(activity).apply{gravity=Gravity.CENTER_VERTICAL;setPadding(dp(12),dp(8),dp(12),dp(8))}
            bar.addView(TextView(activity).apply{text=title;textSize=15f;setTextColor(ink);maxLines=2;ellipsize=android.text.TextUtils.TruncateAt.END},LinearLayout.LayoutParams(0,-2,1f))
            bar.addView(TextView(activity).apply{text="问这里";textSize=14f;setTextColor(Color.rgb(62,99,221));gravity=Gravity.CENTER;setPadding(dp(16),0,dp(16),0);minHeight=dp(48);isClickable=true;isFocusable=true;setOnClickListener{isEnabled=false;capture(this@Session.id){result,error->isEnabled=true;if(result!=null){dialog.dismiss();mainWeb(decor)?.evaluateJavascript("window.dispatchEvent(new CustomEvent('canvas-document-question',{detail:"+result.toString()+"}))",null)}else android.widget.Toast.makeText(activity,error,android.widget.Toast.LENGTH_SHORT).show()}}},LinearLayout.LayoutParams(-2,dp(48)))
            bar.addView(TextView(activity).apply{text="收起";textSize=14f;setTextColor(ink);gravity=Gravity.CENTER;setPadding(dp(18),0,dp(18),0);minHeight=dp(48);isClickable=true;isFocusable=true;setOnClickListener{dialog.dismiss()}},LinearLayout.LayoutParams(-2,dp(48)))
            androidx.core.view.ViewCompat.setOnApplyWindowInsetsListener(root){view,insets->val bars=insets.getInsets(androidx.core.view.WindowInsetsCompat.Type.systemBars() or androidx.core.view.WindowInsetsCompat.Type.displayCutout());view.setPadding(bars.left,bars.top,bars.right,bars.bottom);androidx.core.view.WindowInsetsCompat.CONSUMED}
            val viewport=StudyPreviewViewport(activity,host)
            root.addView(bar);root.addView(viewport,LinearLayout.LayoutParams(-1,0,1f));root.addView(viewport.controls());dialog.setContentView(root)
            dialog.setOnDismissListener{viewport.detachContent();full=null;if(owned(scope)){decor.addView(host);layout()}}
            dialog.show();dialog.window?.let{androidx.core.view.WindowCompat.setDecorFitsSystemWindows(it,false);it.setLayout(-1,-1)};androidx.core.view.ViewCompat.requestApplyInsets(root);host.invalidateOutline()
        }
        fun destroy(){watchdog.removeCallbacks(stalled);full?.setOnDismissListener(null);full?.dismiss();full=null;(host.parent as? ViewGroup)?.removeView(host);web.stopLoading();web.webChromeClient=null;web.webViewClient=WebViewClient();web.destroy()}
    }
}
