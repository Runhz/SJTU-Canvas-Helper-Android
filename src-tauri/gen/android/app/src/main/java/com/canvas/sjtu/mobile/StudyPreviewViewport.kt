package com.canvas.sjtu.mobile

import android.content.Context
import android.graphics.Color
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import kotlin.math.roundToInt
import kotlin.math.hypot

/** Zooms the existing surface as a whole, even if a remote viewer disables browser zoom. */
class StudyPreviewViewport(context:Context,private val content:View,passThrough:Boolean=true):FrameLayout(context){
    private var zoom=1f;private var x=0f;private var y=0f;private var moving=!passThrough;private var transforming=false
    private var compactControls=false
    private var lastX=0f;private var lastY=0f
    private var pinchDistance=0f;private var pinchZoom=1f;private var pinchX=0f;private var pinchY=0f;private var pinchPanX=0f;private var pinchPanY=0f
    private var label:TextView?=null;private var moveButton:TextView?=null
    private val density=resources.displayMetrics.density
    init{clipChildren=true;clipToPadding=true;setBackgroundColor(Color.rgb(235,238,243));addView(content,LayoutParams(-1,-1));contentDescription="课件预览，双指缩放，放大后拖动"}
    private fun apply(){x=PreviewGeometry.pan(x,width.toFloat(),zoom);y=PreviewGeometry.pan(y,height.toFloat(),zoom);content.pivotX=width/2f;content.pivotY=height/2f;content.scaleX=zoom;content.scaleY=zoom;content.translationX=x;content.translationY=y;label?.text="${(zoom*100).roundToInt()}%"+(if(compactControls)""else" · 适合")}
    fun fit(){zoom=1f;x=0f;y=0f;apply()}
    fun controls(compact:Boolean=false):LinearLayout=LinearLayout(context).apply{
        compactControls=compact
        gravity=Gravity.CENTER_VERTICAL;setBackgroundColor(Color.rgb(249,250,252))
        val controlHeight=((if(compact)28 else 36)*density).toInt()
        fun button(text:String,description:String,run:()->Unit):TextView=TextView(context).apply{this.text=text;textSize=if(compact)11f else 13f;gravity=Gravity.CENTER;setTextColor(Color.rgb(55,66,86));val padding=if(compact)3 else 10;setPadding((padding*density).toInt(),0,(padding*density).toInt(),0);minHeight=controlHeight;minWidth=((if(compact)28 else 40)*density).toInt();isClickable=true;isFocusable=true;contentDescription=description;setOnClickListener{run()}}
        addView(button("−","缩小课件"){zoom=PreviewGeometry.zoom(zoom-.25f);apply()})
        label=button(if(compact)"100%"else"100% · 适合","课件适合窗口"){fit()};addView(label,LinearLayout.LayoutParams(0,controlHeight,1f))
        addView(button("+","放大课件"){zoom=PreviewGeometry.zoom(zoom+.25f);apply()})
        if(!compact){moveButton=button("移动","切换课件移动模式"){moving=!moving;moveButton?.text=if(moving)"移动中"else"移动";moveButton?.setTextColor(if(moving)Color.rgb(53,89,194)else Color.rgb(55,66,86))};addView(moveButton)}
    }
    override fun onSizeChanged(w:Int,h:Int,ow:Int,oh:Int){super.onSizeChanged(w,h,ow,oh);post{apply()}}
    override fun dispatchTouchEvent(event:MotionEvent):Boolean{
        if(event.actionMasked==MotionEvent.ACTION_DOWN){transforming=moving||zoom!=1f;lastX=event.x;lastY=event.y;pinchDistance=0f}
        if(event.actionMasked==MotionEvent.ACTION_POINTER_DOWN&&event.pointerCount>=2){
            if(!transforming){val cancel=MotionEvent.obtain(event);cancel.action=MotionEvent.ACTION_CANCEL;super.dispatchTouchEvent(cancel);cancel.recycle()}
            transforming=true;pinchDistance=hypot(event.getX(0)-event.getX(1),event.getY(0)-event.getY(1)).coerceAtLeast(1f);pinchZoom=zoom;pinchX=(event.getX(0)+event.getX(1))/2f;pinchY=(event.getY(0)+event.getY(1))/2f;pinchPanX=x;pinchPanY=y
        }
        if(transforming){
            parent?.requestDisallowInterceptTouchEvent(true)
            if(event.actionMasked==MotionEvent.ACTION_MOVE){
                if(event.pointerCount>=2&&pinchDistance>0f){
                    zoom=PreviewGeometry.zoom(pinchZoom*hypot(event.getX(0)-event.getX(1),event.getY(0)-event.getY(1))/pinchDistance)
                    x=(event.getX(0)+event.getX(1))/2f-width/2f-(pinchX-width/2f-pinchPanX)*zoom/pinchZoom
                    y=(event.getY(0)+event.getY(1))/2f-height/2f-(pinchY-height/2f-pinchPanY)*zoom/pinchZoom
                }else if(event.pointerCount==1){x+=event.x-lastX;y+=event.y-lastY}
                apply()
            }
            lastX=event.x;lastY=event.y
            if(event.actionMasked==MotionEvent.ACTION_POINTER_UP&&event.pointerCount>1){val index=if(event.actionIndex==0)1 else 0;lastX=event.getX(index);lastY=event.getY(index);pinchDistance=0f}
            if(event.actionMasked==MotionEvent.ACTION_UP||event.actionMasked==MotionEvent.ACTION_CANCEL){transforming=false;pinchDistance=0f;parent?.requestDisallowInterceptTouchEvent(false)}
            return true
        }
        super.dispatchTouchEvent(event)
        return true
    }
    fun detachContent(){removeView(content);content.scaleX=1f;content.scaleY=1f;content.translationX=0f;content.translationY=0f}
}
