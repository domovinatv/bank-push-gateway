package ai.domovina.bankpush

import org.junit.Assert.assertEquals
import org.junit.Test

class SignerTest {
    @Test
    fun rfc4231TestCase2() {
        assertEquals(
            "5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843",
            Signer.hmacSha256Hex("Jefe", "what do ya want for nothing?"),
        )
    }

    @Test
    fun signsTimestampDotBody() {
        // Isti ulaz kao `printf '%s.%s' 1791295391 '{"seq":1}' | openssl dgst -sha256 -hmac s3cret-s3cret-s3cret`
        assertEquals(
            Signer.hmacSha256Hex("s3cret-s3cret-s3cret", "1791295391.{\"seq\":1}"),
            Signer.sign("s3cret-s3cret-s3cret", 1791295391, "{\"seq\":1}"),
        )
    }
}
