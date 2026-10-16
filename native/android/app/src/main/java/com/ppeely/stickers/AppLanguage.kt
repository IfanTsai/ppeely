package com.ppeely.stickers

import android.content.Context
import android.content.res.Configuration
import android.os.LocaleList
import org.json.JSONException
import org.json.JSONObject
import java.util.Locale

/**
 * The UI language picked in the app's settings, applied to the native components that show text of their own
 * (the sticker keyboard and the import activity).
 *
 * The web layer stores its settings as JSON under the "settings" key of Capacitor Preferences, which keeps its values
 * in the "CapacitorStorage" SharedPreferences file; see src/lib/settings.ts. The main activity doesn't need this:
 * its UI is the web layer, which applies the setting itself.
 */
object AppLanguage {
    private const val PREFERENCES_FILE = "CapacitorStorage"
    private const val SETTINGS_KEY = "settings"
    private val SUPPORTED = setOf("en", "zh")

    /** Returns the language tag picked in settings, or null when the app follows the system language. */
    fun current(context: Context): String? {
        val json = context.getSharedPreferences(PREFERENCES_FILE, Context.MODE_PRIVATE).getString(SETTINGS_KEY, null) ?: return null

        return try {
            JSONObject(json).optString("language").takeIf { it in SUPPORTED }
        } catch (_: JSONException) {
            null
        }
    }

    /** Returns a context whose resources use the language picked in settings, or [context] itself when following the system. */
    fun localize(context: Context): Context {
        val tag = current(context) ?: return context
        val configuration = Configuration(context.resources.configuration)
        configuration.setLocales(LocaleList(Locale.forLanguageTag(tag)))

        return context.createConfigurationContext(configuration)
    }
}
