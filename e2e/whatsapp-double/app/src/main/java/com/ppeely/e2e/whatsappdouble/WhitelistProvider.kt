package com.ppeely.e2e.whatsappdouble

import android.content.ContentProvider
import android.content.ContentValues
import android.database.Cursor
import android.database.MatrixCursor
import android.net.Uri

/** `content://com.whatsapp.provider.sticker_whitelist_check/is_whitelisted?authority=…&identifier=…` */
class WhitelistProvider : ContentProvider() {
    override fun onCreate(): Boolean = true

    override fun query(uri: Uri, projection: Array<out String>?, selection: String?, selectionArgs: Array<out String>?, sortOrder: String?): Cursor {
        val authority = uri.getQueryParameter("authority").orEmpty()
        val identifier = uri.getQueryParameter("identifier").orEmpty()
        val added = uri.lastPathSegment == "is_whitelisted" && Whitelist.contains(requireNotNull(context), authority, identifier)

        return MatrixCursor(arrayOf("result")).apply { addRow(arrayOf(if (added) 1 else 0)) }
    }

    override fun getType(uri: Uri): String? = null

    override fun insert(uri: Uri, values: ContentValues?): Uri? = null

    override fun delete(uri: Uri, selection: String?, selectionArgs: Array<out String>?): Int = 0

    override fun update(uri: Uri, values: ContentValues?, selection: String?, selectionArgs: Array<out String>?): Int = 0
}
