package com.ppeely.stickers

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.ComponentName
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.provider.DocumentsContract
import android.provider.Settings
import android.view.inputmethod.InputMethodManager
import androidx.activity.result.ActivityResult
import androidx.core.content.getSystemService
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.ActivityCallback
import com.getcapacitor.annotation.CapacitorPlugin
import com.ppeely.stickers.library.StickerLibrary
import com.ppeely.stickers.whatsapp.WhatsAppClient
import com.ppeely.stickers.whatsapp.WhatsAppVariant
import java.io.File

/**
 * Bridge between the web layer and Android native capabilities: adding sticker packs to WhatsApp, importing external files, and sticker keyboard settings.
 * Sticker creation and storage happen entirely in the web layer; this only handles the parts that must call system APIs.
 */
@CapacitorPlugin(name = "StickerBridge")
class StickerBridgePlugin : Plugin() {
    private var pendingImport: JSObject? = null

    private val library by lazy { StickerLibrary(context) }

    private val importer by lazy { ComponentName(context, ImportActivity::class.java) }

    override fun load() {
        captureIncomingFile(activity.intent)
    }

    override fun handleOnNewIntent(intent: Intent) {
        super.handleOnNewIntent(intent)

        if (captureIncomingFile(intent)) {
            notifyListeners(EVENT_INCOMING_FILE, JSObject(), true)
        }
    }

    @PluginMethod
    fun getWhatsAppStatus(call: PluginCall) {
        val result = JSObject()
            .put("consumerInstalled", WhatsAppVariant.CONSUMER.isInstalled(context))
            .put("businessInstalled", WhatsAppVariant.BUSINESS.isInstalled(context))

        call.resolve(result)
    }

    @PluginMethod
    fun isPackAdded(call: PluginCall) {
        val packId = call.getString("id") ?: return call.reject("id is required")

        val result = JSObject()
            .put("consumer", WhatsAppVariant.CONSUMER.isPackAdded(context, packId))
            .put("business", WhatsAppVariant.BUSINESS.isPackAdded(context, packId))

        call.resolve(result)
    }

    @PluginMethod
    fun addStickerPack(call: PluginCall) {
        val packId = call.getString("id") ?: return call.reject("id is required")
        val packName = call.getString("name") ?: return call.reject("name is required")

        val installed = WhatsAppVariant.entries.filter { it.isInstalled(context) }
        if (installed.isEmpty()) {
            return call.reject("WhatsApp is not installed", ERROR_NOT_INSTALLED)
        }

        // When both versions are installed, prefer the one that has not added this sticker pack yet; if neither has, leave the package unset and let the system have the user choose.
        val notAdded = installed.filterNot { it.isPackAdded(context, packId) }
        val target = when {
            installed.size == 1 -> installed.single()
            notAdded.size == 1 -> notAdded.single()
            else -> null
        }

        try {
            startActivityForResult(call, WhatsAppClient.addPackIntent(packId, packName, target), "onAddStickerPackResult")
        } catch (_: ActivityNotFoundException) {
            call.reject("WhatsApp does not support adding sticker packs", ERROR_NOT_SUPPORTED)
        }
    }

    @ActivityCallback
    private fun onAddStickerPackResult(call: PluginCall?, result: ActivityResult) {
        call ?: return

        val added = result.resultCode == Activity.RESULT_OK
        val response = JSObject().put("added", added)
        if (!added) {
            // A user cancellation carries no extra information; when the sticker pack fails WhatsApp's validation, the reason is in validation_error.
            result.data?.getStringExtra(WhatsAppClient.RESULT_EXTRA_VALIDATION_ERROR)?.let {
                response.put("validationError", it)
            }
        }

        call.resolve(response)
    }

    /** Takes the external file the app was launched with (e.g. a .wastickers file opened from a file manager); each file is returned only once. */
    @PluginMethod
    fun consumeIncomingFile(call: PluginCall) {
        val file = pendingImport
        pendingImport = null

        call.resolve(JSObject().put("file", file ?: JSObject.NULL))
    }

