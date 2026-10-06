package ai.domovina.bankpush

import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL

// HTTP klijent prema Workeru. Svaki zahtjev potpisan HMAC-om (worker/src/auth.ts).
class Sender(private val config: Config) {

    data class Response(val code: Int, val body: String)

    @Throws(IOException::class)
    fun post(path: String, body: String): Response {
        val ts = System.currentTimeMillis() / 1000
        val conn = URL(config.endpoint + path).openConnection() as HttpURLConnection
        try {
            conn.requestMethod = "POST"
            conn.connectTimeout = 10_000
            conn.readTimeout = 15_000
            conn.doOutput = true
            conn.setRequestProperty("content-type", "application/json")
            conn.setRequestProperty("x-device-id", config.deviceId)
            conn.setRequestProperty("x-timestamp", ts.toString())
            conn.setRequestProperty("x-signature", Signer.sign(config.secret, ts, body))
            val bytes = body.toByteArray(Charsets.UTF_8)
            conn.setFixedLengthStreamingMode(bytes.size)
            conn.outputStream.use { it.write(bytes) }
            val code = conn.responseCode
            val stream = if (code in 200..299) conn.inputStream else conn.errorStream
            val text = stream?.bufferedReader()?.use { it.readText() }.orEmpty()
            return Response(code, text.take(500))
        } finally {
            conn.disconnect()
        }
    }
}
