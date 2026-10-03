package com.oraedameun.album

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.provider.DocumentsContract
import android.provider.OpenableColumns
import android.view.View
import android.view.ViewGroup
import android.webkit.MimeTypeMap
import android.webkit.WebView
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.ActivityResult
import androidx.appcompat.app.AppCompatActivity
import app.tauri.annotation.ActivityCallback
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import org.json.JSONArray
import java.util.ArrayDeque

@InvokeArg
class DescribeArgs { var uri: String = "" }

@InvokeArg
class CreateDocumentArgs {
    var uri: String = ""
    var name: String = ""
    var directory: Boolean = false
}

/** Rust owns copying/hashing/storage. This bridge only describes SAF documents
 *  and creates user-requested export destinations; it never deletes originals. */
@TauriPlugin
class GamjassakMediaPlugin(private val activity: Activity) : Plugin(activity) {
    private var back: OnBackPressedCallback? = null
    private var backOwner: ComponentActivity? = null
    private var backView: WebView? = null
    override fun load(webView: WebView) {
        val component = activity as? ComponentActivity ?: return
        attachBack(component, webView)
    }
    override fun onResume(activity: AppCompatActivity) {
        // Plugins survive activity recreation. Bind to the resumed activity's
        // WebView rather than the activity passed to the plugin's constructor.
        activity.window.decorView.post {
            if (activity.isDestroyed) return@post
            val webView = findWebView(activity.window.decorView) ?: return@post
            attachBack(activity, webView)
        }
    }
    private fun findWebView(view: View): WebView? {
        if (view is WebView) return view
        if (view is ViewGroup) {
            for (index in 0 until view.childCount) {
                findWebView(view.getChildAt(index))?.let { return it }
            }
        }
        return null
    }
    private fun attachBack(component: ComponentActivity, webView: WebView) {
        if (backOwner === component && backView === webView && back != null) return
        back?.remove()
        backOwner = component
        backView = webView
        back = object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                webView.evaluateJavascript("window.__gamjassakBack ? window.__gamjassakBack() : false") { handled ->
                    if (handled != "true") {
                        isEnabled = false
                        component.onBackPressedDispatcher.onBackPressed()
                        isEnabled = true
                    }
                }
            }
        }
        component.onBackPressedDispatcher.addCallback(component, back!!)
    }
    override fun onDestroy(activity: AppCompatActivity) {
        if (backOwner === activity) {
            back?.remove()
            back = null
            backOwner = null
            backView = null
        }
    }

    @Command
    fun pickDirectory(invoke: Invoke) {
        try {
            val intent = Intent(Intent.ACTION_OPEN_DOCUMENT_TREE)
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION
                or Intent.FLAG_GRANT_PREFIX_URI_PERMISSION)
            startActivityForResult(invoke, intent, "directoryResult")
        } catch (error: Exception) { invoke.reject(error.message ?: "폴더 선택기를 열지 못했습니다.") }
    }

    @ActivityCallback
    fun directoryResult(invoke: Invoke, result: ActivityResult) {
        val uri = if (result.resultCode == Activity.RESULT_OK) result.data?.data?.toString() else null
        invoke.resolve(JSObject().put("uri", uri))
    }

    @Command
    fun describe(invoke: Invoke) {
        val args = invoke.parseArgs(DescribeArgs::class.java)
        Thread {
            try {
                val uri = Uri.parse(args.uri)
                require(uri.scheme == "content") { "파일 선택기로 사진이나 폴더를 선택해 주세요." }
                val files = JSONArray()
                if (DocumentsContract.isTreeUri(uri) && !uri.pathSegments.contains("document")) {
                    val pending = ArrayDeque<String>()
                    val visited = HashSet<String>()
                    pending.add(DocumentsContract.getTreeDocumentId(uri))
                    while (pending.isNotEmpty()) {
                        val parent = pending.removeFirst()
                        if (!visited.add(parent)) continue
                        val children = DocumentsContract.buildChildDocumentsUriUsingTree(uri, parent)
                        val columns = arrayOf(DocumentsContract.Document.COLUMN_DOCUMENT_ID,
                            DocumentsContract.Document.COLUMN_DISPLAY_NAME, DocumentsContract.Document.COLUMN_MIME_TYPE,
                            DocumentsContract.Document.COLUMN_SIZE, DocumentsContract.Document.COLUMN_LAST_MODIFIED)
                        val cursor = activity.contentResolver.query(children, columns, null, null, null)
                            ?: error("폴더의 기록을 읽을 수 없습니다.")
                        cursor.use {
                            while (it.moveToNext()) {
                                val id = it.getString(0)
                                val mime = it.getString(2) ?: "application/octet-stream"
                                if (mime == DocumentsContract.Document.MIME_TYPE_DIR) pending.add(id)
                                else files.put(document(DocumentsContract.buildDocumentUriUsingTree(uri, id),
                                    it.getString(1) ?: "기록", mime,
                                    if (it.isNull(3)) null else it.getLong(3),
                                    if (it.isNull(4)) null else it.getLong(4)))
                            }
                        }
                    }
                } else {
                    var name = "기록"
                    var size: Long? = null
                    activity.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE), null, null, null)?.use {
                        if (it.moveToFirst()) { name = it.getString(0) ?: name; if (!it.isNull(1)) size = it.getLong(1) }
                    }
                    var modified: Long? = null
                    // Some photo/cloud providers do not support DocumentsContract columns.
                    try {
                        activity.contentResolver.query(uri, arrayOf(DocumentsContract.Document.COLUMN_LAST_MODIFIED), null, null, null)?.use {
                            if (it.moveToFirst() && !it.isNull(0)) modified = it.getLong(0)
                        }
                    } catch (_: Exception) { }
                    files.put(document(uri, name, activity.contentResolver.getType(uri) ?: "application/octet-stream", size, modified))
                }
                invoke.resolve(JSObject().put("files", files))
            } catch (error: Exception) { invoke.reject(error.message ?: "선택한 기록을 읽을 수 없습니다.") }
        }.start()
    }

    private fun document(uri: Uri, name: String, mime: String, size: Long?, modified: Long?): JSObject = JSObject()
        .put("uri", uri.toString()).put("name", name).put("mime", mime)
        .put("size", size?.takeIf { it >= 0 }).put("modified", modified?.takeIf { it > 0 })

    @Command
    fun createDocument(invoke: Invoke) {
        val args = invoke.parseArgs(CreateDocumentArgs::class.java)
        Thread {
            try {
                val tree = Uri.parse(args.uri)
                require(tree.scheme == "content" && DocumentsContract.isTreeUri(tree)) { "저장할 폴더를 다시 선택해 주세요." }
                val parent = if (tree.pathSegments.contains("document")) tree
                    else DocumentsContract.buildDocumentUriUsingTree(tree, DocumentsContract.getTreeDocumentId(tree))
                val extension = args.name.substringAfterLast('.', "").lowercase()
                val mime = if (args.directory) DocumentsContract.Document.MIME_TYPE_DIR
                    else MimeTypeMap.getSingleton().getMimeTypeFromExtension(extension) ?: "application/octet-stream"
                val created = DocumentsContract.createDocument(activity.contentResolver, parent, mime, args.name)
                    ?: error("저장할 파일을 만들지 못했습니다.")
                invoke.resolve(JSObject().put("uri", created.toString()))
            } catch (error: Exception) { invoke.reject(error.message ?: "저장 위치를 준비하지 못했습니다.") }
        }.start()
    }
}
