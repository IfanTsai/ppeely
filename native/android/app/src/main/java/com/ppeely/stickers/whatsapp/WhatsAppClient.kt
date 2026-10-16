package com.ppeely.stickers.whatsapp

import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri

/** The two WhatsApp editions, regular and Business, each keeping its own list of added sticker packs. */
enum class WhatsAppVariant(val packageName: String, private val whitelistAuthority: String) {
    CONSUMER("com.whatsapp", "com.whatsapp.provider.sticker_whitelist_check"),
    BUSINESS("com.whatsapp.w4b", "com.whatsapp.w4b.provider.sticker_whitelist_check");

    fun isInstalled(context: Context): Boolean = try {
        context.packageManager.getApplicationInfo(packageName, 0).enabled
    } catch (_: PackageManager.NameNotFoundException) {
        false
    }

    /** Asks WhatsApp whether the user has already added a given sticker pack. */
    fun isPackAdded(context: Context, packId: String): Boolean {
        if (!isInstalled(context)) {
            return false
        }

        val uri = Uri.Builder()
            .scheme("content")
            .authority(whitelistAuthority)
            .appendPath("is_whitelisted")
            .appendQueryParameter("authority", StickerContentProvider.AUTHORITY)
            .appendQueryParameter("identifier", packId)
            .build()

        return try {
            context.contentResolver.query(uri, null, null, null, null)?.use { cursor ->
                cursor.moveToFirst() && cursor.getInt(cursor.getColumnIndexOrThrow("result")) == 1
            } ?: false
        } catch (_: RuntimeException) {
            // Older WhatsApp versions lack this query interface; treat the pack as "not added".
            false
        }
    }
}

object WhatsAppClient {
    const val RESULT_EXTRA_VALIDATION_ERROR = "validation_error"

    private const val ACTION_ENABLE_STICKER_PACK = "com.whatsapp.intent.action.ENABLE_STICKER_PACK"
    private const val EXTRA_PACK_ID = "sticker_pack_id"
    private const val EXTRA_PACK_AUTHORITY = "sticker_pack_authority"
    private const val EXTRA_PACK_NAME = "sticker_pack_name"

    /**
     * Builds the "Add to WhatsApp" Intent. When `variant` is null, no package is set and the system chooses among the installed WhatsApp editions.
     */
    fun addPackIntent(packId: String, packName: String, variant: WhatsAppVariant?): Intent =
        Intent(ACTION_ENABLE_STICKER_PACK).apply {
            putExtra(EXTRA_PACK_ID, packId)
            putExtra(EXTRA_PACK_AUTHORITY, StickerContentProvider.AUTHORITY)
            putExtra(EXTRA_PACK_NAME, packName)
            variant?.let { setPackage(it.packageName) }
        }
}
