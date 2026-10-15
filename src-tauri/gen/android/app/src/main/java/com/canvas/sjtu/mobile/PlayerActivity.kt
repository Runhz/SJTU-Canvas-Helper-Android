package com.canvas.sjtu.mobile

import android.app.Activity
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.View
import android.widget.ArrayAdapter
import android.widget.Button
import android.widget.LinearLayout
import android.widget.Spinner
import android.widget.AdapterView
import android.widget.TextView
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.ui.PlayerView
import org.json.JSONObject

class PlayerActivity:Activity(){
    companion object { var pending:JSONObject?=null }
    private lateinit var primary:ExoPlayer
    private var secondary:ExoPlayer?=null
    private lateinit var primaryView:PlayerView
    private lateinit var secondaryView:PlayerView
    private lateinit var args:JSONObject
    private lateinit var message:TextView
    private var primaryIndex=0
    private val handler=Handler(Looper.getMainLooper())
    private val loop=object:Runnable{override fun run(){secondary?.let{other->if(primary.isPlaying&&kotlin.math.abs(other.currentPosition-primary.currentPosition)>500)other.seekTo(primary.currentPosition);other.playWhenReady=primary.playWhenReady;other.setPlaybackSpeed(primary.playbackParameters.speed)};handler.postDelayed(this,1000)}}
    override fun onCreate(savedInstanceState:Bundle?){
        super.onCreate(savedInstanceState)
        val value=pending
        if(value==null||value.optString("accountId")!=SecureStore(this).settings().optString("currentId")){finish();return}
        args=value
        val root=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;setPadding(0,30,0,14);setBackgroundColor(Color.rgb(25,30,24))}
        val top=LinearLayout(this)
        top.addView(Button(this).apply{text="返回";setOnClickListener{finish()}})
        top.addView(TextView(this).apply{text=args.optString("title","课堂录播");setTextColor(Color.WHITE);textSize=16f;setPadding(12,20,8,8)},LinearLayout.LayoutParams(0,-2,1f));root.addView(top)
        primaryView=PlayerView(this);secondaryView=PlayerView(this).apply{useController=false;visibility=View.GONE}
        root.addView(primaryView,LinearLayout.LayoutParams(-1,0,1f));root.addView(secondaryView,LinearLayout.LayoutParams(-1,0,0.5f))
        message=TextView(this).apply{setTextColor(Color.rgb(218,224,210));textSize=12f;setPadding(20,8,20,8)};root.addView(message)
        val tools=LinearLayout(this)
        val tracks=args.getJSONArray("tracks")
        val spinner=Spinner(this).apply{adapter=ArrayAdapter(this@PlayerActivity,android.R.layout.simple_spinner_dropdown_item,(0 until tracks.length()).map{"机位 ${it+1}"})}
        tools.addView(spinner,LinearLayout.LayoutParams(0,-2,1f))
        tools.addView(Button(this).apply{text="倍速";setOnClickListener{val speeds=floatArrayOf(1f,1.25f,1.5f,2f,0.75f);val current=speeds.indexOfFirst{it==primary.playbackParameters.speed};val next=speeds[(current+1)%speeds.size];primary.setPlaybackSpeed(next);text="${next}×"}})
        tools.addView(Button(this).apply{text="双机位";isEnabled=tracks.length()>1;setOnClickListener{if(secondary==null){val idx=if(primaryIndex==0)1 else 0;secondary=makePlayer(idx).apply{volume=0f;seekTo(primary.currentPosition);playWhenReady=primary.playWhenReady};secondaryView.player=secondary;secondaryView.visibility=View.VISIBLE;text="单机位"}else{secondary?.release();secondary=null;secondaryView.player=null;secondaryView.visibility=View.GONE;text="双机位"}}})
        root.addView(tools);setContentView(root)
        primary=makePlayer(0);primaryView.player=primary
        val key=positionKey();val saved=getSharedPreferences("playback",MODE_PRIVATE).getLong(key,0)
        primary.seekTo(if(args.has("positionMs"))args.optLong("positionMs") else saved);primary.playWhenReady=true
        spinner.onItemSelectedListener=object:AdapterView.OnItemSelectedListener{override fun onNothingSelected(parent:AdapterView<*>?){};override fun onItemSelected(parent:AdapterView<*>?,view:View?,position:Int,id:Long){if(position!=primaryIndex){val time=primary.currentPosition;val speed=primary.playbackParameters.speed;primary.release();secondary?.release();secondary=null;secondaryView.visibility=View.GONE;primaryIndex=position;primary=makePlayer(position);primaryView.player=primary;primary.seekTo(time);primary.setPlaybackSpeed(speed);primary.playWhenReady=true}}}
        handler.post(loop)
    }
    private fun positionKey()="${accountHash(args.getString("accountId"))}:${args.optString("resourceId")}"
    private fun makePlayer(index:Int):ExoPlayer{
        val track=args.getJSONArray("tracks").getJSONObject(index)
        val headers=mutableMapOf<String,String>();(track.optJSONObject("headers")?:args.optJSONObject("headers"))?.let{for(k in it.keys())headers[k]=it.getString(k)}
        val factory=DefaultHttpDataSource.Factory().setDefaultRequestProperties(headers).setUserAgent("CanvasMobile/0.1")
        val player=ExoPlayer.Builder(this).setMediaSourceFactory(DefaultMediaSourceFactory(factory)).build()
        player.addListener(object:Player.Listener{override fun onPlayerError(error:PlaybackException){message.text=if(index!=primaryIndex)"副机位暂不可用，可能不支持同时解码；可切换机位观看。" else "播放失败，请返回刷新录播地址或重新登录后再试。"}})
        player.setMediaItem(MediaItem.fromUri(Uri.parse(track.getString("url"))));player.prepare();return player
    }
    override fun onPause(){if(::primary.isInitialized){primary.pause();secondary?.pause();getSharedPreferences("playback",MODE_PRIVATE).edit().putLong(positionKey(),primary.currentPosition).apply()};super.onPause()}
    override fun onDestroy(){handler.removeCallbacks(loop);if(::primary.isInitialized)primary.release();secondary?.release();super.onDestroy()}
}
