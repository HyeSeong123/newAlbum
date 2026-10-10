package com.oraedameun.album

import android.Manifest
import android.app.Activity
import android.content.ContentUris
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import android.media.MediaMetadataRetriever
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.MediaStore
import android.provider.Settings
import android.util.LruCache
import android.util.Size
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.*
import androidx.core.graphics.Insets
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.concurrent.Executors
import java.util.concurrent.Future

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
    private lateinit var grid: GridView
    private lateinit var message: TextView
    private lateinit var done: Button
    private lateinit var more: Button
    private lateinit var settings: Button
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

    override fun onCreate(state: Bundle?) {
        super.onCreate(state)
        selected.addAll(state?.getStringArrayList("selected") ?: emptyList())
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(Color.rgb(248, 247, 242))
        }
        ViewCompat.setOnApplyWindowInsetsListener(root) { view, insets ->
            val mask = WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout()
            val safe = insets.getInsets(mask)
            view.setPadding(safe.left, safe.top, safe.right, safe.bottom)
            WindowInsetsCompat.Builder(insets).setInsets(mask, Insets.NONE).build()
        }
        fun text(value: String, size: Float) = TextView(this).apply {
            text = value; textSize = size; setTextColor(Color.rgb(40, 49, 35)); setPadding(dp(16), dp(6), dp(16), dp(6))
        }
        root.addView(text("갤러리에서 사진·영상 선택", 21f))
        root.addView(text("최근 수정 순 · 사진과 영상만 표시", 14f))
        message = text("갤러리를 불러오는 중", 14f)
        root.addView(message)
        val actions = LinearLayout(this)
        actions.addView(Button(this).apply { text = "취소"; setOnClickListener { finish() } }, LinearLayout.LayoutParams(0, dp(52), 1f))
        done = Button(this).apply { setOnClickListener { complete(selected.toList()) } }
        actions.addView(done, LinearLayout.LayoutParams(0, dp(52), 2f))
        root.addView(actions)
        more = Button(this).apply { text = "접근할 사진 변경"; setOnClickListener { requestGalleryAccess() } }
        root.addView(more)
        settings = Button(this).apply {
            text = "휴대폰 권한 설정"
            setOnClickListener { startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:$packageName"))) }
        }
        root.addView(settings)
        grid = GridView(this).apply {
            numColumns = 3; horizontalSpacing = dp(4); verticalSpacing = dp(4)
            stretchMode = GridView.STRETCH_COLUMN_WIDTH; this.adapter = this@GamjassakGalleryActivity.adapter
            setOnItemClickListener { _, _, position, _ ->
                val uri = entries[position].uri.toString()
                if (!selected.remove(uri)) {
                    if (selected.size >= 500) Toast.makeText(this@GamjassakGalleryActivity, "한 번에 500개까지 선택해 주세요.", Toast.LENGTH_SHORT).show()
                    else selected.add(uri)
                }
                updateSelection(); this@GamjassakGalleryActivity.adapter.notifyDataSetChanged()
            }
            setOnScrollListener(object : AbsListView.OnScrollListener {
                override fun onScrollStateChanged(view: AbsListView?, state: Int) {}
                override fun onScroll(view: AbsListView?, first: Int, visible: Int, total: Int) {
                    if (total > 0 && first + visible >= total - 12) loadPage()
                }
            })
        }
        root.addView(grid, LinearLayout.LayoutParams(-1, 0, 1f))
        setContentView(root); updateSelection()
        if (!accessible()) requestGalleryAccess()
    }

    override fun onResume() {
        super.onResume()
        // Partial permissions can change while this activity is in the background.
        if (!permissionPending) refresh(!started || permissionsSignature() == accessSignature)
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
        generation++; loading = false; exhausted = false; entries.clear(); cache.evictAll()
        if (!preserveSelection) selected.clear()
        adapter.notifyDataSetChanged(); updateSelection()
        more.visibility = if (fullAccess()) View.GONE else View.VISIBLE
        settings.visibility = if (accessible()) View.GONE else View.VISIBLE
        if (!accessible()) {
            message.text = "사진·영상 접근을 허용하면 최근 수정 순으로 볼 수 있어요."
            return
        }
        message.text = if (fullAccess()) "갤러리를 불러오는 중" else "허용한 사진·영상만 표시해요. 접근할 사진을 변경할 수 있어요."
        loadPage()
    }
    private fun updateSelection() { done.text = "${selected.size}개 가져오기"; done.isEnabled = selected.isNotEmpty() }
    private fun complete(uris: List<String>) {
        if (uris.isEmpty()) return
        setResult(RESULT_OK, Intent().putStringArrayListExtra("uris", ArrayList(uris)))
        finish()
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
                val filters = mutableListOf("${MediaStore.Files.FileColumns.MEDIA_TYPE} IN (1,3)")
                if (Build.VERSION.SDK_INT >= 29) filters.add("${MediaStore.MediaColumns.IS_PENDING}=0")
                if (Build.VERSION.SDK_INT >= 30) filters.add("${MediaStore.MediaColumns.IS_TRASHED}=0")
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
                    message.text = if (entries.isEmpty()) "표시할 사진·영상이 없습니다." else if (fullAccess()) "최근 수정한 기록부터 표시해요." else "허용한 사진·영상만 최근 수정 순으로 표시해요."
                }
            } catch (_: Exception) {
                runOnUiThread {
                    if (token != generation || isDestroyed) return@runOnUiThread
                    loading = false; exhausted = true
                    message.text = "갤러리를 읽지 못했습니다. 사진·영상 접근 권한을 확인해 주세요."
                    more.visibility = View.VISIBLE
                }
            }
        }
    }
    private class Cell(val root: LinearLayout, val image: ImageView, val label: TextView) {
        var uri = ""; var task: Future<*>? = null
    }
    private inner class GalleryAdapter : BaseAdapter() {
        override fun getCount() = entries.size
        override fun getItem(position: Int) = entries[position]
        override fun getItemId(position: Int) = entries[position].id
        override fun getView(position: Int, convertView: View?, parent: ViewGroup): View {
            val cell = (convertView?.tag as? Cell) ?: run {
                val root = LinearLayout(this@GamjassakGalleryActivity).apply { orientation = LinearLayout.VERTICAL }
                val image = ImageView(this@GamjassakGalleryActivity).apply { scaleType = ImageView.ScaleType.CENTER_CROP; importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO }
                val label = TextView(this@GamjassakGalleryActivity).apply { textSize = 12f; gravity = Gravity.CENTER; setTextColor(Color.rgb(40, 49, 35)); maxLines = 2 }
                root.addView(image, LinearLayout.LayoutParams(-1, dp(112))); root.addView(label, LinearLayout.LayoutParams(-1, dp(42)))
                Cell(root, image, label).also { root.tag = it }
            }
            val entry = entries[position]; val uri = entry.uri.toString(); cell.uri = uri; cell.task?.cancel(true)
            val checked = selected.contains(uri)
            cell.root.setBackgroundColor(if (checked) Color.rgb(204, 225, 179) else Color.rgb(236, 238, 229))
            val date = if (entry.modified > 0) SimpleDateFormat("yyyy.MM.dd HH:mm", Locale.getDefault()).format(Date(entry.modified * 1000)) else "수정일 없음"
            cell.label.text = "${if (checked) "✓ " else ""}${if (entry.video) "영상" else "사진"}\n$date"
            cell.root.contentDescription = "${entry.name}, ${if (entry.video) "영상" else "사진"}, 수정 $date, ${if (checked) "선택됨" else "선택 안 됨"}"
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
    override fun onSaveInstanceState(state: Bundle) { state.putStringArrayList("selected", ArrayList(selected)); super.onSaveInstanceState(state) }
    override fun onDestroy() { generation++; queryWorker.shutdownNow(); thumbnails.shutdownNow(); cache.evictAll(); super.onDestroy() }
}
