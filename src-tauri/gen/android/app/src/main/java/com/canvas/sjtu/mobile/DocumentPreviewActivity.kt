package com.canvas.sjtu.mobile

import android.app.Activity
import android.content.Intent
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.graphics.drawable.RippleDrawable
import android.content.res.ColorStateList
import android.net.Uri
import android.os.Bundle
import android.view.ViewGroup
import android.view.View
import android.view.Gravity
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.webkit.CookieManager
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.content.FileProvider
import java.io.File

/** On-demand official Canvas document viewer, without the application bridge. */
class DocumentPreviewActivity:Activity(){
    private var viewer:WebView?=null
    private var scope=""
    private fun dp(value:Int)=(value*resources.displayMetrics.density+.5f).toInt()
    private fun surface(color:Int,radius:Int,line:Int?=null)=GradientDrawable().apply{setColor(color);cornerRadius=dp(radius).toFloat();if(line!=null)setStroke(dp(1),line)}
    override fun onCreate(savedInstanceState:Bundle?){
        super.onCreate(savedInstanceState);scope=intent.getStringExtra("scope")?:""
        val uri=Uri.parse(intent.getStringExtra("url")?:"")
        if(!owned()||!DocumentPolicy.allowedUrl(uri.toString(),true)){finish();return}
        val dark=getSharedPreferences("appearance",MODE_PRIVATE).getBoolean("dark",false)
        val bg=Color.parseColor(if(dark)"#111113"else"#f9f9fb")
        val card=Color.parseColor(if(dark)"#18191b"else"#ffffff")
        val soft=Color.parseColor(if(dark)"#212225"else"#f0f0f3")
        val line=Color.parseColor(if(dark)"#2e3135"else"#e8e8ec")
        val ink=Color.parseColor(if(dark)"#edeef0"else"#1c2024")
        val muted=Color.parseColor(if(dark)"#b0b4ba"else"#60646c")
        val accent=Color.parseColor(if(dark)"#9eb1ff"else"#3a5bc7")
        WindowCompat.setDecorFitsSystemWindows(window,false)
        WindowCompat.getInsetsController(window,window.decorView).apply{isAppearanceLightStatusBars=!dark;isAppearanceLightNavigationBars=!dark}
        val root=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;setBackgroundColor(bg)}
        ViewCompat.setOnApplyWindowInsetsListener(root){view,insets->
            val bars=insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout())
            view.setPadding(bars.left+dp(16),bars.top+dp(8),bars.right+dp(16),bars.bottom+dp(8));WindowInsetsCompat.CONSUMED
        }
        fun action(label:String,run:()->Unit)=TextView(this).apply{
            text=label;textSize=12f;setTextColor(accent);gravity=Gravity.CENTER;setPadding(dp(14),0,dp(14),0);minHeight=dp(44)
            isFocusable=true;isClickable=true;background=RippleDrawable(ColorStateList.valueOf(0x203e63dd),surface(soft,14),null);setOnClickListener{run()}
        }
        val bar=LinearLayout(this).apply{gravity=Gravity.CENTER_VERTICAL}
        val title=TextView(this).apply{text=intent.getStringExtra("title")?:"文件预览";textSize=15f;setTextColor(ink);maxLines=2;ellipsize=android.text.TextUtils.TruncateAt.END;setPadding(dp(12),0,0,0)}
        bar.addView(action("返回"){finish()},LinearLayout.LayoutParams(-2,dp(44)));bar.addView(title,LinearLayout.LayoutParams(0,dp(56),1f));root.addView(bar,LinearLayout.LayoutParams(-1,dp(60)))
        val status=TextView(this).apply{text="正在打开平台预览…";textSize=12f;maxLines=2;setPadding(dp(4),dp(12),dp(4),0);setTextColor(muted);accessibilityLiveRegion=View.ACCESSIBILITY_LIVE_REGION_POLITE}
        val downloaded=intent.getStringExtra("downloadPath")
        var fallbackAttempted=false
        fun openDownloaded(){
            if(downloaded.isNullOrBlank()||!owned())return
            fallbackAttempted=true
            try{val file=File(downloaded).canonicalFile;val account=SecureStore(this).activeAccount()?:return;val folder=File(getExternalFilesDir(android.os.Environment.DIRECTORY_DOWNLOADS),accountHash(account.getString("accountId"))).canonicalFile;require(file.isFile&&file.path.startsWith(folder.path+File.separator));val uri=FileProvider.getUriForFile(this,"$packageName.fileprovider",file);startActivity(Intent(Intent.ACTION_VIEW).setDataAndType(uri,intent.getStringExtra("mime")?:"application/octet-stream").addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION));finish()}catch(_:Exception){status.text="请安装兼容的文件阅读器，或返回下载页分享文件"}
        }
        val retry=action("重新加载"){status.text="正在打开平台预览…";viewer?.reload()}
        val stage=FrameLayout(this);val shell=FrameLayout(this).apply{background=surface(card,22,line);clipToOutline=true}
        var expanded=false
        fun sizePreview(){val height=if(expanded)stage.height else minOf(stage.height,maxOf(dp(180),minOf(dp(420),(stage.height*.72f).toInt())));if(shell.layoutParams!=null&&shell.layoutParams.height!=height)shell.layoutParams=shell.layoutParams.apply{this.height=height}}
        val expand=action("放大阅读"){}
        expand.setOnClickListener{expanded=!expanded;expand.text=if(expanded)"收起预览"else"放大阅读";sizePreview()}
        val caption=LinearLayout(this).apply{gravity=Gravity.CENTER_VERTICAL}
        caption.addView(TextView(this).apply{text="官方预览";textSize=12f;setTextColor(muted)},LinearLayout.LayoutParams(0,-2,1f))
        caption.addView(expand,LinearLayout.LayoutParams(-2,dp(44)));root.addView(caption,LinearLayout.LayoutParams(-1,dp(54)))
        viewer=WebView(this).apply{
            setBackgroundColor(card);isVerticalScrollBarEnabled=false;isHorizontalScrollBarEnabled=false
            settings.javaScriptEnabled=true;settings.domStorageEnabled=true
            settings.allowFileAccess=false;settings.allowContentAccess=false;settings.mixedContentMode=android.webkit.WebSettings.MIXED_CONTENT_NEVER_ALLOW
            settings.setSupportZoom(true);settings.builtInZoomControls=true;settings.displayZoomControls=false;settings.useWideViewPort=true;settings.loadWithOverviewMode=true
            // Official document viewers may use their own authenticated subframes.
            CookieManager.getInstance().setAcceptThirdPartyCookies(this,true)
            webViewClient=object:WebViewClient(){
                override fun shouldOverrideUrlLoading(view:WebView,request:WebResourceRequest):Boolean{
                    val target=request.url;val trusted=DocumentPolicy.allowedUrl(target.toString(),false)
                    if(!trusted&&request.isForMainFrame){failed=true;status.text="此链接无法预览，可使用外部应用打开";if(!fallbackAttempted)openDownloaded()}
                    return !trusted
                }
                private var failed=false
                override fun onPageStarted(view:WebView,url:String,favicon:android.graphics.Bitmap?){failed=false;status.text="正在打开课件…"}
                override fun onPageFinished(view:WebView,url:String){if(!failed)status.text=if(Uri.parse(url).host=="wps-xz.sjtu.edu.cn")"交大 WPS · 官方预览"else"Canvas · 官方预览"}
                override fun onReceivedError(view:WebView,request:WebResourceRequest,error:android.webkit.WebResourceError){if(request.isForMainFrame){failed=true;status.text="加载失败，可重新加载或使用外部应用打开";if(!fallbackAttempted)openDownloaded()}}
                override fun onReceivedHttpError(view:WebView,request:WebResourceRequest,response:android.webkit.WebResourceResponse){if(request.isForMainFrame&&response.statusCode>=400){failed=true;status.text="官方预览暂不可用，可使用外部应用打开";if(!fallbackAttempted)openDownloaded()}}
            }
            // No JavascriptInterface, file chooser or remote-to-native application calls.
        }
        shell.addView(viewer,FrameLayout.LayoutParams(-1,-1));stage.addView(shell,FrameLayout.LayoutParams(-1,-1))
        stage.addOnLayoutChangeListener{_,_,_,_,_,_,_,_,_->sizePreview()}
        root.addView(stage,LinearLayout.LayoutParams(-1,0,1f))
        val footer=LinearLayout(this).apply{gravity=Gravity.CENTER_VERTICAL}
        footer.addView(status,LinearLayout.LayoutParams(0,dp(52),1f));if(!downloaded.isNullOrBlank())footer.addView(action("外部打开"){openDownloaded()},LinearLayout.LayoutParams(-2,dp(44)));footer.addView(retry,LinearLayout.LayoutParams(-2,dp(44)));root.addView(footer)
        setContentView(root);ViewCompat.requestApplyInsets(root);viewer?.loadUrl(uri.toString())
    }
    private fun owned():Boolean{val account=SecureStore(this).activeAccount()?:return false;return try{val parts=org.json.JSONArray(scope);parts.length()==2&&parts.getString(0)==account.optString("accountId")&&parts.getString(1)==account.optString("identityId")}catch(_:Exception){false}}
    override fun onResume(){super.onResume();if(!owned())finish();viewer?.onResume()}
    override fun onPause(){viewer?.onPause();super.onPause()}
    override fun onDestroy(){viewer?.let{(it.parent as? ViewGroup)?.removeView(it);it.stopLoading();it.destroy()};viewer=null;super.onDestroy()}
}
