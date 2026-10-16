package com.ppeely.e2e.whatsappdouble

import android.content.ContentResolver
import android.graphics.BitmapFactory
import android.net.Uri
import org.json.JSONArray
import org.json.JSONObject

class ValidationException(message: String) : Exception(message)

/**
 * Reads and validates a sticker pack according to WhatsApp's public third-party sticker protocol.
 *
 * The rules come from the documentation and validator of WhatsApp's official sticker sample project
 * (github.com/WhatsApp/stickers): length and character limits for the identifier, name, and publisher;
 * tray icon at most 50 KB with sides of 24 to 512 pixels; 3 to 30 stickers per pack; each sticker
 * 512×512 with at most 3 emojis, static stickers at most 100 KB and animated stickers at most 500 KB;
 * animated sticker frames at least 8 ms each with a total duration of at most 10 seconds; all stickers
 * in one pack must be either all static or all animated.
 */
class PackValidator(private val resolver: ContentResolver, private val authority: String) {
    fun validate(identifier: String): JSONObject {
        val report = JSONObject().put("identifier", identifier).put("authority", authority)

        val metadata = resolver.query(uri("metadata", identifier), null, null, null, null)
            ?: throw ValidationException("metadata query returned null")
        val pack = metadata.use { cursor ->
            if (!cursor.moveToFirst()) {
                throw ValidationException("sticker pack $identifier not found in metadata")
            }

            JSONObject().apply {
                for (column in cursor.columnNames) {
                    put(column, cursor.getString(cursor.getColumnIndexOrThrow(column)))
                }
            }
        }
        report.put("metadata", pack)

        val name = pack.optString("sticker_pack_name")
        val publisher = pack.optString("sticker_pack_publisher")
        val trayIcon = pack.optString("sticker_pack_icon")
        val animatedPack = pack.optString("animated_sticker_pack") == "1"

        check(pack.optString("sticker_pack_identifier") == identifier) { "identifier mismatch" }
        check(identifier.isNotEmpty() && identifier.length <= CHAR_COUNT_MAX) { "identifier length" }
        check(Regex("[\\w-.,'\\s]+").matches(identifier) && !identifier.contains("..")) { "identifier contains invalid characters" }
        check(name.isNotEmpty() && name.length <= CHAR_COUNT_MAX) { "sticker pack name is empty or too long" }
        check(publisher.isNotEmpty() && publisher.length <= CHAR_COUNT_MAX) { "sticker pack publisher is empty or too long" }
        check(pack.optString("image_data_version").isNotEmpty()) { "image_data_version is empty" }
        check(trayIcon.isNotEmpty()) { "sticker pack tray id is empty" }

        val tray = read(identifier, trayIcon)
        check(tray.size <= TRAY_MAX_BYTES) { "tray image should be less than 50 KB, is ${tray.size} bytes" }
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeByteArray(tray, 0, tray.size, bounds)
        check(bounds.outWidth in TRAY_MIN_SIZE..TRAY_MAX_SIZE && bounds.outHeight in TRAY_MIN_SIZE..TRAY_MAX_SIZE) {
            "tray image dimensions ${bounds.outWidth}x${bounds.outHeight} are out of range"
        }
        report.put("tray", JSONObject().put("file", trayIcon).put("bytes", tray.size).put("width", bounds.outWidth).put("height", bounds.outHeight))

        val rows = mutableListOf<Pair<String, String>>()
        resolver.query(uri("stickers", identifier), null, null, null, null)?.use { cursor ->
            val fileColumn = cursor.getColumnIndexOrThrow("sticker_file_name")
            val emojiColumn = cursor.getColumnIndexOrThrow("sticker_emoji")
            while (cursor.moveToNext()) {
                rows += cursor.getString(fileColumn) to cursor.getString(emojiColumn).orEmpty()
            }
        } ?: throw ValidationException("stickers query returned null")
        check(rows.size in STICKERS_MIN..STICKERS_MAX) { "sticker pack sticker count should be between 3 to 30 inclusive, it currently has ${rows.size}" }

        val stickers = JSONArray()
        for ((file, emojiText) in rows) {
            val emojis = emojiText.split(',').filter { it.isNotEmpty() }
            check(emojis.size <= EMOJI_MAX) { "$file has more than 3 emojis" }

            val bytes = read(identifier, file)
            val info = WebpInspector.inspect(bytes) ?: throw ValidationException("$file is not a WebP image")
            check(info.width == STICKER_SIZE && info.height == STICKER_SIZE) { "$file should be 512x512, is ${info.width}x${info.height}" }

            if (animatedPack) {
                check(info.frameCount > 1) { "this pack is marked as animated sticker pack, all stickers should animate, $file does not" }
                check(bytes.size <= ANIMATED_MAX_BYTES) { "animated sticker $file should be less than 500 KB, is ${bytes.size} bytes" }
                check(info.frameDurations.all { it >= FRAME_MIN_MS }) { "$file has a frame shorter than 8 ms" }
                check(info.frameDurations.sum() <= TOTAL_MAX_MS) { "$file is longer than 10 seconds" }
            } else {
                check(info.frameCount == 1) { "this pack is not marked as animated sticker pack, all stickers should be static stickers, $file is animated" }
                check(bytes.size <= STATIC_MAX_BYTES) { "static sticker $file should be less than 100 KB, is ${bytes.size} bytes" }
            }

            stickers.put(
                JSONObject()
                    .put("file", file)
                    .put("emojis", JSONArray(emojis))
                    .put("bytes", bytes.size)
                    .put("frames", info.frameCount)
                    .put("durationMs", info.frameDurations.sum()),
            )
        }

        return report.put("animated", animatedPack).put("stickers", stickers)
    }

    private fun read(identifier: String, file: String): ByteArray {
        val asset = Uri.Builder().scheme("content").authority(authority)
            .appendPath("stickers_asset").appendPath(identifier).appendPath(file).build()

        return try {
            resolver.openInputStream(asset)?.use { it.readBytes() }
        } catch (error: Exception) {
            throw ValidationException("cannot open $file: ${error.message}")
        } ?: throw ValidationException("cannot open $file")
    }

    private fun uri(path: String, identifier: String): Uri =
        Uri.Builder().scheme("content").authority(authority).appendPath(path).appendPath(identifier).build()

    private inline fun check(condition: Boolean, message: () -> String) {
        if (!condition) {
            throw ValidationException(message())
        }
    }

    private companion object {
        const val CHAR_COUNT_MAX = 128
        const val EMOJI_MAX = 3
        const val STICKERS_MIN = 3
        const val STICKERS_MAX = 30
        const val STICKER_SIZE = 512
        const val STATIC_MAX_BYTES = 100 * 1024
        const val ANIMATED_MAX_BYTES = 500 * 1024
        const val TRAY_MAX_BYTES = 50 * 1024
        const val TRAY_MIN_SIZE = 24
        const val TRAY_MAX_SIZE = 512
        const val FRAME_MIN_MS = 8
        const val TOTAL_MAX_MS = 10_000
    }
}
