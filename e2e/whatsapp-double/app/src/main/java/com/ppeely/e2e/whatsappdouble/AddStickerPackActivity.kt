package com.ppeely.e2e.whatsappdouble

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.util.Log
import androidx.core.content.edit
import org.json.JSONObject
import java.io.File

/** Acts as WhatsApp's "Add sticker pack" screen: reads and validates the sticker pack, returns the result to the caller, and writes it to a report file. */
class AddStickerPackActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val identifier = intent.getStringExtra("sticker_pack_id").orEmpty()
        val authority = intent.getStringExtra("sticker_pack_authority").orEmpty()
        val report = JSONObject()
            .put("caller", callingPackage)
            .put("extraName", intent.getStringExtra("sticker_pack_name"))

        try {
            report.put("pack", PackValidator(contentResolver, authority).validate(identifier))
            report.put("ok", true)
            Whitelist.add(this, authority, identifier)
            setResult(RESULT_OK)
        } catch (error: Exception) {
            val message = error.message ?: error.toString()
            report.put("ok", false).put("error", message)
            setResult(RESULT_CANCELED, Intent().putExtra("validation_error", message))
        }

        Log.i("WhatsAppDouble", report.toString())
        File(filesDir, "last-add.json").writeText(report.toString(2))
        finish()
    }
}

object Whitelist {
    private fun preferences(context: Context) = context.getSharedPreferences("whitelist", Context.MODE_PRIVATE)

    fun add(context: Context, authority: String, identifier: String) {
        preferences(context).edit { putBoolean("$authority/$identifier", true) }
    }

    fun contains(context: Context, authority: String, identifier: String): Boolean =
        preferences(context).getBoolean("$authority/$identifier", false)
}
