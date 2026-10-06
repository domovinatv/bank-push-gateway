package ai.domovina.bankpush

import android.app.Activity
import android.content.ComponentName
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.os.PowerManager
import android.provider.Settings
import android.text.InputType
import android.view.ViewGroup.LayoutParams.MATCH_PARENT
import android.view.WindowInsets
import android.view.ViewGroup.LayoutParams.WRAP_CONTENT
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import java.time.Instant

// Jednostavan zaslon: stanje + konfiguracija. Namjerno bez UI biblioteka.
class MainActivity : Activity() {

    private lateinit var gateway: Gateway
    private lateinit var status: TextView
    private lateinit var endpoint: EditText
    private lateinit var deviceId: EditText
    private lateinit var secret: EditText
    private lateinit var allowlist: EditText

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        gateway = Gateway.get(this)
        DebugTools.applyIntentConfig(intent, gateway.config)

        val pad = (16 * resources.displayMetrics.density).toInt()
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(pad, pad, pad, pad)
        }
        status = TextView(this).apply { setTextIsSelectable(true) }
        root.addView(status)

        root.addView(button("Dozvola za čitanje obavijesti") {
            startActivity(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS))
        })
        root.addView(button("Isključi optimizaciju baterije") {
            startActivity(
                Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:$packageName"))
            )
        })

        endpoint = field(root, "Endpoint (https://…)", InputType.TYPE_TEXT_VARIATION_URI)
        deviceId = field(root, "Device ID", InputType.TYPE_CLASS_TEXT)
        secret = field(root, "HMAC tajna", InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD)
        allowlist = field(root, "Allowlist paketa (jedan po retku)", InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_MULTI_LINE)
        allowlist.minLines = 4

        root.addView(button("Spremi") { save() })
        root.addView(button("Pošalji red i heartbeat") {
            gateway.heartbeat(BankNotificationListener.connected)
            status.postDelayed({ refresh() }, 1500)
        })
        root.addView(button("Osvježi") { refresh() })
        DebugTools.addButtons(this, root) { refresh() }

        setContentView(ScrollView(this).apply {
            addView(root)
            // Android 15+ crta ispod sistemskih traka; odmakni sadržaj.
            setOnApplyWindowInsetsListener { v, insets ->
                val bars = insets.getInsets(WindowInsets.Type.systemBars())
                v.setPadding(bars.left, 0, bars.right, bars.bottom)
                insets
            }
        })
        load()
    }

    override fun onResume() {
        super.onResume()
        refresh()
    }

    private fun load() {
        val c = gateway.config
        endpoint.setText(c.endpoint)
        deviceId.setText(c.deviceId)
        secret.setText(c.secret)
        allowlist.setText(c.allowlist.sorted().joinToString("\n"))
    }

    private fun save() {
        val c = gateway.config
        c.endpoint = endpoint.text.toString()
        c.deviceId = deviceId.text.toString()
        c.secret = secret.text.toString()
        c.allowlist = allowlist.text.toString().lines().toSet()
        load()
        refresh()
    }

    private fun refresh() {
        val c = gateway.config
        val s = gateway.store.stats()
        val listenerEnabled = Settings.Secure.getString(contentResolver, "enabled_notification_listeners")
            ?.contains(ComponentName(this, BankNotificationListener::class.java).flattenToString()) == true
        val batteryExempt = getSystemService(PowerManager::class.java).isIgnoringBatteryOptimizations(packageName)
        status.text = buildString {
            appendLine("${getString(R.string.app_name)} ${BuildConfig.VERSION_NAME}${if (BuildConfig.DEBUG) " (debug)" else ""}")
            appendLine("Dozvola obavijesti: ${yesNo(listenerEnabled)}   listener spojen: ${yesNo(BankNotificationListener.connected)}")
            appendLine("Bez optimizacije baterije: ${yesNo(batteryExempt)}")
            appendLine("Konfiguracija potpuna: ${yesNo(c.isComplete)}   uređaj: ${c.deviceId.ifEmpty { "—" }}")
            appendLine("Red: ${s.pending} čeka, ${s.acked} potvrđeno, ${s.failed} odbijeno")
            appendLine("Zadnja potvrda: ${s.lastAckAt?.let { Instant.ofEpochMilli(it).toString() } ?: "—"}")
            gateway.lastFlushError?.let { appendLine("Greška slanja: $it") }
            s.lastError?.let { appendLine("Zadnja greška u redu: $it") }
        }
    }

    private fun yesNo(b: Boolean) = if (b) "da" else "NE"

    private fun button(label: String, onClick: () -> Unit) = Button(this).apply {
        text = label
        isAllCaps = false
        setOnClickListener { onClick() }
    }

    private fun field(root: LinearLayout, label: String, inputType: Int): EditText {
        root.addView(TextView(this).apply { text = label; setPadding(0, 24, 0, 0) })
        return EditText(this).apply {
            this.inputType = inputType
            layoutParams = LinearLayout.LayoutParams(MATCH_PARENT, WRAP_CONTENT)
            root.addView(this)
        }
    }
}
