package ai.domovina.bankpush

import android.Manifest
import android.app.Activity
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Intent
import android.content.pm.PackageManager
import android.widget.Button
import android.widget.LinearLayout

// Samo u debug buildu.
object DebugTools {

    // Konfiguracija preko adb-a, bez tipkanja na telefonu:
    //   adb shell am start -n ai.domovina.bankpush.debug/ai.domovina.bankpush.MainActivity \
    //     --es endpoint http://localhost:8787 --es device_id gw-dev-01 --es secret <tajna>
    fun applyIntentConfig(intent: Intent?, config: Config) {
        intent ?: return
        intent.getStringExtra("endpoint")?.let { config.endpoint = it }
        intent.getStringExtra("device_id")?.let { config.deviceId = it }
        intent.getStringExtra("secret")?.let { config.secret = it }
    }

    // Testna obavijest iz vlastite aplikacije (debug allowlist uključuje vlastiti paket).
    fun addButtons(activity: Activity, root: LinearLayout, onDone: () -> Unit) {
        root.addView(Button(activity).apply {
            text = "Testna obavijest"
            isAllCaps = false
            setOnClickListener {
                if (activity.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                    activity.requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 1)
                    return@setOnClickListener
                }
                postTestNotification(activity)
                postDelayed(onDone, 1500)
            }
        })
    }

    private var counter = 0

    private fun postTestNotification(activity: Activity) {
        val nm = activity.getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(NotificationChannel("test", "Test", NotificationManager.IMPORTANCE_DEFAULT))
        counter++
        val text = "Priljev 1,${"%02d".format(counter % 100)} EUR (test)"
        val n = Notification.Builder(activity, "test")
            .setSmallIcon(android.R.drawable.stat_notify_more)
            .setContentTitle("Test priljev")
            .setContentText(text)
            .setStyle(Notification.BigTextStyle().bigText("$text\nRaspoloživo stanje: 0,00 EUR"))
            .build()
        nm.notify(1000 + counter, n)
    }
}
