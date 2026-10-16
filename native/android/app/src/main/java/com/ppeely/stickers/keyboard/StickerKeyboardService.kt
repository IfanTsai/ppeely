package com.ppeely.stickers.keyboard

import android.content.ClipDescription
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.inputmethodservice.InputMethodService
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.LruCache
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.inputmethod.EditorInfo
import android.view.inputmethod.InputMethodManager
import android.widget.BaseAdapter
import android.widget.Button
import android.widget.GridView
import android.widget.HorizontalScrollView
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.core.content.FileProvider
import androidx.core.content.edit
import androidx.core.content.getSystemService
import androidx.core.view.inputmethod.EditorInfoCompat
import androidx.core.view.inputmethod.InputConnectionCompat
import androidx.core.view.inputmethod.InputContentInfoCompat
import com.ppeely.stickers.AppLanguage
import com.ppeely.stickers.MainActivity
import com.ppeely.stickers.R
import com.ppeely.stickers.packs.PackRecord
import com.ppeely.stickers.packs.PackStore
import java.io.File
import java.util.concurrent.Executors

/**
 * Sticker keyboard: an input method that shows only stickers; tapping a sticker hands the image to the app owning the current text field via `commitContent`.
 *
 * The keyboard lists all sticker packs and decides how to commit based on the image types the target text field declares, so it also works in apps other than WhatsApp that accept image input.
 */
class StickerKeyboardService : InputMethodService() {
    private val store by lazy { PackStore(this) }
    private val preferences by lazy { getSharedPreferences("sticker_keyboard", Context.MODE_PRIVATE) }
    private val decoder = Executors.newFixedThreadPool(2)
    private val loader = Executors.newSingleThreadExecutor()
    private val mainThread = Handler(Looper.getMainLooper())
    private val thumbnails = object : LruCache<String, Bitmap>(THUMBNAIL_CACHE_BYTES) {
        override fun sizeOf(key: String, value: Bitmap): Int = value.byteCount
    }

    // The following state is read and written only on the main thread.
    private var packs: List<PackRecord> = emptyList()
    private var recent: List<StickerRef> = emptyList()
    private var loadGeneration = 0
    private var selectedTab = TAB_RECENT
    private var tabBar: LinearLayout? = null
    private var grid: GridView? = null
    private var emptyView: View? = null

    // Text comes from this context so it follows the language picked in the app's settings; viewLanguage is the setting the current view was built with.
    private var localized: Context = this
    private var viewLanguage: String? = null

    override fun onCreateInputView(): View {
        viewLanguage = AppLanguage.current(this)
        localized = AppLanguage.localize(this)

        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(COLOR_BACKGROUND)
        }

