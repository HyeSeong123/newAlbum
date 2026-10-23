package com.oraedameun.album

import android.Manifest
import android.app.Activity
import android.content.ContentUris
import android.content.Intent
import android.content.res.ColorStateList
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.media.MediaMetadataRetriever
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.SystemClock
import android.provider.MediaStore
import android.provider.Settings
import android.util.LruCache
import android.util.Size
import android.view.Gravity
import android.view.MotionEvent
import android.view.HapticFeedbackConstants
import android.view.View
import android.view.ViewGroup
import android.widget.*
import androidx.core.graphics.Insets
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.concurrent.Executors
import java.util.concurrent.Future
import java.io.File
import org.json.JSONArray

/** Local visual media only. File names never determine gallery order. */
class GamjassakGalleryActivity : Activity() {
    private data class Entry(val id: Long, val uri: Uri, val name: String, val modified: Long, val video: Boolean)
    private val entries = ArrayList<Entry>()
    private val selected = LinkedHashSet<String>()
    private val queryWorker = Executors.newSingleThreadExecutor()
    private val thumbnails = Executors.newFixedThreadPool(2)
    private val cache = object : LruCache<String, Bitmap>(8 * 1024 * 1024) {
        override fun sizeOf(key: String, value: Bitmap) = value.byteCount
    }
    private lateinit var grid: SelectionGrid
    private lateinit var message: TextView
    private lateinit var selectionSummary: TextView
    private lateinit var done: Button
    private lateinit var more: Button
    private lateinit var settings: Button
    private lateinit var selectAll: Button
    private var bulkSelecting = false
    private var allSelected = false
    private val adapter = GalleryAdapter()
    private var loading = false
    private var exhausted = false
    private var generation = 0
    private var permissionPending = false
    private var started = false
    private var accessSignature = ""
    private fun permissionsSignature() = if (Build.VERSION.SDK_INT >= 33)
        "${granted(Manifest.permission.READ_MEDIA_IMAGES)}:${granted(Manifest.permission.READ_MEDIA_VIDEO)}:${Build.VERSION.SDK_INT >= 34 && granted(Manifest.permission.READ_MEDIA_VISUAL_USER_SELECTED)}"
        else granted(Manifest.permission.READ_EXTERNAL_STORAGE).toString()
    private fun dp(value: Int) = (value * resources.displayMetrics.density).toInt()
    private fun granted(permission: String) = checkSelfPermission(permission) == PackageManager.PERMISSION_GRANTED
    private fun accessible() = if (Build.VERSION.SDK_INT >= 33)
        granted(Manifest.permission.READ_MEDIA_IMAGES) || granted(Manifest.permission.READ_MEDIA_VIDEO) ||
            (Build.VERSION.SDK_INT >= 34 && granted(Manifest.permission.READ_MEDIA_VISUAL_USER_SELECTED))
        else granted(Manifest.permission.READ_EXTERNAL_STORAGE)
    private fun fullAccess() = if (Build.VERSION.SDK_INT >= 33)
        granted(Manifest.permission.READ_MEDIA_IMAGES) && granted(Manifest.permission.READ_MEDIA_VIDEO)
        else granted(Manifest.permission.READ_EXTERNAL_STORAGE)

    private val cream = Color.rgb(248, 247, 242)
    private val ink = Color.rgb(40, 49, 35)
    private val olive = Color.rgb(125, 132, 87)
    private val muted = Color.rgb(108, 111, 98)
    private fun rounded(fill: Int, radius: Int, stroke: Int? = null) = GradientDrawable().apply {
        setColor(fill); cornerRadius = dp(radius).toFloat()
        if (stroke != null) setStroke(dp(1), stroke)
    }
    private fun styledButton(label: String, primary: Boolean = false) = Button(this).apply {
        text = label; textSize = 14f; isAllCaps = false; stateListAnimator = null
        setPadding(dp(12), 0, dp(12), 0)
        background = rounded(if (primary) olive else Color.WHITE, 10, if (primary) olive else Color.rgb(221, 222, 211))
        if (primary) {
            backgroundTintList = ColorStateList(arrayOf(intArrayOf(android.R.attr.state_enabled), intArrayOf()), intArrayOf(olive, Color.rgb(223, 225, 214)))
            setTextColor(ColorStateList(arrayOf(intArrayOf(android.R.attr.state_enabled), intArrayOf()), intArrayOf(Color.WHITE, muted)))
        } else setTextColor(ink)
    }

