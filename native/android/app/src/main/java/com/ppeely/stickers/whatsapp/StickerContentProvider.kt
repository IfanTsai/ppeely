package com.ppeely.stickers.whatsapp

import android.content.ContentProvider
import android.content.ContentResolver
import android.content.ContentValues
import android.content.UriMatcher
import android.content.res.AssetFileDescriptor
import android.database.Cursor
import android.database.MatrixCursor
import android.net.Uri
import android.os.ParcelFileDescriptor
import com.ppeely.stickers.BuildConfig
import com.ppeely.stickers.packs.PackRecord
import com.ppeely.stickers.packs.PackStore

/**
 * ContentProvider that WhatsApp uses to read third-party sticker packs.
 *
 * WhatsApp does not accept image data pushed by apps. Instead, after the user confirms adding a pack, it queries this authority for the sticker pack's
 * metadata and sticker list, then opens the sticker files one by one. Paths and column names are defined by WhatsApp and must not change.
 * Access is protected by the `com.whatsapp.sticker.READ` permission (declared in AndroidManifest.xml), which only WhatsApp holds.
 */
class StickerContentProvider : ContentProvider() {
    private lateinit var store: PackStore

    override fun onCreate(): Boolean {
        store = PackStore(requireNotNull(context))

        return true
    }

    override fun query(
        uri: Uri,
        projection: Array<out String>?,
        selection: String?,
        selectionArgs: Array<out String>?,
        sortOrder: String?,
    ): Cursor {
        val cursor = when (MATCHER.match(uri)) {
            CODE_METADATA -> packCursor(store.list())
            CODE_METADATA_SINGLE -> packCursor(listOfNotNull(store.find(uri.lastPathSegment.orEmpty())))
            CODE_STICKERS -> stickerCursor(store.find(uri.lastPathSegment.orEmpty()))
            else -> throw IllegalArgumentException("Unknown URI: $uri")
        }
        cursor.setNotificationUri(requireNotNull(context).contentResolver, uri)

        return cursor
    }

    override fun getType(uri: Uri): String = when (MATCHER.match(uri)) {
        CODE_METADATA -> "${ContentResolver.CURSOR_DIR_BASE_TYPE}/vnd.$AUTHORITY.$PATH_METADATA"
        CODE_METADATA_SINGLE -> "${ContentResolver.CURSOR_ITEM_BASE_TYPE}/vnd.$AUTHORITY.$PATH_METADATA"
        CODE_STICKERS -> "${ContentResolver.CURSOR_DIR_BASE_TYPE}/vnd.$AUTHORITY.$PATH_STICKERS"
        CODE_ASSET -> if (uri.lastPathSegment.orEmpty().endsWith(".png")) "image/png" else "image/webp"
        else -> throw IllegalArgumentException("Unknown URI: $uri")
    }

    override fun openAssetFile(uri: Uri, mode: String): AssetFileDescriptor? {
        if (MATCHER.match(uri) != CODE_ASSET) {
            return null
        }

        val segments = uri.pathSegments
        require(segments.size == 3) { "path segments should be 3, uri is: $uri" }

        val file = store.resolveFile(packId = segments[1], fileName = segments[2]) ?: return null
        val descriptor = ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY)

        return AssetFileDescriptor(descriptor, 0, AssetFileDescriptor.UNKNOWN_LENGTH)
    }

    override fun insert(uri: Uri, values: ContentValues?): Uri? = throw UnsupportedOperationException("Not supported")

    override fun delete(uri: Uri, selection: String?, selectionArgs: Array<out String>?): Int =
        throw UnsupportedOperationException("Not supported")

    override fun update(uri: Uri, values: ContentValues?, selection: String?, selectionArgs: Array<out String>?): Int =
        throw UnsupportedOperationException("Not supported")

    private fun packCursor(packs: List<PackRecord>): Cursor {
        val cursor = MatrixCursor(PACK_COLUMNS)

        for (pack in packs) {
            cursor.newRow()
                .add(pack.id)
                .add(pack.name)
                .add(pack.author)
                .add(pack.trayIcon.orEmpty())
                .add("")
                .add("")
                .add("")
                .add("")
                .add("")
                .add("")
                .add(pack.imageDataVersion.toString())
                .add(0)
                .add(if (pack.animated) 1 else 0)
        }

        return cursor
    }

    private fun stickerCursor(pack: PackRecord?): Cursor {
        val cursor = MatrixCursor(STICKER_COLUMNS)

        for (sticker in pack?.stickers.orEmpty()) {
            cursor.addRow(arrayOf(sticker.file, sticker.emojis.joinToString(","), ""))
        }

        // WhatsApp requires at least 3 stickers per sticker pack; pad with the transparent filler stickers prepared by the web layer when there are fewer.
        for (filler in pack?.fillers.orEmpty()) {
            cursor.addRow(arrayOf(filler, FILLER_EMOJI, ""))
        }

        return cursor
    }

    companion object {
        const val AUTHORITY = BuildConfig.APPLICATION_ID + ".stickercontentprovider"

        private const val PATH_METADATA = "metadata"
        private const val PATH_STICKERS = "stickers"
        private const val PATH_ASSET = "stickers_asset"

        private const val CODE_METADATA = 1
        private const val CODE_METADATA_SINGLE = 2
        private const val CODE_STICKERS = 3
        private const val CODE_ASSET = 4

        // Emoji tagged on filler stickers: white square. It is not in WhatsApp's search category list, so filler stickers are not put into any category.
        private const val FILLER_EMOJI = "\u2B1C"

        private val PACK_COLUMNS = arrayOf(
            "sticker_pack_identifier",
            "sticker_pack_name",
            "sticker_pack_publisher",
            "sticker_pack_icon",
            "android_play_store_link",
            "ios_app_download_link",
            "sticker_pack_publisher_email",
            "sticker_pack_publisher_website",
            "sticker_pack_privacy_policy_website",
            "sticker_pack_license_agreement_website",
            "image_data_version",
            "whatsapp_will_not_cache_stickers",
            "animated_sticker_pack",
        )

        private val STICKER_COLUMNS = arrayOf(
            "sticker_file_name",
            "sticker_emoji",
            "sticker_accessibility_text",
        )

        private val MATCHER = UriMatcher(UriMatcher.NO_MATCH).apply {
            addURI(AUTHORITY, PATH_METADATA, CODE_METADATA)
            addURI(AUTHORITY, "$PATH_METADATA/*", CODE_METADATA_SINGLE)
            addURI(AUTHORITY, "$PATH_STICKERS/*", CODE_STICKERS)
            addURI(AUTHORITY, "$PATH_ASSET/*/*", CODE_ASSET)
        }
    }
}
