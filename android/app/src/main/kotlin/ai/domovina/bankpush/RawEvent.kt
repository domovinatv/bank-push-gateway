package ai.domovina.bankpush

import android.app.Notification
import android.os.Bundle
import android.service.notification.StatusBarNotification
import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant

// Pretvara obavijest u sirovi JSON (docs/architecture.md, Shema 1).
// Ništa se ne parsira: šalju se svi `extras` jer banke sadržaj stavljaju na različita mjesta.
object RawEvent {

    // Dio događaja koji ne ovisi o seq; služi i za lokalni dedup
    // (snimka aktivnih obavijesti pri spajanju ponovno vidi iste obavijesti).
    fun fromNotification(sbn: StatusBarNotification): JSONObject {
        val n = sbn.notification
        return JSONObject().apply {
            put("package", sbn.packageName)
            put("channel_id", n.channelId ?: JSONObject.NULL)
            put("notification_key", sbn.key)
            put("notification_id", sbn.id)
            put("tag", sbn.tag ?: JSONObject.NULL)
            put("group_key", sbn.groupKey ?: JSONObject.NULL)
            put("post_time", sbn.postTime)
            put("when", n.`when`)
            put("category", n.category ?: JSONObject.NULL)
            put("flags", n.flags)
            put("is_group_summary", n.flags and Notification.FLAG_GROUP_SUMMARY != 0)
            put("extras", bundleToJson(n.extras))
        }
    }

    fun contentHash(event: JSONObject): String = Signer.sha256Hex(
        listOf(event.optString("notification_key"), event.optLong("post_time"), event.opt("extras")).joinToString("|")
    )

    fun withEnvelope(event: JSONObject, deviceId: String, seq: Long, capturedAtMs: Long): String =
        JSONObject().apply {
            put("device_id", deviceId)
            put("seq", seq)
            put("captured_at", Instant.ofEpochMilli(capturedAtMs).toString())
            put("app_version", BuildConfig.VERSION_NAME)
            for (key in event.keys()) put(key, event.get(key))
        }.toString()

    fun bundleToJson(bundle: Bundle?, depth: Int = 0): JSONObject {
        val out = JSONObject()
        if (bundle == null) return out
        for (key in bundle.keySet().sorted()) {
            @Suppress("DEPRECATION")
            val value = try { bundle.get(key) } catch (e: RuntimeException) { "<unreadable: ${e.javaClass.simpleName}>" }
            out.put(key, valueToJson(value, depth))
        }
        return out
    }

    private fun valueToJson(value: Any?, depth: Int): Any = when {
        value == null -> JSONObject.NULL
        value is CharSequence -> value.toString()
        value is Boolean || value is Int || value is Long || value is Double -> value
        value is Float -> value.toDouble()
        value is Bundle -> if (depth < 4) bundleToJson(value, depth + 1) else JSONObject.NULL
        value is Array<*> -> JSONArray(value.map { valueToJson(it, depth + 1) })
        value is IntArray -> JSONArray(value.toList())
        value is LongArray -> JSONArray(value.toList())
        value is List<*> -> JSONArray(value.map { valueToJson(it, depth + 1) })
        // Ikone, bitmape, PendingIntenti, RemoteViews: samo tip, bez sadržaja.
        else -> JSONObject().put("_type", value.javaClass.name)
    }
}
