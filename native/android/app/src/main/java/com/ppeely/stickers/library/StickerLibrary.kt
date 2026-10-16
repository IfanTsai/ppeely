package com.ppeely.stickers.library

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.DocumentsContract
import androidx.core.content.edit

data class LibraryDocument(val uri: Uri, val name: String)

/**
 * Reads the files of stickers sent and received in WhatsApp.
 *
 * Since Android 11, apps cannot read `Android/media/<other app>` directories directly; the user has to grant access through the system directory picker.
 * The user may grant the sticker directory itself or any of its ancestor directories; this builds the sticker directory from the document ID and lists the WebP files in it.
 */
class StickerLibrary(private val context: Context) {
    private val preferences = context.getSharedPreferences("sticker_library", Context.MODE_PRIVATE)

    /** Initial location of the directory picker, pointing at WhatsApp's sticker directory. */
    val initialUri: Uri = DocumentsContract.buildDocumentUri(STORAGE_AUTHORITY, STICKER_DOCUMENT_ID)

    val grantedTree: Uri?
        get() {
            val saved = preferences.getString(KEY_TREE, null)?.let(Uri::parse) ?: return null
            val stillGranted = context.contentResolver.persistedUriPermissions.any { it.uri == saved && it.isReadPermission }

            return saved.takeIf { stillGranted }
        }

    fun remember(tree: Uri) {
        context.contentResolver.takePersistableUriPermission(tree, Intent.FLAG_GRANT_READ_URI_PERMISSION)
        preferences.edit { putString(KEY_TREE, tree.toString()) }
    }

    fun list(): List<LibraryDocument> {
        val tree = grantedTree ?: return emptyList()
        val treeId = DocumentsContract.getTreeDocumentId(tree)

        // If the grant is for an ancestor of the sticker directory, go straight to the sticker directory; otherwise list the granted directory itself.
        val directoryId = if (STICKER_DOCUMENT_ID.startsWith(treeId)) STICKER_DOCUMENT_ID else treeId
        val children = DocumentsContract.buildChildDocumentsUriUsingTree(tree, directoryId)
        val columns = arrayOf(
            DocumentsContract.Document.COLUMN_DOCUMENT_ID,
            DocumentsContract.Document.COLUMN_DISPLAY_NAME,
            DocumentsContract.Document.COLUMN_LAST_MODIFIED,
        )

        val documents = mutableListOf<Pair<Long, LibraryDocument>>()
        try {
            context.contentResolver.query(children, columns, null, null, null)?.use { cursor ->
                while (cursor.moveToNext()) {
                    val name = cursor.getString(1) ?: continue
                    if (!name.endsWith(".webp", ignoreCase = true)) {
                        continue
                    }

                    val uri = DocumentsContract.buildDocumentUriUsingTree(tree, cursor.getString(0))
                    documents += cursor.getLong(2) to LibraryDocument(uri, name)
                }
            }
        } catch (_: RuntimeException) {
            // If the directory does not exist (e.g. no stickers have been sent or received yet) or the grant has been revoked, treat it as an empty list.
            return emptyList()
        }

        return documents.sortedByDescending { it.first }.take(MAX_DOCUMENTS).map { it.second }
    }

    private companion object {
        const val KEY_TREE = "tree"
        const val STORAGE_AUTHORITY = "com.android.externalstorage.documents"
        const val STICKER_DOCUMENT_ID = "primary:Android/media/com.whatsapp/WhatsApp/Media/WhatsApp Stickers"
        const val MAX_DOCUMENTS = 600
    }
}