    /** "Open .wastickers files" setting: implemented by enabling or disabling the trampoline activity that receives files. */
    @PluginMethod
    fun getImporterEnabled(call: PluginCall) {
        val state = context.packageManager.getComponentEnabledSetting(importer)
        val enabled = state != PackageManager.COMPONENT_ENABLED_STATE_DISABLED

        call.resolve(JSObject().put("enabled", enabled))
    }

    @PluginMethod
    fun setImporterEnabled(call: PluginCall) {
        val enabled = call.getBoolean("enabled") ?: return call.reject("enabled is required")
        val state = if (enabled) {
            PackageManager.COMPONENT_ENABLED_STATE_ENABLED
        } else {
            PackageManager.COMPONENT_ENABLED_STATE_DISABLED
        }

        context.packageManager.setComponentEnabledSetting(importer, state, PackageManager.DONT_KILL_APP)
        call.resolve()
    }

    @PluginMethod
    fun getStickerLibraryStatus(call: PluginCall) {
        call.resolve(JSObject().put("available", true).put("granted", library.grantedTree != null))
    }

    @PluginMethod
    fun requestStickerLibraryAccess(call: PluginCall) {
        val intent = Intent(Intent.ACTION_OPEN_DOCUMENT_TREE).apply {
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION)
            putExtra(DocumentsContract.EXTRA_INITIAL_URI, library.initialUri)
        }

        try {
            startActivityForResult(call, intent, "onStickerLibraryAccessResult")
        } catch (_: ActivityNotFoundException) {
            call.resolve(JSObject().put("granted", false))
        }
    }

    @ActivityCallback
    private fun onStickerLibraryAccessResult(call: PluginCall?, result: ActivityResult) {
        call ?: return

        val tree = result.data?.data
        if (result.resultCode == Activity.RESULT_OK && tree != null) {
            library.remember(tree)
        }

        call.resolve(JSObject().put("granted", library.grantedTree != null))
    }

    @PluginMethod
    fun listStickerLibrary(call: PluginCall) {
        val stickers = JSArray()
        for (document in library.list()) {
            stickers.put(JSObject().put("uri", document.uri.toString()).put("name", document.name))
        }

        call.resolve(JSObject().put("stickers", stickers))
    }

    @PluginMethod
    fun copyDocumentToCache(call: PluginCall) {
        val uri = call.getString("uri")?.let(Uri::parse) ?: return call.reject("uri is required")

        val path = IncomingFiles.copyToCache(context, uri) ?: return call.reject("failed to read document")
        call.resolve(JSObject().put("path", path))
    }

    @PluginMethod
    fun getKeyboardStatus(call: PluginCall) {
        val manager = context.getSystemService<InputMethodManager>()
        val enabled = manager?.enabledInputMethodList.orEmpty().any { it.packageName == context.packageName }

        call.resolve(JSObject().put("available", true).put("enabled", enabled))
    }

    @PluginMethod
    fun openKeyboardSettings(call: PluginCall) {
        activity.startActivity(Intent(Settings.ACTION_INPUT_METHOD_SETTINGS))
        call.resolve()
    }

    @PluginMethod
    fun showKeyboardPicker(call: PluginCall) {
        context.getSystemService<InputMethodManager>()?.showInputMethodPicker()
        call.resolve()
    }

    /** The trampoline activity has already copied the external file to the cache directory; only record the path here until the web layer fetches it. */
    private fun captureIncomingFile(intent: Intent?): Boolean {
        if (intent?.action != IncomingFiles.ACTION_IMPORT) {
            return false
        }

        val path = intent.getStringExtra(IncomingFiles.EXTRA_PATH) ?: return false
        pendingImport = JSObject()
            .put("path", path)
            .put("name", intent.getStringExtra(IncomingFiles.EXTRA_NAME).orEmpty())
            .put("size", File(context.cacheDir, path).length())

        // Clear the handled action so the same file is not imported again after the UI is recreated.
        intent.action = Intent.ACTION_MAIN

        return true
    }

    private companion object {
        const val EVENT_INCOMING_FILE = "incomingFile"
        const val ERROR_NOT_INSTALLED = "WHATSAPP_NOT_INSTALLED"
        const val ERROR_NOT_SUPPORTED = "WHATSAPP_NOT_SUPPORTED"
    }
}
