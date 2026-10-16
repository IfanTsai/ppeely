package com.ppeely.stickers

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.provider.OpenableColumns
import android.widget.Toast
import java.io.File
import java.io.IOException
import java.util.UUID

/**
 * Receives sticker pack files handed over by other apps ("Open with" or "Share").
 *
 * This is a trampoline activity with no UI: the content:// read permission from the external app is granted only to the component that receives the Intent,
 * so the file is copied to the cache directory right here, and the cache path is passed on to the main screen for the web layer to read and import.
 * The file type filters are declared only on this component, so the "Open .wastickers files" setting takes effect by enabling or disabling it
 * without affecting the main screen.
 */
class ImportActivity : Activity() {
    // The failure message follows the language picked in the app's settings.
    override fun attachBaseContext(newBase: Context) {
        super.attachBaseContext(AppLanguage.localize(newBase))
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val uri = incomingUri(intent)
        val path = uri?.let { IncomingFiles.copyToCache(this, it) }

        if (uri != null && path != null) {
            val forward = Intent(this, MainActivity::class.java)
                .setAction(IncomingFiles.ACTION_IMPORT)
                .putExtra(IncomingFiles.EXTRA_PATH, path)
                .putExtra(IncomingFiles.EXTRA_NAME, IncomingFiles.displayName(this, uri))
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)

            startActivity(forward)
        } else {
            Toast.makeText(this, R.string.import_failed, Toast.LENGTH_SHORT).show()
        }

        finish()
    }

    private fun incomingUri(intent: Intent?): Uri? = when (intent?.action) {
        Intent.ACTION_VIEW -> intent.data?.takeIf { it.scheme == "content" || it.scheme == "file" }
        Intent.ACTION_SEND -> @Suppress("DEPRECATION") intent.getParcelableExtra(Intent.EXTRA_STREAM)
        else -> null
    }
}

object IncomingFiles {
    const val ACTION_IMPORT = "com.ppeely.stickers.action.IMPORT"
    const val EXTRA_PATH = "incoming_path"
    const val EXTRA_NAME = "incoming_name"

    private const val DIRECTORY = "incoming"

    /** Copies the content the URI points to into the cache directory and returns its path relative to the cache directory, or null if reading fails. */
    fun copyToCache(context: Context, uri: Uri): String? {
        val target = File(File(context.cacheDir, DIRECTORY).apply { mkdirs() }, "${UUID.randomUUID()}.bin")

        try {
            context.contentResolver.openInputStream(uri)?.use { input ->
                target.outputStream().use { output -> input.copyTo(output) }
            } ?: return null
        } catch (_: IOException) {
            return null
        } catch (_: SecurityException) {
            return null
        }

        return "$DIRECTORY/${target.name}"
    }

    fun displayName(context: Context, uri: Uri): String {
        val fromProvider = try {
            context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
                if (cursor.moveToFirst()) cursor.getString(0) else null
            }
        } catch (_: RuntimeException) {
            null
        }

        return fromProvider ?: uri.lastPathSegment ?: "import"
    }
}
