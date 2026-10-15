package com.canvas.sjtu.mobile

import android.app.Activity
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.webkit.CookieManager
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast

/** Official login only. No JavaScript interfaces, password inspection or TLS-error overrides. */
class LoginActivity: Activity() {
    private lateinit var web: WebView
    override fun onCreate(savedInstanceState:Bundle?){
        super.onCreate(savedInstanceState)
        val root=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;setBackgroundColor(Color.WHITE);setPadding(0,36,0,12)}
        val title=TextView(this).apply{text="交大本部 · 官方身份验证";textSize=17f;setTextColor(Color.rgb(65,65,65));setPadding(28,18,28,18)}
        val hint=TextView(this).apply{text="在官方页面完成登录后，点击下方按钮验证。";textSize=12f;setPadding(28,0,28,18)}
        root.addView(title);root.addView(hint)
        web=WebView(this).apply{
            settings.javaScriptEnabled=true;settings.domStorageEnabled=true;settings.allowFileAccess=false;settings.allowContentAccess=false;settings.mixedContentMode=android.webkit.WebSettings.MIXED_CONTENT_NEVER_ALLOW
            webViewClient=object:WebViewClient(){
                override fun shouldOverrideUrlLoading(view:WebView,request:WebResourceRequest):Boolean{
                    val uri=request.url;val host=uri.host?:return true
                    return uri.scheme!="https" || !(host=="sjtu.edu.cn"||host.endsWith(".sjtu.edu.cn"))
                }
            }
        }
        CookieManager.getInstance().setAcceptCookie(true);CookieManager.getInstance().setAcceptThirdPartyCookies(web,true)
        root.addView(web,LinearLayout.LayoutParams(-1,0,1f))
        root.addView(Button(this).apply{text="我已完成登录，返回验证";setOnClickListener{
            val cookie=CookieManager.getInstance().getCookie("https://jaccount.sjtu.edu.cn")?.split(";")?.map{it.trim()}?.firstOrNull{it.startsWith("JAAuthCookie=")}
            if(cookie.isNullOrBlank())Toast.makeText(this@LoginActivity,"尚未检测到登录凭据，请先在官方页面完成登录",Toast.LENGTH_LONG).show()
            else{CookieManager.getInstance().flush();setResult(RESULT_OK,Intent().putExtra("cookie",cookie));finish()}
        }})
        setContentView(root)
        val requested=intent.getStringExtra("url")?:"https://my.sjtu.edu.cn/ui/appmyinfo"
        val uri=Uri.parse(requested)
        val valid=requested=="https://my.sjtu.edu.cn/ui/appmyinfo" || (uri.scheme=="https" && uri.host=="jaccount.sjtu.edu.cn" && uri.path=="/jaccount/confirmscancode")
        web.loadUrl(if(valid)requested else "https://my.sjtu.edu.cn/ui/appmyinfo")
    }
    @Deprecated("Deprecated in Java") override fun onBackPressed(){if(web.canGoBack())web.goBack()else super.onBackPressed()}
    override fun onDestroy(){web.destroy();super.onDestroy()}
}
