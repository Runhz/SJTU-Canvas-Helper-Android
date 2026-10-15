package com.canvas.sjtu.mobile

import android.os.Bundle
import android.view.View
import androidx.activity.enableEdgeToEdge
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import kotlin.math.max

class MainActivity : TauriActivity() {
  val embeddedPlayer by lazy { EmbeddedPlayer(this) }
  val waterMotion by lazy { WaterMotion(this) }
  override fun onPause(){waterMotion.stop();embeddedPlayer.pause();super.onPause()}
  override fun onDestroy(){embeddedPlayer.close();super.onDestroy()}
  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
    val content = findViewById<View>(android.R.id.content)
    ViewCompat.setOnApplyWindowInsetsListener(content) { view, insets ->
      val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout())
      val keyboard = insets.getInsets(WindowInsetsCompat.Type.ime())
      view.setPadding(bars.left, bars.top, bars.right, max(bars.bottom, keyboard.bottom))
      WindowInsetsCompat.CONSUMED
    }
    ViewCompat.requestApplyInsets(content)
  }
}
