package com.canvas.sjtu.mobile

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.drawable.GradientDrawable
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import kotlin.math.roundToInt

/** Explicit parallel / picture-in-picture / single modes, sharing the existing surfaces. */
class FullscreenStudyLayout(context:Context,private val video:View,private val page:EmbeddedDocument.LecturePage?,private val question:()->Unit):FrameLayout(context){
    private fun dp(n:Int)=(n*resources.displayMetrics.density).roundToInt()
    private val preferences=context.getSharedPreferences("lecture-layout-v3",0)
    private val area=FrameLayout(context)
    private val menu=LinearLayout(context).apply{gravity=Gravity.CENTER_VERTICAL;setBackgroundColor(Color.rgb(24,25,27));setPadding(dp(6),0,dp(6),0)}
    private val videoCard=FrameLayout(context)
    private val documentCard=LinearLayout(context).apply{orientation=LinearLayout.VERTICAL;setBackgroundColor(Color.WHITE)}
    private val documentBar=LinearLayout(context).apply{gravity=Gravity.CENTER_VERTICAL;setBackgroundColor(Color.rgb(239,242,248))}
    private val videoBar=TextView(context).apply{text="⠿";contentDescription="移动录播小窗";textSize=18f;setTextColor(Color.WHITE);setPadding(dp(8),0,dp(8),0);gravity=Gravity.CENTER_VERTICAL;setBackgroundColor(0xcc18202e.toInt())}
    private val divider=FrameLayout(context).apply{contentDescription="左右拖动调整录播与课件比例";addView(View(context).apply{background=GradientDrawable().apply{setColor(Color.rgb(127,140,165));cornerRadius=dp(2).toFloat()}},LayoutParams(dp(4),dp(56),Gravity.CENTER))}
    private val resize=object:View(context){private val paint=Paint(Paint.ANTI_ALIAS_FLAG).apply{color=Color.WHITE;strokeWidth=dp(2).toFloat();strokeCap=Paint.Cap.ROUND};override fun onDraw(canvas:Canvas){val w=width.toFloat();val h=height.toFloat();canvas.drawLine(w-dp(16),h-dp(5),w-dp(5),h-dp(16),paint);canvas.drawLine(w-dp(10),h-dp(5),w-dp(5),h-dp(10),paint)}}.apply{contentDescription="拖动右下角调整小窗大小";background=GradientDrawable().apply{setColor(0xe6354260.toInt());cornerRadius=dp(12).toFloat()};isFocusable=true}
    private val modes=linkedMapOf<String,TextView>()
    private var mode=preferences.getString("mode","parallel").takeIf{it in listOf("parallel","pip","single")}?:"parallel"
    private var swapped=false;private var ratio=PreviewGeometry.ratio(preferences.getFloat("ratio",.55f))
    private var box=floatArrayOf(preferences.getFloat("x",.64f),preferences.getFloat("y",.04f),preferences.getFloat("w",.34f),preferences.getFloat("h",.44f))
    private var borrowedViewport:StudyPreviewViewport?=null
    init{
        setBackgroundColor(Color.BLACK);addView(area,LayoutParams(-1,-1).apply{topMargin=if(page==null)0 else dp(32)})
        videoCard.addView(video,LayoutParams(-1,-1));videoCard.addView(videoBar,LayoutParams(-1,dp(36),Gravity.TOP));area.addView(videoCard)
        if(page!=null){
            for((id,label) in listOf("parallel" to "并排","pip" to "小窗","single" to "单页")){val button=action(label){mode=id;save();place()};modes[id]=button;menu.addView(button,LinearLayout.LayoutParams(0,dp(30),1f).apply{marginEnd=dp(4)})}
            menu.addView(action("⇄"){swap()}.apply{contentDescription="互换课件与录播"},LinearLayout.LayoutParams(dp(36),dp(28)).apply{marginEnd=dp(4)});menu.addView(action("✧",question).apply{contentDescription="课件截图提问"},LinearLayout.LayoutParams(dp(36),dp(28)));addView(menu,LayoutParams(-1,dp(32)))
            val title=TextView(context).apply{text="⠿";contentDescription="移动课件小窗";textSize=18f;setTextColor(Color.rgb(75,85,105));gravity=Gravity.CENTER}
            documentBar.addView(title,LinearLayout.LayoutParams(0,dp(28),1f));documentBar.addView(action("−"){scaleBox(.85f)},LinearLayout.LayoutParams(dp(28),dp(28)));documentBar.addView(action("+"){scaleBox(1.15f)},LinearLayout.LayoutParams(dp(28),dp(28)));documentBar.addView(action("⇄"){swap()}.apply{contentDescription="互换课件与录播"},LinearLayout.LayoutParams(dp(28),dp(28)));documentBar.addView(action("✧",question).apply{contentDescription="课件截图提问"},LinearLayout.LayoutParams(dp(28),dp(28)));documentCard.addView(documentBar)
            if(page.view is FullscreenSlides){documentCard.addView(page.view,LinearLayout.LayoutParams(-1,0,1f));page.view.floatingActions({swap()},question);gesture(page.view.floatingHandle,false)}
            else{val preview=StudyPreviewViewport(context,page.view);borrowedViewport=preview;documentCard.addView(preview,LinearLayout.LayoutParams(-1,0,1f))}
            area.addView(documentCard);area.addView(divider);area.addView(resize,LayoutParams(dp(22),dp(22)))
            for(card in listOf(videoCard,documentCard)){card.clipToOutline=true;card.background=GradientDrawable().apply{setColor(if(card===documentCard)Color.WHITE else Color.BLACK);cornerRadius=dp(12).toFloat()}}
            gesture(documentBar,false);gesture(videoBar,false);gesture(resize,true)
            divider.setOnTouchListener{_,event->if(event.actionMasked==MotionEvent.ACTION_MOVE||event.actionMasked==MotionEvent.ACTION_DOWN){val location=IntArray(2);area.getLocationOnScreen(location);ratio=PreviewGeometry.ratio((event.rawX-location[0])/area.width.coerceAtLeast(1));place();parent?.requestDisallowInterceptTouchEvent(true)}else if(event.actionMasked==MotionEvent.ACTION_UP||event.actionMasked==MotionEvent.ACTION_CANCEL){save();parent?.requestDisallowInterceptTouchEvent(false)};true}
        }else{videoBar.visibility=View.GONE}
    }
    private fun action(label:String,run:()->Unit)=TextView(context).apply{text=label;textSize=12f;gravity=Gravity.CENTER;setTextColor(Color.rgb(178,194,239));isClickable=true;isFocusable=true;contentDescription=label;background=GradientDrawable().apply{setColor(Color.rgb(32,37,47));setStroke(dp(1),Color.rgb(59,68,84));cornerRadius=dp(8).toFloat()};setOnClickListener{run()}}
    fun swap(){if(page==null)return;swapped=!swapped;place()}
    fun toggleSmall(){if(page==null){android.widget.Toast.makeText(context,"本堂课暂无平台课件切片",android.widget.Toast.LENGTH_SHORT).show();return};mode=when(mode){"parallel"->"pip";"pip"->"single";else->"parallel"};save();place()}
    private fun save(){preferences.edit().putString("mode",mode).putFloat("ratio",ratio).putFloat("x",box[0]).putFloat("y",box[1]).putFloat("w",box[2]).putFloat("h",box[3]).apply()}
    private fun scaleBox(factor:Float){box[2]*=factor;box[3]*=factor;place();save()}
    private fun gesture(handle:View,sizing:Boolean){
        var startX=0f;var startY=0f;var origin=box.copyOf()
        handle.setOnTouchListener{_,event->when(event.actionMasked){
            MotionEvent.ACTION_DOWN->{if(mode!="pip")return@setOnTouchListener false;startX=event.rawX;startY=event.rawY;origin=box.copyOf();parent?.requestDisallowInterceptTouchEvent(true);true}
            MotionEvent.ACTION_MOVE->{val dx=(event.rawX-startX)/area.width.coerceAtLeast(1);val dy=(event.rawY-startY)/area.height.coerceAtLeast(1);box=if(sizing)floatArrayOf(origin[0],origin[1],origin[2]+dx,origin[3]+dy)else floatArrayOf(origin[0]+dx,origin[1]+dy,origin[2],origin[3]);place();true}
            MotionEvent.ACTION_UP,MotionEvent.ACTION_CANCEL->{save();parent?.requestDisallowInterceptTouchEvent(false);true}
            else->false
        }}
    }
    override fun onSizeChanged(w:Int,h:Int,oldw:Int,oldh:Int){super.onSizeChanged(w,h,oldw,oldh);post{if(!preferences.contains("w")&&area.height>0){box[3]=(area.width*box[2]*9f/16f+dp(30))/area.height};place()}}
    private fun place(){
        val w=area.width;val h=area.height;if(w<1||h<1)return
        if(page==null){videoCard.layoutParams=LayoutParams(-1,-1);return}
        modes.forEach{(id,button)->button.isSelected=id==mode;button.setTextColor(if(id==mode)Color.WHITE else Color.rgb(145,155,176));button.background=if(id==mode)GradientDrawable().apply{setColor(Color.rgb(48,57,77));cornerRadius=dp(10).toFloat()}else null}
        val main=if(swapped)documentCard else videoCard;val other=if(swapped)videoCard else documentCard
        videoCard.visibility=View.VISIBLE;documentCard.visibility=View.VISIBLE;videoCard.elevation=0f;documentCard.elevation=0f;videoBar.visibility=View.GONE;documentBar.visibility=View.GONE;divider.visibility=View.GONE;resize.visibility=View.GONE
        video.layoutParams=LayoutParams(-1,-1)
        (page.view as? FullscreenSlides)?.setCompact(mode=="pip"&&!swapped)
        when(mode){
            "parallel"->{val first=(w*ratio).roundToInt();val gap=dp(20);main.layoutParams=LayoutParams((first-gap/2).coerceAtLeast(1),-1);other.layoutParams=LayoutParams((w-first-gap/2).coerceAtLeast(1),-1).apply{leftMargin=first+gap/2};divider.visibility=View.VISIBLE;divider.layoutParams=LayoutParams(gap,-1).apply{leftMargin=first-gap/2};divider.bringToFront()}
            "single"->{main.layoutParams=LayoutParams(-1,-1);other.visibility=View.GONE}
            else->{box=PreviewGeometry.box(box[0],box[1],box[2],box[3],w.toFloat(),h.toFloat(),resources.displayMetrics.density);main.layoutParams=LayoutParams(-1,-1);other.layoutParams=LayoutParams((box[2]*w).roundToInt(),(box[3]*h).roundToInt()).apply{leftMargin=(box[0]*w).roundToInt();topMargin=(box[1]*h).roundToInt()};other.elevation=dp(8).toFloat();other.bringToFront();if(swapped){videoBar.visibility=View.VISIBLE;videoBar.layoutParams=LayoutParams(dp(32),dp(26),Gravity.TOP or Gravity.START)}else if(page.view !is FullscreenSlides)documentBar.visibility=View.VISIBLE;resize.visibility=View.VISIBLE;resize.layoutParams=LayoutParams(dp(22),dp(22)).apply{leftMargin=((box[0]+box[2])*w).roundToInt()-dp(22);topMargin=((box[1]+box[3])*h).roundToInt()-dp(22)-(if(!swapped&&page.view is FullscreenSlides)dp(30)else 0)};resize.elevation=dp(10).toFloat();resize.bringToFront()}
        }
    }
    fun release(){borrowedViewport?.detachContent();page?.release?.invoke();(video.parent as? ViewGroup)?.removeView(video)}
}
