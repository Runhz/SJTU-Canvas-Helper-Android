package com.canvas.sjtu.mobile

import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.view.Surface
import org.json.JSONObject
import kotlin.math.abs
import kotlin.math.exp
import kotlin.math.atan2

/** Screen-relative gravity and peak acceleration, collected only while the tank is visible. */
class WaterMotion(private val activity: MainActivity) : SensorEventListener {
    private val manager = activity.getSystemService(Context.SENSOR_SERVICE) as SensorManager
    private var running = false
    private val gravity = doubleArrayOf(0.0, 9.81, 0.0)
    private val peak = DoubleArray(3)
    private var sensorTime = 0L
    private var timestamp = 0L
    @Synchronized fun start(): Boolean {
        if (running) return true
        val sensor = manager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER) ?: return false
        sensorTime = 0L
        timestamp = 0L
        peak.fill(0.0)
        running = manager.registerListener(this, sensor, SensorManager.SENSOR_DELAY_GAME)
        return running
    }
    @Synchronized fun stop() { manager.unregisterListener(this); running = false; peak.fill(0.0) }
    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}
    @Synchronized override fun onSensorChanged(event: SensorEvent) {
        val dt = if (sensorTime == 0L) 0.02 else ((event.timestamp-sensorTime)/1e9).coerceIn(0.001,0.1)
        val alpha = if (sensorTime == 0L) 1.0 else 1.0-exp(-dt/0.055)
        for (i in 0..2) {
            val raw = event.values[i].toDouble()
            gravity[i] += (raw-gravity[i])*alpha
            val linear = raw-gravity[i]
            if (abs(linear)>abs(peak[i])) peak[i]=linear.coerceIn(-25.0,25.0)
        }
        sensorTime=event.timestamp
        timestamp=android.os.SystemClock.elapsedRealtime()
    }
    private fun screen(v:DoubleArray,rotation:Int):DoubleArray = when(rotation) {
        Surface.ROTATION_90 -> doubleArrayOf(-v[1],v[0],v[2])
        Surface.ROTATION_180 -> doubleArrayOf(-v[0],-v[1],v[2])
        Surface.ROTATION_270 -> doubleArrayOf(v[1],-v[0],v[2])
        else -> v.copyOf()
    }
    @Synchronized fun snapshot():JSONObject {
        @Suppress("DEPRECATION") val rotation=activity.windowManager.defaultDisplay.rotation
        val g=screen(gravity,rotation); val a=screen(peak,rotation)
        peak.fill(0.0)
        return JSONObject().put("available",running).put("x",g[0]).put("y",g[1]).put("z",g[2])
            .put("ax",a[0]).put("ay",a[1]).put("az",a[2])
            .put("tilt",-atan2(g[0],g[1])).put("impulse",a[0]).put("timestamp",timestamp)
    }
}
