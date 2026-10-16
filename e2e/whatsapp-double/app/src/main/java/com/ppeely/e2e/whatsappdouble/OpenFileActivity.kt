package com.ppeely.e2e.whatsappdouble

import android.app.Activity
import android.content.Intent
import android.os.Bundle
import androidx.core.content.FileProvider
import java.io.File

/**
 * Acts as a file manager or chat app: hands a file from its own private directory to the sticker app to open.
 * The file is passed as a content:// URI through FileProvider with a one-time read grant, the same way real apps pass files to each other.
 *
 * Usage: adb shell am start -n com.whatsapp/com.ppeely.e2e.whatsappdouble.OpenFileActivity
 *        --es file <file name under files/shared/> --es target <receiver package name> [--ez send true]
 */
class OpenFileActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val file = File(File(filesDir, "shared"), intent.getStringExtra("file").orEmpty())
        val uri = FileProvider.getUriForFile(this, "$packageName.shared", file)
        val asShare = intent.getBooleanExtra("send", false)

        val forward = if (asShare) {
            Intent(Intent.ACTION_SEND).setType(MIME_TYPE).putExtra(Intent.EXTRA_STREAM, uri)
        } else {
            Intent(Intent.ACTION_VIEW).setDataAndType(uri, MIME_TYPE)
        }

        forward.setPackage(intent.getStringExtra("target"))
        forward.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        startActivity(forward)
        finish()
    }

    private companion object {
        const val MIME_TYPE = "application/octet-stream"
    }
}
