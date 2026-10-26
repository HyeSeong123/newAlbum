package com.oraedameun.album

import android.app.Activity
import android.app.ActivityManager
import android.content.Context
import android.content.ComponentCallbacks2
import android.content.res.Configuration
import androidx.appcompat.app.AppCompatActivity
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicLong
import java.util.Collections
import org.json.JSONObject

@InvokeArg
class CompanionGenerateArgs { var prompt: String = ""; var sessionId: String = "" }
@InvokeArg
class CompanionSessionArgs { var sessionId: String = "" }

/** One shared local model. No photo, diary, account or location data enters this bridge. */
@TauriPlugin
class GamjassakCompanionPlugin(activity: Activity) : Plugin(activity), ComponentCallbacks2 {
    private val appContext = activity.applicationContext
    companion object {
        // JNI cancellation watermarks survive Activity recreation, so IDs must too.
        private val NEXT_REQUEST = AtomicLong(0)
        private val DOWNLOAD = CompanionModelRegistry.DIALOGUE
    }
    private val executor = Executors.newSingleThreadExecutor()
    private val working = AtomicBoolean(false)
    private val cancelled = AtomicBoolean(false)
    private val memoryPressure = AtomicBoolean(false)
    private val generation = AtomicLong(0)
    @Volatile private var nativeLoaded = false
    @Volatile private var phase = "missing"
    @Volatile private var downloaded = 0L
    @Volatile private var notice = "처음 한 번 AI를 준비하면 인터넷 없이 대화할 수 있어요."
    @Volatile private var activeSession = ""
    private val closedSessions = Collections.synchronizedSet(LinkedHashSet<String>())
    @Volatile private var lastOutcome = "none"
    @Volatile private var lastError = ""
    @Volatile private var lastAt = 0L
    init { appContext.registerComponentCallbacks(this) }
    private val root get() = File(appContext.filesDir, DOWNLOAD.directory)
    private val model get() = File(root, DOWNLOAD.filename)
    private val prefs get() = appContext.getSharedPreferences(DOWNLOAD.directory, Context.MODE_PRIVATE)
    private external fun nativeGenerate(path: String, prompt: String, requestId: Long): ByteArray
    private external fun nativeCancel(requestId: Long)
    private external fun nativeRelease()
    private external fun nativeStats(): String

    private fun stats(): JSONObject = if (nativeLoaded) JSONObject(nativeStats()) else JSONObject().put("resident", false).put("loadCount", 0).put("stage", "idle")
    private fun cancelGeneration() { cancelled.set(true); if (nativeLoaded) nativeCancel(generation.get()) }
    private fun releaseForPressure(memory: Boolean = false) {
        if (memory) memoryPressure.set(true)
        cancelGeneration()
        executor.execute { if (nativeLoaded) nativeRelease() }
    }