        val bar = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
        }
        tabBar = bar
        root.addView(
            HorizontalScrollView(this).apply {
                isHorizontalScrollBarEnabled = false
                addView(bar)
            },
            ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(TAB_BAR_HEIGHT_DP)),
        )

        val stickerGrid = GridView(this).apply {
            numColumns = GRID_COLUMNS
            stretchMode = GridView.STRETCH_COLUMN_WIDTH
            verticalSpacing = dp(6)
            horizontalSpacing = dp(6)
            setPadding(dp(8), dp(4), dp(8), dp(8))
            clipToPadding = false
        }
        grid = stickerGrid
        root.addView(stickerGrid, ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(GRID_HEIGHT_DP)))

        // The index is read in the background; don't show "no stickers" before the read finishes, to avoid a brief flash.
        val empty = buildEmptyView().apply { visibility = View.GONE }
        emptyView = empty
        root.addView(empty, ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(GRID_HEIGHT_DP)))

        return root
    }

    override fun onStartInputView(info: EditorInfo?, restarting: Boolean) {
        super.onStartInputView(info, restarting)

        // The service outlives a language change in the app's settings; rebuild the view so its text follows.
        if (AppLanguage.current(this) != viewLanguage) {
            setInputView(onCreateInputView())
        }

        // Re-read the index in the background each time the keyboard is shown so stickers just made in the app are available immediately; keep showing the previous content until the read finishes.
        val generation = ++loadGeneration
        loader.execute {
            val loadedPacks = store.list().filter { it.stickers.isNotEmpty() }
            val loadedRecent = readRecent(loadedPacks)

            mainThread.post {
                // When the keyboard is quickly hidden and shown again, only use the result of the latest read.
                if (generation == loadGeneration) {
                    applyLoaded(loadedPacks, loadedRecent)
                }
            }
        }
    }

    override fun onDestroy() {
        loader.shutdownNow()
        decoder.shutdownNow()
        super.onDestroy()
    }

    private fun applyLoaded(loadedPacks: List<PackRecord>, loadedRecent: List<StickerRef>) {
        packs = loadedPacks
        recent = loadedRecent
        if (selectedTab != TAB_RECENT && packs.none { it.id == selectedTab }) {
            selectedTab = TAB_RECENT
        }

        if (selectedTab == TAB_RECENT && recent.isEmpty()) {
            selectedTab = packs.firstOrNull()?.id ?: TAB_RECENT
        }

        render()
    }

    private fun render() {
        val bar = tabBar ?: return
        bar.removeAllViews()

        bar.addView(textTab(localized.getString(R.string.keyboard_switch), selected = false) { switchKeyboard() })
        bar.addView(textTab(localized.getString(R.string.keyboard_recent), selectedTab == TAB_RECENT) { selectTab(TAB_RECENT) })
        for (pack in packs) {
            bar.addView(packTab(pack))
        }

        val stickers = if (selectedTab == TAB_RECENT) {
            recent
        } else {
            packs.firstOrNull { it.id == selectedTab }?.let { pack -> pack.stickers.map { StickerRef(pack.id, it.file) } }.orEmpty()
        }

        val hasContent = packs.isNotEmpty()
        grid?.visibility = if (hasContent) View.VISIBLE else View.GONE
        emptyView?.visibility = if (hasContent) View.GONE else View.VISIBLE
        grid?.adapter = StickerAdapter(stickers)
    }

    private fun selectTab(tab: String) {
        selectedTab = tab
        render()
    }

    private fun textTab(label: String, selected: Boolean, onClick: () -> Unit): View = TextView(this).apply {
        text = label
        textSize = 13f
        gravity = Gravity.CENTER
        setTextColor(if (selected) COLOR_ACCENT else COLOR_TEXT)
        setPadding(dp(14), 0, dp(14), 0)
        layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.MATCH_PARENT)
        setOnClickListener { onClick() }
    }

    private fun packTab(pack: PackRecord): View = ImageView(this).apply {
        val size = dp(TAB_BAR_HEIGHT_DP)
        layoutParams = LinearLayout.LayoutParams(size, size)
        setPadding(dp(8), dp(8), dp(8), dp(8))
        contentDescription = pack.name
        if (pack.id == selectedTab) {
            background = GradientDrawable().apply {
                cornerRadius = dp(10).toFloat()
                setColor(COLOR_SELECTED)
            }
        }

        loadThumbnail(this, StickerRef(pack.id, pack.trayIcon ?: pack.stickers.first().file))
        setOnClickListener { selectTab(pack.id) }
    }

    private fun buildEmptyView(): View = LinearLayout(this).apply {
        orientation = LinearLayout.VERTICAL
        gravity = Gravity.CENTER
        setPadding(dp(24), dp(16), dp(24), dp(16))

        addView(
            TextView(context).apply {
                text = localized.getString(R.string.keyboard_empty)
                textSize = 15f
                gravity = Gravity.CENTER
                setTextColor(COLOR_TEXT)
            },
        )
        addView(
            Button(context).apply {
                text = localized.getString(R.string.keyboard_open_app)
                setOnClickListener {
                    startActivity(Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                }
            },
            LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply {
                topMargin = dp(12)
            },
        )
    }

    private fun sendSticker(sticker: StickerRef) {
        val pack = packs.firstOrNull { it.id == sticker.packId } ?: return
        val file = store.resolveFile(pack, sticker.file) ?: return
        val editor = currentInputEditorInfo
        val connection = currentInputConnection
        val mimeType = contentMimeType(editor)
        if (editor == null || connection == null || mimeType == null) {
            Toast.makeText(localized, R.string.keyboard_unsupported, Toast.LENGTH_SHORT).show()

            return
        }

        // Use the FileProvider to generate a URI with temporary read access; the sticker ContentProvider is protected by the WhatsApp permission, so other apps cannot read it.
        val uri = FileProvider.getUriForFile(this, "$packageName.fileprovider", file)
        val content = InputContentInfoCompat(uri, ClipDescription("Sticker", arrayOf(mimeType)), null)
        val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N_MR1) {
            InputConnectionCompat.INPUT_CONTENT_GRANT_READ_URI_PERMISSION
        } else {
            // On older Android versions commitContent does not grant access automatically, so grant the target app read permission explicitly.
            grantUriPermission(editor.packageName, uri, Intent.FLAG_GRANT_READ_URI_PERMISSION)
            0
        }

        if (InputConnectionCompat.commitContent(connection, editor, content, flags, null)) {
            rememberRecent(sticker)
        } else {
            Toast.makeText(localized, R.string.keyboard_unsupported, Toast.LENGTH_SHORT).show()
        }
    }

    /**
     * Chooses the MIME type declared when committing a sticker. WhatsApp uses `image/webp.wasticker` to mark content "to be sent as a sticker";
     * other apps receive it as a plain WebP image. Returns null when the text field does not accept images.
     */
    private fun contentMimeType(editor: EditorInfo?): String? {
        editor ?: return null

        val accepted = EditorInfoCompat.getContentMimeTypes(editor)
        val match = MIME_CANDIDATES.firstOrNull { candidate ->
            accepted.any { ClipDescription.compareMimeTypes(candidate, it) }
        }

        return match ?: MIME_STICKER.takeIf { editor.packageName.orEmpty().contains("whatsapp", ignoreCase = true) }
    }

    private fun switchKeyboard() {
        val switched = Build.VERSION.SDK_INT >= Build.VERSION_CODES.P && switchToPreviousInputMethod()
        if (!switched) {
            getSystemService<InputMethodManager>()?.showInputMethodPicker()
        }
    }

    /** Reads the recently used stickers, dropping deleted ones. Accesses disk, so call it on a background thread. */
    private fun readRecent(packs: List<PackRecord>): List<StickerRef> {
        val byId = packs.associateBy { it.id }

        return preferences.getString(KEY_RECENT, "").orEmpty()
            .split('\n')
            .mapNotNull(StickerRef::parse)
            .filter { ref -> byId[ref.packId]?.let { store.resolveFile(it, ref.file) } != null }
    }

    private fun rememberRecent(sticker: StickerRef) {
        recent = (listOf(sticker) + recent.filter { it != sticker }).take(MAX_RECENT)
        preferences.edit { putString(KEY_RECENT, recent.joinToString("\n") { it.encode() }) }
    }

    private fun loadThumbnail(view: ImageView, sticker: StickerRef) {
        val key = sticker.encode()
        view.tag = key
        thumbnails.get(key)?.let {
            view.setImageBitmap(it)

            return
        }

        view.setImageDrawable(null)
        val pack = packs.firstOrNull { it.id == sticker.packId } ?: return
        decoder.execute {
            val file = store.resolveFile(pack, sticker.file) ?: return@execute
            val bitmap = decodeThumbnail(file) ?: return@execute
            thumbnails.put(key, bitmap)
            mainThread.post {
                // Views are recycled as the grid scrolls; only show this image if the tag still matches.
                if (view.tag == key) {
                    view.setImageBitmap(bitmap)
                }
            }
        }
    }

    /** Stickers are 512×512 and keyboard cells are much smaller, so decode at half the side length to save memory; animated stickers show their first frame. */
    private fun decodeThumbnail(file: File): Bitmap? =
        BitmapFactory.decodeFile(file.path, BitmapFactory.Options().apply { inSampleSize = 2 })

    private fun dp(value: Int): Int =
        TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, value.toFloat(), resources.displayMetrics).toInt()

    private inner class StickerAdapter(private val stickers: List<StickerRef>) : BaseAdapter() {
        override fun getCount(): Int = stickers.size

        override fun getItem(position: Int): StickerRef = stickers[position]

        override fun getItemId(position: Int): Long = position.toLong()

        override fun getView(position: Int, convertView: View?, parent: ViewGroup): View {
            val view = convertView as? SquareImageView ?: SquareImageView(this@StickerKeyboardService).apply {
                scaleType = ImageView.ScaleType.FIT_CENTER
                setPadding(dp(4), dp(4), dp(4), dp(4))
            }

            val sticker = stickers[position]
            loadThumbnail(view, sticker)
            view.setOnClickListener { sendSticker(sticker) }

            return view
        }
    }

    private class SquareImageView(context: Context) : ImageView(context) {
        override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
            super.onMeasure(widthMeasureSpec, widthMeasureSpec)
        }
    }

    private data class StickerRef(val packId: String, val file: String) {
        fun encode(): String = "$packId/$file"

        companion object {
            fun parse(text: String): StickerRef? {
                val parts = text.split('/')

                return if (parts.size == 2 && parts.all { it.isNotEmpty() }) StickerRef(parts[0], parts[1]) else null
            }
        }
    }

    private companion object {
        const val TAB_RECENT = ""
        const val KEY_RECENT = "recent"

        /** Maximum number of history entries. */
        const val MAX_RECENT = 100

        /** Number of columns in the sticker grid. */
        const val GRID_COLUMNS = 4
        const val TAB_BAR_HEIGHT_DP = 48
        const val GRID_HEIGHT_DP = 230
        const val THUMBNAIL_CACHE_BYTES = 24 * 1024 * 1024

        const val MIME_STICKER = "image/webp.wasticker"
        val MIME_CANDIDATES = listOf(MIME_STICKER, "image/webp")

        val COLOR_BACKGROUND = Color.rgb(0xF1, 0xF3, 0xF6)
        val COLOR_SELECTED = Color.rgb(0xDD, 0xE2, 0xEA)
        val COLOR_TEXT = Color.rgb(0x3A, 0x40, 0x4C)
        val COLOR_ACCENT = Color.rgb(0x16, 0xA0, 0x5C)
    }
}
