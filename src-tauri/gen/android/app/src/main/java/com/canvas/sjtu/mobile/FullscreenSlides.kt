package com.canvas.sjtu.mobile

import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.view.Gravity
import android.view.View
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import org.json.JSONArray
import java.util.concurrent.Future

/** Display the platform's timed slide images directly, reusing one bounded image surface. */
class FullscreenSlides(private val activity:MainActivity,slides:JSONArray):LinearLayout(activity){
    private data class Slide(val image:String,val time:Long?)
    private var rows=parse(slides)
    private fun parse(slides:JSONArray)=(0 until slides.length()).mapNotNull{index->val row=slides.optJSONObject(index)?:return@mapNotNull null;val url=row.optString("image");if(!SlidePolicy.allowed(url))return@mapNotNull null;Slide(url,if(row.isNull("timeMs"))null else row.optLong("timeMs"))}
    private var index=-1;private var following=true;private var lastPosition=0L;private var ticket=0;private var disposed=false
    private var pending:Future<*>?=null;private var bitmap:Bitmap?=null
    private fun dp(n:Int)=(n*resources.displayMetrics.density).toInt()
    val floatingHandle=TextView(activity).apply{text="⠿";textSize=18f;gravity=Gravity.CENTER;setTextColor(Color.rgb(110,120,135));contentDescription="移动课件小窗"}
    private val bar=LinearLayout(activity).apply{gravity=Gravity.CENTER_VERTICAL;setBackgroundColor(Color.rgb(249,250,252));setPadding(dp(3),dp(2),dp(3),dp(2))}
    private val zoomControls by lazy{viewport.controls(true)}
    private var compact=false
    private val image=ImageView(activity).apply{scaleType=ImageView.ScaleType.FIT_CENTER;setBackgroundColor(Color.WHITE);contentDescription="当前课件切片"}
    private val status=TextView(activity).apply{textSize=13f;gravity=Gravity.CENTER;setTextColor(Color.rgb(85,93,108));setBackgroundColor(Color.WHITE);setPadding(24,12,24,12);isClickable=true;setOnClickListener{show(index,true)}}
    private val surface=FrameLayout(activity).apply{addView(image,FrameLayout.LayoutParams(-1,-1));addView(status,FrameLayout.LayoutParams(-1,-1))}
    private val viewport=StudyPreviewViewport(activity,surface,false)
    val captureView:View get()=viewport
    private val caption=TextView(activity).apply{textSize=10f;gravity=Gravity.CENTER;setTextColor(Color.rgb(53,89,194));contentDescription="课件页码，点此切换跟随播放";isClickable=true;isFocusable=true;setOnClickListener{following=!following;if(following)updatePosition(lastPosition);updateCaption()}}
    val available get()=rows.isNotEmpty()
    val questionPosition get()=if(following)lastPosition else rows.getOrNull(index)?.time?:lastPosition
    init{
        orientation=VERTICAL;setBackgroundColor(Color.WHITE);addView(viewport,LayoutParams(-1,0,1f))
        bar.addView(floatingHandle,LayoutParams(dp(20),dp(26)))
        button("‹","上一张课件"){following=false;show((index-1).coerceAtLeast(0))};bar.addView(caption,LayoutParams(dp(32),dp(26)));button("›","下一张课件"){following=false;show((index+1).coerceAtMost(rows.size-1))};bar.addView(zoomControls,LayoutParams(0,dp(30),1f));addView(bar,LayoutParams(-1,dp(34)))
    }
    private fun button(text:String,label:String,run:()->Unit):TextView{
        val view=TextView(activity).apply{this.text=text;textSize=16f;gravity=Gravity.CENTER;setTextColor(Color.rgb(53,68,95));isClickable=true;isFocusable=true;contentDescription=label;background=GradientDrawable().apply{setColor(Color.WHITE);setStroke(dp(1),Color.rgb(226,231,238));cornerRadius=dp(7).toFloat()};setOnClickListener{run()}}
        bar.addView(view,LayoutParams(dp(24),dp(26)).apply{leftMargin=dp(1);rightMargin=dp(1)});return view
    }
    fun floatingActions(swap:()->Unit,question:()->Unit){button("⇄","互换课件与录播",swap);button("✧","课件截图提问",question)}
    fun setCompact(value:Boolean){compact=value;floatingHandle.visibility=if(value)View.VISIBLE else View.GONE;zoomControls.visibility=if(value)View.GONE else View.VISIBLE;bar.layoutParams=LayoutParams(-1,dp(if(value)30 else 34));updateCaption()}
    fun update(slides:JSONArray){val next=parse(slides);if(next==rows)return;val previous=index;rows=next;index=-1;if(rows.isEmpty()){ticket++;pending?.cancel(true);image.setImageDrawable(null);bitmap?.recycle();bitmap=null;status.text="平台暂无可用课件切片";status.visibility=View.VISIBLE;updateCaption()}else if(following)updatePosition(lastPosition)else show(previous.coerceIn(0,rows.lastIndex))}
    fun updatePosition(position:Long){lastPosition=position;if(!following)return;val at=rows.indexOfLast{it.time!=null&&it.time<=position}.coerceAtLeast(0);show(at)}
    private fun updateCaption(){caption.text="${index+1}/${rows.size}";caption.setTextColor(if(following)Color.rgb(53,89,194)else Color.rgb(110,116,128));caption.contentDescription="第 ${index+1} / ${rows.size} 张课件，"+(if(following)"跟随中，点此暂停跟随"else"点此恢复跟随播放")}
    private fun show(at:Int,force:Boolean=false){
        updateCaption()
        if(disposed||(!force&&at==index)||at !in rows.indices)return
        index=at;updateCaption();val current=++ticket;pending?.cancel(true);SlideImages.executor.purge();viewport.fit()
        image.setImageDrawable(null);bitmap?.recycle();bitmap=null;status.text="正在加载课件…";status.visibility=View.VISIBLE
        val url=rows[at].image
        pending=SlideImages.executor.submit{try{val result=SlideImages.load(url);activity.runOnUiThread{if(disposed||ticket!=current)result.recycle()else{bitmap=result;image.setImageBitmap(result);status.visibility=View.GONE}}}catch(_:Exception){activity.runOnUiThread{if(!disposed&&ticket==current){status.text="课件未能加载，点此重试";status.visibility=View.VISIBLE}}}}
    }
    fun dispose(){disposed=true;ticket++;pending?.cancel(true);SlideImages.executor.purge();image.setImageDrawable(null);bitmap?.recycle();bitmap=null}
}
