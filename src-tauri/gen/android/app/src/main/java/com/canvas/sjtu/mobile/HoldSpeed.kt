package com.canvas.sjtu.mobile

import android.os.Handler
import android.os.Looper
import android.view.MotionEvent
import android.view.View
import android.view.ViewConfiguration

/** Installed on the PlayerView itself: child time-bar gestures keep their normal handlers. */
class HoldSpeed(private val view:View,private val start:()->Unit,private val end:()->Unit,private val tap:()->Unit):View.OnTouchListener{
    private val handler=Handler(Looper.getMainLooper());private var x=0f;private var y=0f;private var moved=false;private var boosted=false
    private val hold=Runnable{if(!moved){boosted=true;start()}}
    init{view.isClickable=true;view.setOnClickListener{tap()};view.setOnTouchListener(this)}
    override fun onTouch(v:View,event:MotionEvent):Boolean{
        when(event.actionMasked){
            MotionEvent.ACTION_DOWN->{x=event.x;y=event.y;moved=false;handler.removeCallbacks(hold);handler.postDelayed(hold,450)}
            MotionEvent.ACTION_MOVE->{val slop=ViewConfiguration.get(v.context).scaledTouchSlop*2;if(kotlin.math.abs(event.x-x)>slop||kotlin.math.abs(event.y-y)>slop){moved=true;handler.removeCallbacks(hold)}}
            MotionEvent.ACTION_UP->{handler.removeCallbacks(hold);if(boosted){boosted=false;end()}else if(!moved)v.performClick()}
            MotionEvent.ACTION_CANCEL->{handler.removeCallbacks(hold);if(boosted){boosted=false;end()}}
        };return true
    }
    fun cancel(){handler.removeCallbacks(hold);if(boosted){boosted=false;end()}}
}