    override fun onCreate(state: Bundle?) {
        super.onCreate(state)
        selected.addAll(state?.getStringArrayList("selected") ?: emptyList())
        state?.getString("selectionFile")?.let { path ->
            try {
                val saved = File(path).canonicalFile
                if (saved.parentFile == cacheDir.canonicalFile && saved.name.startsWith("gallery-selection-")) {
                    val rows = JSONArray(saved.readText())
                    for (index in 0 until rows.length()) selected.add(rows.getString(index))
                    saved.delete()
                }
            } catch (_: Exception) { selected.clear() }
        }
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(cream)
        }
        ViewCompat.setOnApplyWindowInsetsListener(root) { view, insets ->
            val mask = WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout()
            val safe = insets.getInsets(mask)
            view.setPadding(safe.left, safe.top, safe.right, safe.bottom)
            WindowInsetsCompat.Builder(insets).setInsets(mask, Insets.NONE).build()
        }
        window.statusBarColor = cream
        window.navigationBarColor = cream
        fun text(value: String, size: Float) = TextView(this).apply {
            text = value; textSize = size; setTextColor(ink)
        }
        val header = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(dp(16), dp(14), dp(16), dp(12)) }
        header.addView(text("감자싹", 12f).apply { setTextColor(olive); setTypeface(typeface, Typeface.BOLD) })
        header.addView(text("사진·영상 선택", 22f).apply { setTypeface(typeface, Typeface.BOLD); setPadding(0, dp(6), 0, dp(6)) })
        header.addView(text("최근 수정 순 · 꾹 누른 뒤 드래그로 여러 장 선택", 12f).apply { setTextColor(muted) })
        message = text("갤러리를 불러오는 중", 13f).apply { setPadding(0, dp(10), 0, 0); setTextColor(muted) }
        header.addView(message)
        more = styledButton("접근할 사진 변경").apply { setOnClickListener { requestGalleryAccess() } }
        header.addView(more, LinearLayout.LayoutParams(-1, dp(44)).apply { topMargin = dp(10) })
        settings = styledButton("휴대폰 권한 설정").apply {
            setOnClickListener { startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:$packageName"))) }
        }
        header.addView(settings, LinearLayout.LayoutParams(-1, dp(44)).apply { topMargin = dp(8) })
        root.addView(header)
        grid = SelectionGrid().apply {
            numColumns = 3; horizontalSpacing = dp(6); verticalSpacing = dp(8)
            setPadding(dp(12), 0, dp(12), dp(8)); clipToPadding = false; setBackgroundColor(cream)
            stretchMode = GridView.STRETCH_COLUMN_WIDTH; this.adapter = this@GamjassakGalleryActivity.adapter
            setOnItemClickListener { _, _, position, _ ->
                if (bulkSelecting) return@setOnItemClickListener
                val uri = entries[position].uri.toString()
                if (!selected.remove(uri)) selected.add(uri)
                allSelected = false
                updateSelection(); updateVisibleSelection()
            }
            setOnItemLongClickListener { _, _, position, _ -> if (!bulkSelecting) beginSelection(position); true }
            setOnScrollListener(object : AbsListView.OnScrollListener {
                override fun onScrollStateChanged(view: AbsListView?, state: Int) {}
                override fun onScroll(view: AbsListView?, first: Int, visible: Int, total: Int) {
                    if (total > 0 && first + visible >= total - 12) loadPage()
                }
            })
        }
        root.addView(grid, LinearLayout.LayoutParams(-1, 0, 1f))
        val footer = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL; setPadding(dp(16), dp(12), dp(16), dp(12)); setBackgroundColor(cream)
            elevation = dp(4).toFloat()
        }
        selectionSummary = text("사진·영상을 골라 주세요", 13f).apply { setTextColor(muted); setPadding(0, 0, 0, dp(10)) }
        val selectionRow = LinearLayout(this).apply { gravity = Gravity.CENTER_VERTICAL }
        selectionRow.addView(selectionSummary, LinearLayout.LayoutParams(0, -2, 1f))
        selectAll = styledButton("전체 선택").apply { setOnClickListener { toggleAll() } }
        selectionRow.addView(selectAll, LinearLayout.LayoutParams(-2, dp(44)).apply { bottomMargin = dp(8) })
        footer.addView(selectionRow)
        val actions = LinearLayout(this)
        actions.addView(styledButton("취소").apply { setOnClickListener { finish() } }, LinearLayout.LayoutParams(0, dp(48), 1f).apply { rightMargin = dp(10) })
        done = styledButton("0개 가져오기", true).apply { setOnClickListener { complete(selected.toList()) } }
        actions.addView(done, LinearLayout.LayoutParams(0, dp(48), 2f))
        footer.addView(actions); root.addView(footer)
        setContentView(root)
        // The controller needs an installed DecorView before it can read system bars.
        WindowInsetsControllerCompat(window, root).apply {
            isAppearanceLightStatusBars = true; isAppearanceLightNavigationBars = true
        }
        updateSelection()
        if (!accessible()) requestGalleryAccess()
    }

    override fun onResume() {
        super.onResume()
        // Partial permissions can change while this activity is in the background.
        if (!permissionPending) refresh(!started || (fullAccess() && permissionsSignature() == accessSignature))
        started = true
    }
    private fun requestGalleryAccess() {
        permissionPending = true
        val permissions = when {
            Build.VERSION.SDK_INT >= 34 -> arrayOf(Manifest.permission.READ_MEDIA_IMAGES, Manifest.permission.READ_MEDIA_VIDEO, Manifest.permission.READ_MEDIA_VISUAL_USER_SELECTED)
            Build.VERSION.SDK_INT >= 33 -> arrayOf(Manifest.permission.READ_MEDIA_IMAGES, Manifest.permission.READ_MEDIA_VIDEO)
            else -> arrayOf(Manifest.permission.READ_EXTERNAL_STORAGE)
        }
        requestPermissions(permissions, 10)
    }
    override fun onRequestPermissionsResult(code: Int, permissions: Array<out String>, results: IntArray) {
        super.onRequestPermissionsResult(code, permissions, results)
        if (code == 10) { permissionPending = false; refresh(false) }
    }
    private fun refresh(preserveSelection: Boolean) {
        accessSignature = permissionsSignature()
        generation++; loading = false; exhausted = false; bulkSelecting = false; allSelected = false; entries.clear(); cache.evictAll()
        if (!preserveSelection) selected.clear()
        adapter.notifyDataSetChanged(); updateSelection()
        more.visibility = if (fullAccess()) View.GONE else View.VISIBLE
        settings.visibility = if (accessible()) View.GONE else View.VISIBLE
        if (!accessible()) {
            message.visibility = View.VISIBLE
            message.text = "사진·영상 접근을 허용하면 최근 수정 순으로 볼 수 있어요."
            return
        }
        message.visibility = View.VISIBLE
        message.text = if (fullAccess()) "갤러리를 불러오는 중" else "허용한 사진·영상만 표시해요. 접근할 사진을 변경할 수 있어요."
        loadPage()
    }
    private fun updateSelection() {
        done.text = "${selected.size}개 가져오기"; done.isEnabled = selected.isNotEmpty() && !bulkSelecting
        selectAll.text = if (bulkSelecting) "선택 중…" else if (allSelected) "전체 선택 해제" else "전체 선택"
        selectAll.isEnabled = accessible() && !bulkSelecting
        selectionSummary.text = if (selected.isEmpty()) "사진·영상을 골라 주세요" else "${selected.size}개 선택됨"
        selectionSummary.setTextColor(if (selected.isEmpty()) muted else olive)
    }
    private fun complete(uris: List<String>) {
        if (uris.isEmpty() || bulkSelecting) return
        bulkSelecting = true; updateSelection()
        queryWorker.execute {
            try {
                // Pass only a cache path through Binder, even for a large gallery.
                val file = File.createTempFile("gallery-selection-", ".json", cacheDir)
                file.writeText(JSONArray(uris).toString())
                runOnUiThread {
                    if (isDestroyed || isFinishing) { file.delete(); return@runOnUiThread }
                    setResult(RESULT_OK, Intent().putExtra("selectionFile", file.absolutePath)); finish()
                }
            } catch (_: Exception) { runOnUiThread { bulkSelecting = false; updateSelection(); Toast.makeText(this, "선택한 사진을 전달하지 못했습니다. 다시 시도해 주세요.", Toast.LENGTH_SHORT).show() } }
        }
    }
    private fun galleryFilters(): MutableList<String> {
        val filters = mutableListOf("${MediaStore.Files.FileColumns.MEDIA_TYPE} IN (1,3)")
        val extensions = listOf("jpg", "jpeg", "png", "webp", "heic", "mp4", "mov", "avi", "mkv", "webm")
        filters.add("(" + extensions.joinToString(" OR ") { "LOWER(_display_name) LIKE '%.$it'" } + ")")
        if (Build.VERSION.SDK_INT >= 29) filters.add("${MediaStore.MediaColumns.IS_PENDING}=0")
        if (Build.VERSION.SDK_INT >= 30) filters.add("${MediaStore.MediaColumns.IS_TRASHED}=0")
        return filters
    }
    private fun toggleAll() {
        if (bulkSelecting || !accessible()) return
        if (allSelected) { selected.clear(); allSelected = false; updateSelection(); updateVisibleSelection(); return }
        bulkSelecting = true; updateSelection()
        val token = generation
        queryWorker.execute {
            try {
                val uris = LinkedHashSet<String>()
                val columns = arrayOf(MediaStore.Files.FileColumns._ID, MediaStore.Files.FileColumns.MEDIA_TYPE)
                val cursor = contentResolver.query(MediaStore.Files.getContentUri("external"), columns, galleryFilters().joinToString(" AND "), null, "date_modified DESC, _id DESC")
                    ?: error("갤러리를 읽지 못했습니다.")
                cursor.use {
                    while (it.moveToNext()) {
                        if (Thread.currentThread().isInterrupted) return@execute
                        val base = if (it.getInt(1) == MediaStore.Files.FileColumns.MEDIA_TYPE_VIDEO) MediaStore.Video.Media.EXTERNAL_CONTENT_URI else MediaStore.Images.Media.EXTERNAL_CONTENT_URI
                        uris.add(ContentUris.withAppendedId(base, it.getLong(0)).toString())
                    }
                }
                runOnUiThread {
                    if (token != generation || isDestroyed || isFinishing) return@runOnUiThread
                    selected.clear(); selected.addAll(uris); allSelected = selected.isNotEmpty(); bulkSelecting = false
                    updateSelection(); updateVisibleSelection()
                }
            } catch (_: Exception) { runOnUiThread {
                if (token != generation || isDestroyed) return@runOnUiThread
                bulkSelecting = false; updateSelection()
                Toast.makeText(this, "전체 선택을 완료하지 못했습니다. 사진 접근 권한을 확인해 주세요.", Toast.LENGTH_SHORT).show()
            } }
        }
    }
    private fun loadPage() {
        if (loading || exhausted || !accessible() || isFinishing || isDestroyed) return
        loading = true
        val token = generation
        val last = entries.lastOrNull()
        queryWorker.execute {
            try {
                val collection = MediaStore.Files.getContentUri("external")
                val columns = arrayOf(MediaStore.Files.FileColumns._ID, MediaStore.MediaColumns.DISPLAY_NAME,
                    MediaStore.MediaColumns.DATE_MODIFIED, MediaStore.Files.FileColumns.MEDIA_TYPE)
                val filters = galleryFilters()
                val args = if (last == null) null else arrayOf(last.modified.toString(), last.modified.toString(), last.id.toString())
                if (last != null) filters.add("(date_modified < ? OR (date_modified = ? AND _id < ?))")
                val selection = filters.joinToString(" AND ")
                val order = "date_modified DESC, _id DESC"
                val cursor = if (Build.VERSION.SDK_INT >= 26) contentResolver.query(collection, columns, Bundle().apply {
                    putString(android.content.ContentResolver.QUERY_ARG_SQL_SELECTION, selection)
                    putStringArray(android.content.ContentResolver.QUERY_ARG_SQL_SELECTION_ARGS, args)
                    putString(android.content.ContentResolver.QUERY_ARG_SQL_SORT_ORDER, order)
                    putInt(android.content.ContentResolver.QUERY_ARG_LIMIT, 80)
                }, null) else contentResolver.query(collection, columns, selection, args, "$order LIMIT 80")
                val page = ArrayList<Entry>()
                cursor?.use {
                    while (page.size < 80 && it.moveToNext()) {
                        val id = it.getLong(0); val video = it.getInt(3) == MediaStore.Files.FileColumns.MEDIA_TYPE_VIDEO
                        val base = if (video) MediaStore.Video.Media.EXTERNAL_CONTENT_URI else MediaStore.Images.Media.EXTERNAL_CONTENT_URI
                        page.add(Entry(id, ContentUris.withAppendedId(base, id), it.getString(1) ?: "기록", it.getLong(2), video))
                    }
                } ?: error("갤러리를 읽지 못했습니다.")
                runOnUiThread {
                    if (token != generation || isDestroyed) return@runOnUiThread
                    loading = false; exhausted = page.size < 80; entries.addAll(page); adapter.notifyDataSetChanged()
                    message.visibility = if (entries.isEmpty() || !fullAccess()) View.VISIBLE else View.GONE
                    message.text = if (entries.isEmpty()) "표시할 사진·영상이 없습니다." else if (fullAccess()) "최근 수정한 기록부터 표시해요." else "허용한 사진·영상만 최근 수정 순으로 표시해요."
                }
            } catch (_: Exception) {
                runOnUiThread {
                    if (token != generation || isDestroyed) return@runOnUiThread
                    loading = false; exhausted = true
                    message.visibility = View.VISIBLE
                    message.text = "갤러리를 읽지 못했습니다. 사진·영상 접근 권한을 확인해 주세요."
                    more.visibility = View.VISIBLE
                }
            }
        }
    }
    /** AbsListView decides long press vs. scrolling. Only an accepted long
     * press takes over touch events; normal swipes retain native scrolling. */
    private inner class SelectionGrid : GridView(this@GamjassakGalleryActivity) {
        private var dragging = false
        private var cancelled = false
        private var selecting = true
        private var pointer = -1
        private var x = 0f
        private var y = 0f
        private var lastPosition = -1
        private val visited = HashSet<Int>()
        private val autoScroll = object : Runnable {
            override fun run() {
                if (!dragging) return
                val edge = dp(48)
                val step = when { y < edge -> -dp(12); y > height - edge -> dp(12); else -> 0 }
                if (step != 0) {
                    scrollListBy(step)
                    selectAtPoint()
                    postOnAnimation(this)
                }
            }
        }
        fun beginSelection(position: Int) {
            if (position !in entries.indices) return
            dragging = true; selecting = !selected.contains(entries[position].uri.toString())
            visited.clear(); lastPosition = position; allSelected = false
            // Clear AbsListView's pressed/click/fling state after long-press
            // recognition. Subsequent events are owned by this gesture only.
            val cancel = MotionEvent.obtain(SystemClock.uptimeMillis(), SystemClock.uptimeMillis(), MotionEvent.ACTION_CANCEL, x, y, 0)
            super.onTouchEvent(cancel); cancel.recycle()
            parent?.requestDisallowInterceptTouchEvent(true)
            performHapticFeedback(HapticFeedbackConstants.LONG_PRESS)
            changeSelection(position)
            updateSelection(); updateVisibleSelection()
        }
        private fun changeSelection(position: Int): Boolean {
            if (position !in entries.indices || !visited.add(position)) return false
            val uri = entries[position].uri.toString()
            if (!selecting) return selected.remove(uri)
            if (selected.contains(uri)) return false
            return selected.add(uri)
        }
        private fun selectAtPoint() {
            val position = pointToPosition(x.toInt(), y.toInt().coerceIn(0, maxOf(0, height - 1)))
            if (position == INVALID_POSITION) return
            var changed = false
            // Fill skipped cells during fast movement and auto-scroll.
            for (index in minOf(lastPosition, position)..maxOf(lastPosition, position)) changed = changeSelection(index) || changed
            lastPosition = position
            if (changed) { updateSelection(); updateVisibleSelection() }
        }
        private fun endSelection() {
            dragging = false; visited.clear(); lastPosition = -1
            removeCallbacks(autoScroll); parent?.requestDisallowInterceptTouchEvent(false)
        }
        override fun onTouchEvent(event: MotionEvent): Boolean {
            if (event.actionMasked == MotionEvent.ACTION_DOWN) {
                endSelection(); cancelled = false; pointer = event.getPointerId(0)
            }
            val index = event.findPointerIndex(pointer)
            if (index >= 0) { x = event.getX(index); y = event.getY(index) }
            if (cancelled) {
                if (event.actionMasked == MotionEvent.ACTION_UP || event.actionMasked == MotionEvent.ACTION_CANCEL) cancelled = false
                return true
            }
            if (!dragging) return super.onTouchEvent(event)
            when (event.actionMasked) {
                MotionEvent.ACTION_MOVE -> {
                    selectAtPoint(); removeCallbacks(autoScroll); postOnAnimation(autoScroll)
                }
                MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> endSelection()
                MotionEvent.ACTION_POINTER_DOWN, MotionEvent.ACTION_POINTER_UP -> { endSelection(); cancelled = true }
            }
            return true
        }
        override fun onDetachedFromWindow() { endSelection(); super.onDetachedFromWindow() }
    }
    private fun updateVisibleSelection() {
        // Selection paint does not rebind images or cancel thumbnail tasks.
        for (index in 0 until grid.childCount) {
            val position = grid.firstVisiblePosition + index
            val cell = grid.getChildAt(index).tag as? Cell ?: continue
            entries.getOrNull(position)?.let { paintSelection(cell, it) }
        }
    }
    private fun paintSelection(cell: Cell, entry: Entry) {
        val checked = selected.contains(entry.uri.toString())
        cell.root.background = rounded(if (checked) Color.rgb(230, 235, 217) else cream, 8)
        cell.check.isChecked = checked; cell.frame.alpha = if (checked) 0.88f else 1f
        val date = if (entry.modified > 0) SimpleDateFormat("yyyy.MM.dd HH:mm", Locale.getDefault()).format(Date(entry.modified * 1000)) else "수정일 없음"
        cell.root.contentDescription = "${entry.name}, ${if (entry.video) "영상" else "사진"}, 수정 $date, ${if (checked) "선택됨" else "선택 안 됨"}"
    }
    private class Cell(val root: LinearLayout, val frame: FrameLayout, val image: ImageView, val label: TextView, val check: CheckBox, val video: TextView) {
        var uri = ""; var task: Future<*>? = null
    }
    private inner class GalleryAdapter : BaseAdapter() {
        override fun getCount() = entries.size
        override fun getItem(position: Int) = entries[position]
        override fun getItemId(position: Int) = entries[position].id
        override fun getView(position: Int, convertView: View?, parent: ViewGroup): View {
            val cell = (convertView?.tag as? Cell) ?: run {
                val root = LinearLayout(this@GamjassakGalleryActivity).apply { orientation = LinearLayout.VERTICAL }
                val frame = object : FrameLayout(this@GamjassakGalleryActivity) {
                    override fun onMeasure(widthSpec: Int, heightSpec: Int) {
                        super.onMeasure(widthSpec, View.MeasureSpec.makeMeasureSpec(View.MeasureSpec.getSize(widthSpec), View.MeasureSpec.EXACTLY))
                    }
                }.apply { background = rounded(Color.rgb(231, 233, 224), 8); clipToOutline = true }
                val image = ImageView(this@GamjassakGalleryActivity).apply { scaleType = ImageView.ScaleType.CENTER_CROP; importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO }
                frame.addView(image, FrameLayout.LayoutParams(-1, -1))
                val check = CheckBox(this@GamjassakGalleryActivity).apply {
                    isClickable = false; isFocusable = false; importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO
                    buttonTintList = ColorStateList.valueOf(olive); background = rounded(Color.argb(235, 255, 255, 255), 18)
                    setPadding(0, 0, 0, 0)
                }
                frame.addView(check, FrameLayout.LayoutParams(dp(32), dp(32), Gravity.TOP or Gravity.END).apply { topMargin = dp(5); rightMargin = dp(5) })
                val video = TextView(this@GamjassakGalleryActivity).apply {
                    text = "영상"; textSize = 10f; setTextColor(Color.WHITE); setPadding(dp(6), dp(3), dp(6), dp(3))
                    background = rounded(Color.argb(200, 40, 49, 35), 5); importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO
                }
                frame.addView(video, FrameLayout.LayoutParams(-2, -2, Gravity.BOTTOM or Gravity.START).apply { leftMargin = dp(6); bottomMargin = dp(6) })
                val label = TextView(this@GamjassakGalleryActivity).apply { textSize = 10f; gravity = Gravity.CENTER; setTextColor(muted); maxLines = 1; importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO }
                root.addView(frame, LinearLayout.LayoutParams(-1, -2)); root.addView(label, LinearLayout.LayoutParams(-1, dp(26)))
                Cell(root, frame, image, label, check, video).also { root.tag = it }
            }
            val entry = entries[position]; val uri = entry.uri.toString(); cell.uri = uri; cell.task?.cancel(true)
            paintSelection(cell, entry)
            cell.video.visibility = if (entry.video) View.VISIBLE else View.GONE
            cell.label.text = if (entry.modified > 0) SimpleDateFormat("MM.dd HH:mm", Locale.getDefault()).format(Date(entry.modified * 1000)) else "수정일 없음"
            cell.image.setImageBitmap(cache.get(uri))
            val token = generation
            if (cache.get(uri) == null) cell.task = thumbnails.submit {
                val bitmap = try { thumbnail(entry) } catch (_: Exception) { null }
                if (bitmap != null && !Thread.currentThread().isInterrupted && token == generation && !isDestroyed) {
                    cache.put(uri, bitmap)
                    runOnUiThread { if (!isDestroyed && cell.uri == uri) cell.image.setImageBitmap(bitmap) }
                }
            }
            return cell.root
        }
    }
    private fun thumbnail(entry: Entry): Bitmap? {
        if (Build.VERSION.SDK_INT >= 29) return contentResolver.loadThumbnail(entry.uri, Size(240, 240), null)
        if (entry.video) {
            val reader = MediaMetadataRetriever()
            try {
                reader.setDataSource(this, entry.uri)
                val frame = reader.getFrameAtTime(0) ?: return null
                val scale = 240f / maxOf(frame.width, frame.height)
                return Bitmap.createScaledBitmap(frame, maxOf(1, (frame.width * scale).toInt()), maxOf(1, (frame.height * scale).toInt()), true)
            } finally { reader.release() }
        }
        val options = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        contentResolver.openInputStream(entry.uri)?.use { BitmapFactory.decodeStream(it, null, options) }
        options.inJustDecodeBounds = false; options.inSampleSize = 1
        while (maxOf(options.outWidth, options.outHeight) / options.inSampleSize > 480) options.inSampleSize *= 2
        return contentResolver.openInputStream(entry.uri)?.use { BitmapFactory.decodeStream(it, null, options) }
    }
    override fun onSaveInstanceState(state: Bundle) {
        if (selected.isNotEmpty()) try {
            val file = File.createTempFile("gallery-selection-", ".json", cacheDir)
            file.writeText(JSONArray(selected.toList()).toString()); state.putString("selectionFile", file.absolutePath)
        } catch (_: Exception) { }
        super.onSaveInstanceState(state)
    }
    override fun onDestroy() { generation++; queryWorker.shutdownNow(); thumbnails.shutdownNow(); cache.evictAll(); super.onDestroy() }
}

