package ai.domovina.bankpush

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper

// Lokalni red: svaki događaj se najprije trajno zapiše, tek onda šalje.
// Brišu se samo potvrđeni (acked) stariji od RETENTION_DAYS.
class EventStore(context: Context) : SQLiteOpenHelper(context, "events.db", null, 1) {

    data class Pending(val id: Long, val seq: Long, val body: String)

    data class Stats(val pending: Int, val acked: Int, val failed: Int, val lastAckAt: Long?, val lastError: String?)

    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL(
            """
            CREATE TABLE events (
              id            INTEGER PRIMARY KEY AUTOINCREMENT,
              seq           INTEGER,
              content_hash  TEXT NOT NULL UNIQUE,
              body          TEXT,
              created_at    INTEGER NOT NULL,
              acked_at      INTEGER,
              failed_at     INTEGER,
              attempts      INTEGER NOT NULL DEFAULT 0,
              last_error    TEXT
            )
            """.trimIndent()
        )
        db.execSQL("CREATE INDEX events_pending ON events (acked_at, failed_at, id)")
    }

    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) = Unit

    /** Vraća false ako je isti sadržaj već u redu (lokalni dedup). */
    fun enqueue(contentHash: String, buildBody: (seq: Long) -> String, seqBase: Long): Boolean {
        val db = writableDatabase
        db.beginTransaction()
        try {
            val values = ContentValues().apply {
                put("content_hash", contentHash)
                put("created_at", System.currentTimeMillis())
            }
            val rowId = db.insertWithOnConflict("events", null, values, SQLiteDatabase.CONFLICT_IGNORE)
            if (rowId == -1L) return false
            val seq = seqBase + rowId
            db.update("events", ContentValues().apply {
                put("seq", seq)
                put("body", buildBody(seq))
            }, "id = ?", arrayOf(rowId.toString()))
            db.setTransactionSuccessful()
            return true
        } finally {
            db.endTransaction()
        }
    }

    fun pending(limit: Int = 50): List<Pending> =
        readableDatabase.rawQuery(
            "SELECT id, seq, body FROM events WHERE acked_at IS NULL AND failed_at IS NULL ORDER BY id LIMIT ?",
            arrayOf(limit.toString()),
        ).use { c ->
            buildList { while (c.moveToNext()) add(Pending(c.getLong(0), c.getLong(1), c.getString(2))) }
        }

    fun markAcked(id: Long) = update(id, ContentValues().apply {
        put("acked_at", System.currentTimeMillis())
        putNull("last_error")
    })

    // Trajna greška (npr. 400): ne blokira red, ostaje lokalno za ručni pregled.
    fun markFailed(id: Long, error: String) = update(id, ContentValues().apply {
        put("failed_at", System.currentTimeMillis())
        put("last_error", error)
    })

    fun markAttempt(id: Long, error: String) {
        writableDatabase.execSQL(
            "UPDATE events SET attempts = attempts + 1, last_error = ? WHERE id = ?",
            arrayOf<Any>(error, id),
        )
    }

    fun prune() {
        val cutoff = System.currentTimeMillis() - RETENTION_DAYS * 24 * 3600 * 1000L
        writableDatabase.delete("events", "acked_at IS NOT NULL AND acked_at < ?", arrayOf(cutoff.toString()))
    }

    fun stats(): Stats = readableDatabase.rawQuery(
        """
        SELECT
          SUM(acked_at IS NULL AND failed_at IS NULL),
          SUM(acked_at IS NOT NULL),
          SUM(failed_at IS NOT NULL),
          MAX(acked_at),
          (SELECT last_error FROM events WHERE last_error IS NOT NULL ORDER BY id DESC LIMIT 1)
        FROM events
        """.trimIndent(),
        null,
    ).use { c ->
        c.moveToFirst()
        Stats(c.getInt(0), c.getInt(1), c.getInt(2), if (c.isNull(3)) null else c.getLong(3), c.getString(4))
    }

    private fun update(id: Long, values: ContentValues) {
        writableDatabase.update("events", values, "id = ?", arrayOf(id.toString()))
    }

    private companion object {
        const val RETENTION_DAYS = 30
    }
}
