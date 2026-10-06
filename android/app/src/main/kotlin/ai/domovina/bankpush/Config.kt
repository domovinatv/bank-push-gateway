package ai.domovina.bankpush

import android.content.Context
import android.content.SharedPreferences

// Konfiguracija živi samo na uređaju (SharedPreferences, isključeno iz backupa).
class Config(context: Context) {
    private val prefs: SharedPreferences =
        context.getSharedPreferences("config", Context.MODE_PRIVATE)

    var endpoint: String
        get() = prefs.getString(KEY_ENDPOINT, "") ?: ""
        set(v) = prefs.edit().putString(KEY_ENDPOINT, v.trim().trimEnd('/')).apply()

    var deviceId: String
        get() = prefs.getString(KEY_DEVICE_ID, "") ?: ""
        set(v) = prefs.edit().putString(KEY_DEVICE_ID, v.trim()).apply()

    var secret: String
        get() = prefs.getString(KEY_SECRET, "") ?: ""
        set(v) = prefs.edit().putString(KEY_SECRET, v.trim()).apply()

    var allowlist: Set<String>
        get() = prefs.getStringSet(KEY_ALLOWLIST, null) ?: BankPackages.DEFAULT
        set(v) = prefs.edit().putStringSet(KEY_ALLOWLIST, v.map { it.trim() }.filter { it.isNotEmpty() }.toSet()).apply()

    // seq = seqBase + lokalni rowid. Baza je vrijeme prve instalacije u ms, pa
    // ponovna instalacija (rowid kreće od 1) ne sudara seq sa starim događajima na serveru.
    val seqBase: Long
        get() {
            val existing = prefs.getLong(KEY_SEQ_BASE, 0L)
            if (existing > 0) return existing
            val base = System.currentTimeMillis()
            prefs.edit().putLong(KEY_SEQ_BASE, base).commit()
            return base
        }

    val isComplete: Boolean
        get() = endpoint.isNotEmpty() && deviceId.isNotEmpty() && secret.length >= 16

    fun isAllowed(packageName: String): Boolean =
        packageName in allowlist || (BuildConfig.DEBUG && packageName == BuildConfig.APPLICATION_ID)

    private companion object {
        const val KEY_ENDPOINT = "endpoint"
        const val KEY_DEVICE_ID = "device_id"
        const val KEY_SECRET = "secret"
        const val KEY_ALLOWLIST = "allowlist"
        const val KEY_SEQ_BASE = "seq_base"
    }
}