    private fun supported(): Boolean {
        val info = ActivityManager.MemoryInfo()
        (appContext.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager).getMemoryInfo(info)
        // Android reserves some advertised RAM for the system; 8GB phones report about 7.x GiB.
        val phone = (appContext.resources.configuration.screenLayout and Configuration.SCREENLAYOUT_SIZE_MASK) < Configuration.SCREENLAYOUT_SIZE_LARGE
        return phone && android.os.Build.SUPPORTED_ABIS.contains("arm64-v8a") && info.totalMem >= 7L * 1024 * 1024 * 1024
    }
    private fun installed(spec: CompanionModelRegistry.Model = DOWNLOAD): Boolean {
        val file = File(File(appContext.filesDir, spec.directory), spec.filename)
        val proof = appContext.getSharedPreferences(spec.directory, Context.MODE_PRIVATE)
        return file.isFile && spec.verified(file.length(), proof.getString("sha", "") ?: "", proof.getLong("mtime", -1), file.lastModified())
    }
    private fun activeModel() = CompanionModelRegistry.select(installed(), installed(CompanionModelRegistry.LEGACY))
    @Command fun modelStatus(invoke: Invoke) {
        val supported = supported()
        val active = activeModel()
        val ready = active != null
        val shown = if (!supported) "unsupported" else if (phase == "error") "error" else if (!working.get() && ready) "ready" else phase
        val text = if (!supported) "AI 대화는 RAM 8GB 이상 Android 스마트폰에서 사용할 수 있어요." else if (shown == "ready") "인터넷 없이 대화할 준비가 됐어요." else notice
        invoke.resolve(JSObject().put("phase", shown).put("supported", supported).put("installed", ready)
            .put("downloaded", downloaded).put("total", DOWNLOAD.bytes).put("message", text)
            .put("model", active?.id ?: "missing").put("upgradeAvailable", active?.id == "legacy")
            .put("runtime", stats()).put("lastOutcome", lastOutcome).put("lastError", lastError).put("lastAt", lastAt))
    }
    private fun openDownload(): HttpURLConnection {
        var target = URL(DOWNLOAD.url)
        repeat(8) {
            val host = target.host.lowercase()
            require(target.protocol == "https" && (host == "huggingface.co" || host.endsWith(".huggingface.co") || host == "hf.co" || host.endsWith(".hf.co"))) { "안전한 다운로드 주소를 확인하지 못했어요." }
            val connection = target.openConnection() as HttpURLConnection
            connection.instanceFollowRedirects = false
            connection.connectTimeout = 15000
            connection.readTimeout = 15000
            val code = connection.responseCode
            if (code in listOf(301, 302, 303, 307, 308)) {
                val location = connection.getHeaderField("Location")
                connection.disconnect()
                require(!location.isNullOrBlank()) { "다운로드 주소가 올바르지 않아요." }
                target = URL(target, location)
            } else {
                if (code != 200) { connection.disconnect(); error("다운로드 서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.") }
                return connection
            }
        }
        error("다운로드 주소를 확인하지 못했어요.")
    }
    @Command fun downloadModel(invoke: Invoke) {
        if (!supported()) { invoke.reject("RAM 8GB 이상 Android 스마트폰에서 준비해 주세요."); return }
        if (installed()) { invoke.resolve(); return }
        if (!working.compareAndSet(false, true)) { invoke.reject("진행 중인 작업이 끝난 뒤 다시 시도해 주세요."); return }
        cancelled.set(false); downloaded = 0; phase = "downloading"; notice = "AI를 다운로드하고 있어요."
        executor.execute {
            val partial = File(root, "download.part")
            var connection: HttpURLConnection? = null
            try {
                check(root.exists() || root.mkdirs()) { "AI 저장 공간을 만들지 못했어요." }
                partial.delete()
                check(DOWNLOAD.canDownload(root.usableSpace)) { "저장 공간을 2.8GB 이상 비운 뒤 다시 시도해 주세요." }
                connection = openDownload()
                val digest = MessageDigest.getInstance("SHA-256")
                connection.inputStream.use { input -> partial.outputStream().use { output ->
                    val bytes = ByteArray(256 * 1024)
                    while (true) {
                        check(!cancelled.get()) { "다운로드를 취소했어요." }
                        val count = input.read(bytes)
                        if (count < 0) break
                        downloaded += count
                        check(downloaded <= DOWNLOAD.bytes) { "AI 파일 크기가 올바르지 않아요." }
                        digest.update(bytes, 0, count); output.write(bytes, 0, count)
                    }
                    output.fd.sync()
                } }
                phase = "verifying"; notice = "AI 파일을 확인하고 있어요."
                val sha = digest.digest().joinToString("") { "%02x".format(it.toInt() and 255) }
                check(!cancelled.get()) { "다운로드를 취소했어요." }
                check(downloaded == DOWNLOAD.bytes && sha == DOWNLOAD.sha256) { "AI 파일이 완전하지 않아요. 다시 다운로드해 주세요." }
                check(partial.renameTo(model)) { "AI 파일을 저장하지 못했어요." }
                check(prefs.edit().putString("sha", DOWNLOAD.sha256).putLong("mtime", model.lastModified()).commit()) { "AI 준비 상태를 저장하지 못했어요." }
                phase = "ready"; notice = "대화할 준비가 됐어요."
            } catch (error: Exception) {
                phase = if (cancelled.get()) "missing" else "error"
                notice = if (cancelled.get()) "다운로드를 취소했어요. 다시 시작할 수 있어요." else error.message ?: "AI를 받지 못했어요. 연결과 저장 공간을 확인해 주세요."
            } finally { partial.delete(); connection?.disconnect(); working.set(false) }
        }
        invoke.resolve()
    }
    @Command fun generate(invoke: Invoke) {
        val args = invoke.parseArgs(CompanionGenerateArgs::class.java)
        val prompt = args.prompt
        if (closedSessions.contains(args.sessionId)) { invoke.reject("AI_CANCELLED: 홈을 떠나 대답을 멈췄어요."); return }
        val selected = activeModel()
        if (!supported() || selected == null) { invoke.reject("먼저 AI를 다운로드해 주세요."); return }
        if (prompt.isBlank() || prompt.length > 12000) { invoke.reject("이야기가 너무 길어요. 조금 짧게 적어 주세요."); return }
        if (!working.compareAndSet(false, true)) { invoke.reject("진행 중인 작업이 끝난 뒤 다시 시도해 주세요."); return }
        cancelled.set(false); memoryPressure.set(false); phase = "generating"; notice = "친구가 생각하고 있어요."
        activeSession = args.sessionId
        lastOutcome = "running"; lastError = ""; lastAt = System.currentTimeMillis()
        val request = NEXT_REQUEST.incrementAndGet()
        generation.set(request)
        executor.execute {
            var reply: String? = null
            var failure: String? = null
            try {
                val info = ActivityManager.MemoryInfo()
                (appContext.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager).getMemoryInfo(info)
                check(selected.canGenerate(info.availMem, info.lowMemory, info.threshold)) { "AI_MEMORY: 메모리가 부족해 기본 반응을 보여 줬어요." }
                if (!nativeLoaded) { System.loadLibrary("gamjassak_companion"); nativeLoaded = true }
                check(!cancelled.get()) { "대답을 멈췄어요." }
                val selectedFile = File(File(appContext.filesDir, selected.directory), selected.filename)
                reply = nativeGenerate(selectedFile.absolutePath, selected.preparePrompt(prompt), request).toString(Charsets.UTF_8)
                check(!cancelled.get()) { "대답을 멈췄어요." }
            } catch (error: Throwable) {
                // JNI throws bounded, user-facing errors; never log the prompt or conversation.
                failure = when {
                    memoryPressure.get() -> "AI_MEMORY: 메모리가 부족해 기본 반응을 보여 줬어요."
                    cancelled.get() -> "AI_CANCELLED: 대답을 멈췄어요."
                    error is OutOfMemoryError -> "AI_MEMORY: 메모리가 부족해 기본 반응을 보여 줬어요."
                    error is UnsatisfiedLinkError -> "AI_ENGINE: AI 실행기를 불러오지 못했어요. 앱 업데이트를 확인해 주세요."
                    else -> error.message ?: "대답을 만들지 못했어요. 다시 시도해 주세요."
                }
                if (error is OutOfMemoryError || failure.contains("AI_MEMORY") || failure.contains("메모리")) { if (nativeLoaded) nativeRelease() }
            } finally { phase = "ready"; working.set(false) }
            lastAt = System.currentTimeMillis()
            if (failure != null) {
                lastOutcome = if (failure.contains("AI_CANCELLED")) "cancelled" else "error"; lastError = failure
                invoke.reject(failure)
            } else {
                lastOutcome = "success"; lastError = ""
                invoke.resolve(JSObject().put("text", reply))
            }
        }
    }
    @Command fun stop(invoke: Invoke) {
        val id = invoke.parseArgs(CompanionSessionArgs::class.java).sessionId
        if (id.isBlank() || id == activeSession) cancelGeneration()
        invoke.resolve()
    }
    @Command fun releaseModel(invoke: Invoke) {
        val id = invoke.parseArgs(CompanionSessionArgs::class.java).sessionId
        if (id.isNotBlank()) {
            synchronized(closedSessions) {
                closedSessions.add(id)
                if (closedSessions.size > 64) closedSessions.remove(closedSessions.first())
            }
        }
        if (id.isNotBlank() && activeSession.isNotBlank() && id != activeSession) { invoke.resolve(); return }
        cancelGeneration()
        executor.execute { if (nativeLoaded) nativeRelease(); invoke.resolve() }
    }
    override fun onPause(activity: AppCompatActivity) {
        releaseForPressure()
    }
    override fun onDestroy(activity: AppCompatActivity) {
        releaseForPressure()
        // Tauri retains plugins across Activity recreation. Keep the worker usable;
        // cancellation releases the current model, context and temporary download.
    }
    override fun onConfigurationChanged(configuration: Configuration) {}
    override fun onLowMemory() { releaseForPressure(true) }
    override fun onTrimMemory(level: Int) {
        if (level >= ComponentCallbacks2.TRIM_MEMORY_RUNNING_LOW) releaseForPressure(level < ComponentCallbacks2.TRIM_MEMORY_UI_HIDDEN)
    }
}
