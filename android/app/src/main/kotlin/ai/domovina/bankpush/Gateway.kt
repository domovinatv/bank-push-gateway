package ai.domovina.bankpush

import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.BatteryManager
import android.service.notification.StatusBarNotification
import android.util.Log
import org.json.JSONObject
import java.io.IOException
import java.time.Instant
import java.util.concurrent.Executors

// Jedna instanca po procesu. Sav rad s mrežom i bazom ide kroz jednu dretvu,
// pa se red šalje strogo po redu i bez utrka.
class Gateway private constructor(private val context: Context) {

    val config = Config(context)
    val store = EventStore(context)
    private val sender = Sender(config)
    private val executor = Executors.newSingleThreadExecutor { r -> Thread(r, "gateway") }

    @Volatile var lastFlushError: String? = null
        private set

    fun capture(sbn: StatusBarNotification) {
        if (!config.isAllowed(sbn.packageName)) return
        val capturedAt = System.currentTimeMillis()
        // Extras se čitaju odmah, na dretvi listenera: aplikacija ih može kasnije promijeniti.
        val event = RawEvent.fromNotification(sbn)
        executor.execute {
            val hash = RawEvent.contentHash(event)
            val deviceId = config.deviceId.ifEmpty { "unconfigured" }
            val added = store.enqueue(hash, { seq -> RawEvent.withEnvelope(event, deviceId, seq, capturedAt) }, config.seqBase)
            Log.i(TAG, "capture ${sbn.packageName} added=$added")
            if (added) flushNow()
        }
    }

    fun flush() = executor.execute { flushNow() }

    fun heartbeat(listenerConnected: Boolean) = executor.execute {
        if (!config.isComplete) return@execute
        val stats = store.stats()
        val body = JSONObject().apply {
            put("device_id", config.deviceId)
            put("sent_at", Instant.now().toString())
            put("app_version", BuildConfig.VERSION_NAME)
            put("listener_connected", listenerConnected)
            put("queue_pending", stats.pending)
            put("queue_failed", stats.failed)
            put("last_ack_at", stats.lastAckAt?.let { Instant.ofEpochMilli(it).toString() } ?: JSONObject.NULL)
            batteryInfo()?.let { (level, charging) ->
                put("battery", level)
                put("charging", charging)
            }
        }.toString()
        try {
            val res = sender.post("/heartbeat", body)
            Log.i(TAG, "heartbeat ${res.code}")
        } catch (e: IOException) {
            Log.w(TAG, "heartbeat failed: $e")
        }
        flushNow()
        store.prune()
    }

    private fun flushNow() {
        if (!config.isComplete) {
            lastFlushError = "konfiguracija nije potpuna"
            return
        }
        while (true) {
            val batch = store.pending()
            if (batch.isEmpty()) {
                lastFlushError = null
                return
            }
            for (item in batch) {
                val res = try {
                    sender.post("/ingest", item.body)
                } catch (e: IOException) {
                    store.markAttempt(item.id, e.toString())
                    lastFlushError = e.toString()
                    Log.w(TAG, "ingest seq=${item.seq} network error: $e")
                    return
                }
                when (res.code) {
                    in 200..299 -> store.markAcked(item.id)
                    400, 413 -> store.markFailed(item.id, "${res.code} ${res.body}")
                    else -> {
                        // 401 (tajna/sat), 5xx: pokušaj ponovno kasnije, zadrži redoslijed.
                        store.markAttempt(item.id, "${res.code} ${res.body}")
                        lastFlushError = "${res.code} ${res.body}"
                        Log.w(TAG, "ingest seq=${item.seq} -> ${res.code} ${res.body}")
                        return
                    }
                }
                Log.i(TAG, "ingest seq=${item.seq} -> ${res.code}")
            }
        }
    }

    private fun batteryInfo(): Pair<Int, Boolean>? {
        val intent = context.registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED)) ?: return null
        val level = intent.getIntExtra(BatteryManager.EXTRA_LEVEL, -1)
        val scale = intent.getIntExtra(BatteryManager.EXTRA_SCALE, -1)
        val plugged = intent.getIntExtra(BatteryManager.EXTRA_PLUGGED, 0) != 0
        return if (level >= 0 && scale > 0) (level * 100 / scale) to plugged else null
    }

    companion object {
        const val TAG = "BankPush"

        @Volatile private var instance: Gateway? = null

        fun get(context: Context): Gateway =
            instance ?: synchronized(this) {
                instance ?: Gateway(context.applicationContext).also { instance = it }
            }
    }
}
