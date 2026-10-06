package ai.domovina.bankpush

import android.app.Activity
import android.content.Intent
import android.widget.LinearLayout

// Release: nema konfiguracije preko intenta ni testnih obavijesti.
object DebugTools {
    fun applyIntentConfig(intent: Intent?, config: Config) = Unit
    fun addButtons(activity: Activity, root: LinearLayout, onDone: () -> Unit) = Unit
}
