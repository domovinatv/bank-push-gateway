package ai.domovina.bankpush

import android.content.ComponentName
import android.os.Handler
import android.os.Looper
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import android.util.Log

// Samo čita obavijesti s allowlista. Ne odgovara na njih, ne otvara ih, ne briše ih.
class BankNotificationListener : NotificationListenerService() {

    private val handler = Handler(Looper.getMainLooper())
    private var ticks = 0

    private val tick = object : Runnable {
        override fun run() {
            val gateway = Gateway.get(this@BankNotificationListener)
            if (ticks % HEARTBEAT_EVERY_TICKS == 0) gateway.heartbeat(listenerConnected = true) else gateway.flush()
            ticks++
            handler.postDelayed(this, TICK_MS)
        }
    }

    override fun onListenerConnected() {
        Log.i(Gateway.TAG, "listener connected")
        connected = true
        val gateway = Gateway.get(this)
        // Obavijesti koje su stigle dok listener nije radio. Lokalni dedup preskače već viđene.
        try {
            activeNotifications?.forEach { gateway.capture(it) }
        } catch (e: SecurityException) {
            Log.w(Gateway.TAG, "activeNotifications: $e")
        }
        ticks = 0
        handler.removeCallbacks(tick)
        handler.post(tick)
    }

    override fun onListenerDisconnected() {
        Log.w(Gateway.TAG, "listener disconnected")
        connected = false
        handler.removeCallbacks(tick)
        requestRebind(ComponentName(this, BankNotificationListener::class.java))
    }

    override fun onNotificationPosted(sbn: StatusBarNotification) {
        Gateway.get(this).capture(sbn)
    }

    companion object {
        @Volatile var connected = false
            private set

        private const val TICK_MS = 60_000L          // retry reda svake minute
        private const val HEARTBEAT_EVERY_TICKS = 5  // heartbeat svakih 5 min
    }
}
