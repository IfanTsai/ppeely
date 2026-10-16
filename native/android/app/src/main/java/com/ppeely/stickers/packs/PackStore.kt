package com.ppeely.stickers.packs

import android.content.Context
import org.json.JSONException
import org.json.JSONObject
import java.io.File
import java.io.IOException

data class StickerRecord(
    val file: String,
    val emojis: List<String>,
)

data class PackRecord(
    val id: String,
    val name: String,
    val author: String,
    val animated: Boolean,
    val trayIcon: String?,
    val imageDataVersion: Int,
    val stickers: List<StickerRecord>,
    /** Transparent sticker used to pad packs with fewer than 3 stickers; provided only to WhatsApp and not shown in the keyboard. */
    val fillers: List<String>,
)

/**
 * Reads the sticker pack index written by the web layer.
 *
 * The web layer uses Capacitor Filesystem to store data in the app-private directory `files/packs/`:
 * `index.json` holds the metadata of all sticker packs, and each pack's images live in the `packs/<id>/` subdirectory.
 * The native side (ContentProvider, keyboard input method) only reads, never writes. Parse results are cached by the index file's modification time and size,
 * so after the web layer rewrites the index, the next query re-parses it and gets the latest content.
 */
class PackStore(context: Context) {
    private val root = File(context.filesDir, ROOT_DIRECTORY)

    // ContentProvider queries may run concurrently on multiple Binder threads; snapshots are immutable, so concurrency causes at most one redundant parse.
    @Volatile
    private var snapshot: Snapshot? = null

    fun list(): List<PackRecord> {
        val index = File(root, INDEX_FILE)

        // Take the timestamp before reading the content: if the file is rewritten during the read, the old timestamp is recorded, and the next query notices the mismatch and re-parses.
        val modified = index.lastModified()
        val length = index.length()
        snapshot?.takeIf { it.modified == modified && it.length == length }?.let { return it.packs }

        val text = try {
            index.readText()
        } catch (_: IOException) {
            return emptyList()
        }

        val packs = try {
            parseIndex(text)
        } catch (_: JSONException) {
            // While the web layer is rewriting the index, the content read may be incomplete; treat it as "no sticker packs" without caching, and the next query recovers.
            return emptyList()
        }

        snapshot = Snapshot(modified, length, packs)

        return packs
    }

    fun find(id: String): PackRecord? = list().firstOrNull { it.id == id }

    fun directory(packId: String): File = File(root, packId)

    fun resolveFile(packId: String, fileName: String): File? = find(packId)?.let { resolveFile(it, fileName) }

    /** Only allows access to files registered in the index, so external apps cannot read other private files through path traversal. */
    fun resolveFile(pack: PackRecord, fileName: String): File? {
        val known = fileName == pack.trayIcon || fileName in pack.fillers || pack.stickers.any { it.file == fileName }
        if (!known) {
            return null
        }

        return File(File(root, pack.id), fileName).takeIf { it.isFile }
    }

    private fun parseIndex(text: String): List<PackRecord> {
        val packs = JSONObject(text).optJSONArray("packs") ?: return emptyList()

        return (0 until packs.length()).map { index ->
            val pack = packs.getJSONObject(index)
            val stickers = pack.getJSONArray("stickers")
            val fillers = pack.optJSONArray("fillers")

            PackRecord(
                id = pack.getString("id"),
                name = pack.getString("name"),
                author = pack.getString("author"),
                animated = pack.optBoolean("animated", false),
                trayIcon = if (pack.isNull("trayIcon")) null else pack.getString("trayIcon"),
                imageDataVersion = pack.optInt("imageDataVersion", 1),
                stickers = (0 until stickers.length()).map { stickerIndex ->
                    val sticker = stickers.getJSONObject(stickerIndex)
                    val emojis = sticker.optJSONArray("emojis")

                    StickerRecord(
                        file = sticker.getString("file"),
                        emojis = if (emojis == null) emptyList() else (0 until emojis.length()).map(emojis::getString),
                    )
                },
                fillers = if (fillers == null) emptyList() else (0 until fillers.length()).map(fillers::getString),
            )
        }
    }

    private class Snapshot(val modified: Long, val length: Long, val packs: List<PackRecord>)

    private companion object {
        const val ROOT_DIRECTORY = "packs"
        const val INDEX_FILE = "index.json"
    }
}
