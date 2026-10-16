package com.ppeely.e2e.whatsappdouble

import android.os.Bundle
import android.util.Log
import android.view.Gravity
import android.view.ViewGroup
import android.widget.ImageView
import android.widget.LinearLayout
import androidx.appcompat.app.AppCompatActivity
import androidx.appcompat.widget.AppCompatEditText
import androidx.core.view.ViewCompat
import org.json.JSONObject
import java.io.File

/** Acts as a chat screen: a text field that accepts stickers. When a sticker arrives, reads its content, displays it, and writes it to a report file. */
class ChatActivity : AppCompatActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val preview = ImageView(this)
        val input = AppCompatEditText(this).apply { hint = "Message" }

        ViewCompat.setOnReceiveContentListener(input, ACCEPTED_TYPES) { _, payload ->
            val description = payload.clip.description
            val uri = payload.clip.getItemAt(0).uri
            val report = JSONObject().put("mimeType", description.getMimeType(0)).put("uri", uri.toString())

            try {
                val bytes = contentResolver.openInputStream(uri)!!.use { it.readBytes() }
                val info = WebpInspector.inspect(bytes)
                report.put("ok", info != null).put("bytes", bytes.size).put("width", info?.width).put("height", info?.height).put("frames", info?.frameCount)
                preview.setImageURI(uri)
            } catch (error: Exception) {
                report.put("ok", false).put("error", error.toString())
            }

            Log.i("WhatsAppDouble", report.toString())
            File(filesDir, "last-received.json").writeText(report.toString(2))
            null
        }

        setContentView(
            LinearLayout(this).apply {
                orientation = LinearLayout.VERTICAL
                gravity = Gravity.BOTTOM
                addView(preview, LinearLayout.LayoutParams(400, 400))
                addView(input, ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
            },
        )
        input.requestFocus()
    }

    private companion object {
        val ACCEPTED_TYPES = arrayOf("image/webp.wasticker", "image/webp", "image/png", "image/gif")
    }
}
