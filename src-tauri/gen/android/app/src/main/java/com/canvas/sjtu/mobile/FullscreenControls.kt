package com.canvas.sjtu.mobile

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import android.graphics.drawable.GradientDrawable
import android.graphics.drawable.RippleDrawable
import android.content.res.ColorStateList
import android.view.Gravity
import android.view.View
import android.widget.LinearLayout

/** A lightweight accessible toolbar; no second WebView or player instance. */
class FullscreenControls(context:Context,onAction:(String)->Unit):LinearLayout(context){
    private val buttons=linkedMapOf<String,Action>()
    init{
        orientation=HORIZONTAL;gravity=Gravity.CENTER_VERTICAL;setBackgroundColor(Color.rgb(24,25,27))
        val gap=(8*resources.displayMetrics.density).toInt();setPadding(gap,gap/2,gap,gap/2)
        for((id,label)in listOf("playPause" to "播放或暂停","speed" to "播放速度","camera" to "切换机位","dual" to "双机位","captions" to "显示或隐藏字幕","capture" to "截图提问","exit" to "退出全屏")){
            val button=Action(context,id).apply{contentDescription=label;isClickable=true;isFocusable=true;setOnClickListener{onAction(id)}}
            buttons[id]=button;addView(button,LayoutParams(0,(48*resources.displayMetrics.density).toInt(),1f))
        }
    }
    fun update(playing:Boolean,speed:Float,dual:Boolean,multiple:Boolean){
        buttons["playPause"]?.apply{paused=!playing;contentDescription=if(playing)"暂停"else"播放";invalidate()}
        buttons["speed"]?.apply{caption="${speed.toString().trimEnd('0').trimEnd('.')}×";contentDescription="播放速度 $caption";invalidate()}
        buttons["dual"]?.apply{highlight=dual;isSelected=dual;contentDescription=if(dual)"关闭双机位"else"开启双机位";invalidate()}
        for(id in listOf("camera","dual"))buttons[id]?.apply{isEnabled=multiple;alpha=if(multiple)1f else .3f}
    }
    fun captions(enabled:Boolean,available:Boolean){buttons["captions"]?.apply{highlight=enabled;isSelected=enabled;isEnabled=available;alpha=if(available)1f else .3f;contentDescription=if(enabled)"关闭字幕"else"开启字幕";invalidate()}}
    private class Action(context:Context,val kind:String):View(context){
        var paused=true;var caption="1×";var highlight=false
        private val paint=Paint(Paint.ANTI_ALIAS_FLAG).apply{strokeWidth=1.8f;style=Paint.Style.STROKE;strokeCap=Paint.Cap.ROUND;strokeJoin=Paint.Join.ROUND}
        init{background=RippleDrawable(ColorStateList.valueOf(0x304b73f4),null,GradientDrawable().apply{setColor(Color.WHITE);cornerRadius=16*resources.displayMetrics.density})}
        override fun onDraw(canvas:Canvas){super.onDraw(canvas);val dp=resources.displayMetrics.density;val size=24*dp
            canvas.save();canvas.translate((width-size)/2,(height-size)/2);canvas.scale(dp,dp);paint.color=if(highlight)Color.rgb(158,177,255)else Color.rgb(242,243,245)
            fun line(vararg xy:Float){val p=Path();p.moveTo(xy[0],xy[1]);var i=2;while(i<xy.size){p.lineTo(xy[i],xy[i+1]);i+=2};canvas.drawPath(p,paint)}
            when(kind){
                "speed"->{paint.style=Paint.Style.FILL;paint.textAlign=Paint.Align.CENTER;paint.textSize=15f;canvas.drawText(caption,12f,17f,paint);paint.style=Paint.Style.STROKE}
                "playPause"->if(paused)line(7f,4f,20f,12f,7f,20f,7f,4f)else{line(8f,5f,8f,19f);line(16f,5f,16f,19f)}
                "captions"->{canvas.drawRoundRect(RectF(2f,5f,22f,19f),2f,2f,paint);line(9f,9f,6f,9f,6f,15f,9f,15f);line(18f,9f,15f,9f,15f,15f,18f,15f)}
                "document"->{canvas.drawRoundRect(RectF(3f,4f,21f,20f),2f,2f,paint);canvas.drawRoundRect(RectF(12f,11f,19f,18f),1f,1f,paint)}
                "swap"->{line(3f,8f,20f,8f,16f,4f);line(21f,16f,4f,16f,8f,20f)}
                "dual"->{canvas.drawRoundRect(RectF(3f,4f,21f,20f),2f,2f,paint);line(12f,4f,12f,20f)}
                "camera","capture"->{line(3f,8f,7f,8f,9f,5f,15f,5f,17f,8f,21f,8f,21f,20f,3f,20f,3f,8f);canvas.drawCircle(12f,13f,3f,paint);if(kind=="camera"){line(3f,5f,3f,2f,7f,2f);line(21f,20f,21f,23f,17f,23f)}}
                "exit"->{line(4f,9f,9f,9f,9f,4f);line(15f,4f,15f,9f,20f,9f);line(4f,15f,9f,15f,9f,20f);line(15f,20f,15f,15f,20f,15f)}
            };canvas.restore()
        }
    }
}
