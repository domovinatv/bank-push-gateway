package ai.domovina.bankpush

import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

// Isti format kao worker/src/auth.ts: hex(HMAC-SHA256(tajna, "<timestamp>.<tijelo>")).
object Signer {
    fun sign(secret: String, timestampSeconds: Long, body: String): String =
        hmacSha256Hex(secret, "$timestampSeconds.$body")

    fun hmacSha256Hex(secret: String, message: String): String {
        val mac = Mac.getInstance("HmacSHA256")
        mac.init(SecretKeySpec(secret.toByteArray(Charsets.UTF_8), "HmacSHA256"))
        return mac.doFinal(message.toByteArray(Charsets.UTF_8)).toHex()
    }

    fun sha256Hex(message: String): String =
        java.security.MessageDigest.getInstance("SHA-256")
            .digest(message.toByteArray(Charsets.UTF_8)).toHex()

    private fun ByteArray.toHex(): String = joinToString("") { "%02x".format(it) }
}
