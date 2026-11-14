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
class CompanionGenerateArgs { var prompt: String = ""; var sessionId: String = ""; var characterId: String = ""; var usage: String = "" }
@InvokeArg
class CompanionModelArgs { var characterId: String = ""; var usage: String = "" }
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
    // Disable further GPU attempts for this process after a failed GPU run,
    // avoiding repeated driver faults and expensive initialization retries.
    @Volatile private var gpuDisabledForSession = false
    @Volatile private var lastGpuFallback = false
    @Volatile private var phase = "missing"
    @Volatile private var downloaded = 0L
    @Volatile private var notice = "처음 한 번 AI를 준비하면 인터넷 없이 대화할 수 있어요."
    @Volatile private var activeSession = ""
    private val closedSessions = Collections.synchronizedSet(LinkedHashSet<String>())
    @Volatile private var lastOutcome = "none"
    @Volatile private var lastError = ""
    @Volatile private var lastAt = 0L
    @Volatile private var lastModelId = ""
    private val cleanupQueued = AtomicBoolean(false)
    @Volatile private var cleanupFinished = false
    @Volatile private var cleanupRetryAfter = 0L
    init { appContext.registerComponentCallbacks(this); scheduleLegacyCleanup() }
    private val root get() = File(appContext.filesDir, DOWNLOAD.directory)
    private val model get() = File(root, DOWNLOAD.filename)
    private val prefs get() = appContext.getSharedPreferences(DOWNLOAD.directory, Context.MODE_PRIVATE)
    private external fun nativeGenerate(path: String, prompt: String, adapterPath: String,
                                        requestId: Long, availableMemoryBytes: Long, cpuOnly: Boolean, gomiAction: Boolean): ByteArray
    private external fun nativeCancel(requestId: Long)
    private external fun nativeRelease()
    private external fun nativeStats(): String

    private fun stats(): JSONObject = (if (nativeLoaded) JSONObject(nativeStats())
        else JSONObject().put("resident", false).put("loadCount", 0).put("stage", "idle"))
        .put("gpuFallback", lastGpuFallback)
        .put("gomiActionApplied", lastModelId == "gomi-action-v3" && lastOutcome == "success")
    private fun cancelGeneration() { cancelled.set(true); if (nativeLoaded) nativeCancel(generation.get()) }
    private fun releaseForPressure(memory: Boolean = false) {
        if (memory) memoryPressure.set(true)
        cancelGeneration()
        executor.execute { if (nativeLoaded) nativeRelease() }
    }

    private fun supported(compact: Boolean = false): Boolean {
        val info = ActivityManager.MemoryInfo()
        (appContext.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager).getMemoryInfo(info)
        // Android reserves some advertised RAM for the system; 8GB phones report about 7.x GiB.
        val phone = (appContext.resources.configuration.screenLayout and Configuration.SCREENLAYOUT_SIZE_MASK) < Configuration.SCREENLAYOUT_SIZE_LARGE
        val minimum = if (compact) 2L else 7L
        val abis = android.os.Build.SUPPORTED_ABIS
        val supportedAbi = abis.contains("arm64-v8a") || (compact && abis.contains("x86_64"))
        return phone && supportedAbi && info.totalMem >= minimum * 1024 * 1024 * 1024
    }
    private fun bundledGomi(): GomiActionModel.Spec? = try {
        val data = appContext.assets.open(GomiActionModel.MANIFEST).bufferedReader().use { JSONObject(it.readText()) }
        GomiActionModel.Spec(data.getString("characterId"), data.getString("usage"), data.getString("file"), data.getLong("bytes"), data.getString("sha256"))
    } catch (_: Exception) { null }
    private fun installed(spec: CompanionModelRegistry.Model = DOWNLOAD): Boolean {
        val file = File(File(appContext.filesDir, spec.directory), spec.filename)
        val proof = appContext.getSharedPreferences(spec.directory, Context.MODE_PRIVATE)
        return file.isFile && spec.verified(file.length(), proof.getString("sha", "") ?: "", proof.getLong("mtime", -1), file.lastModified())
    }
    private fun activeModel() = if (installed()) DOWNLOAD else CompanionModelRegistry.select(false, installed(CompanionModelRegistry.LEGACY))
    private fun retireLegacyModel() {
        val verifiedMtime = prefs.getLong("mtime", -1)
        if (cleanupFinished || !installed()) return
        try {
            CompanionModelRegistry.retireLegacyFiles(appContext.filesDir, true, verifiedMtime, Runnable { if (nativeLoaded) nativeRelease() })
            cleanupFinished = true
        } catch (_: Exception) {
            // Housekeeping must not break a verified current model or repeatedly evict it.
            cleanupRetryAfter = android.os.SystemClock.elapsedRealtime() + 60_000
        }
    }
    private fun scheduleLegacyCleanup() {
        if (cleanupFinished || working.get() || android.os.SystemClock.elapsedRealtime() < cleanupRetryAfter || !cleanupQueued.compareAndSet(false, true)) return
        executor.execute {
            try { if (!working.get()) retireLegacyModel() }
            finally { cleanupQueued.set(false) }
        }
    }
    @Command fun modelStatus(invoke: Invoke) {
        val args = invoke.parseArgs(CompanionModelArgs::class.java)
        if (GomiActionModel.applies(args.characterId, args.usage)) {
            val supported = supported(true)
            val spec = bundledGomi()
            val shown = if (!supported) "unsupported" else if (spec == null) "missing" else if (working.get()) phase else "ready"
            val text = if (!supported) "고미 AI 반응은 RAM 2GB 이상 ARM64·x86_64 Android 스마트폰에서 사용할 수 있어요."
                else if (spec == null) "고미 AI 파일이 포함되지 않았어요. 앱 업데이트를 확인해 주세요."
                else "고미 AI가 앱에 포함되어 있어요. 다운로드 없이 반응해요."
            invoke.resolve(JSObject().put("phase", shown).put("supported", supported).put("installed", spec != null)
                .put("downloaded", 0).put("total", spec?.bytes ?: 0).put("message", text)
                .put("model", "gomi-action-v3").put("bundled", true).put("upgradeAvailable", false)
                .put("runtime", stats()).put("lastOutcome", lastOutcome).put("lastError", lastError).put("lastAt", lastAt))
            return
        }
        val supported = supported()
        val active = activeModel()
        if (active === DOWNLOAD) scheduleLegacyCleanup()
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
                cleanupFinished = false
                retireLegacyModel()
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
        val compact = GomiActionModel.applies(args.characterId, args.usage)
        val compactSpec = if (compact) bundledGomi() else null
        if (closedSessions.contains(args.sessionId)) { invoke.reject("AI_CANCELLED: 홈을 떠나 대답을 멈췄어요."); return }
        if (compact) {
            if (!supported(true)) { invoke.reject("AI_UNSUPPORTED: 고미 AI를 지원하는 Android 스마트폰에서 사용해 주세요."); return }
            if (compactSpec == null) { invoke.reject("AI_MODEL: 고미 AI 파일을 확인하지 못했어요. 앱 업데이트를 확인해 주세요."); return }
        } else if (!supported() || activeModel() == null) { invoke.reject("먼저 AI를 다운로드해 주세요."); return }
        if (prompt.isBlank() || prompt.length > 12000) { invoke.reject("이야기가 너무 길어요. 조금 짧게 적어 주세요."); return }
        if (!working.compareAndSet(false, true)) { invoke.reject("진행 중인 작업이 끝난 뒤 다시 시도해 주세요."); return }
        cancelled.set(false); memoryPressure.set(false); lastGpuFallback = false
        phase = "generating"; notice = "친구가 생각하고 있어요."
        activeSession = args.sessionId
        lastOutcome = "running"; lastError = ""; lastAt = System.currentTimeMillis()
        val request = NEXT_REQUEST.incrementAndGet()
        generation.set(request)
        executor.execute {
            var reply: String? = null
            var failure: String? = null
            try {
                // A queued upgrade/cleanup may have retired legacy weights since invocation.
                val selected = if (compact) null else (activeModel() ?: error("먼저 AI를 다운로드해 주세요."))
                val info = ActivityManager.MemoryInfo()
                (appContext.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager).getMemoryInfo(info)
                fun canGenerate(memory: ActivityManager.MemoryInfo) = if (compact) compactSpec!!.canGenerate(memory.availMem, memory.lowMemory, memory.threshold)
                    else selected!!.canGenerate(memory.availMem, memory.lowMemory, memory.threshold)
                check(canGenerate(info)) { "AI_MEMORY: 메모리가 부족해 AI 대사를 생성하지 못했어요." }
                if (!nativeLoaded) { System.loadLibrary("gamjassak_companion"); nativeLoaded = true }
                check(!cancelled.get()) { "대답을 멈췄어요." }
                val selectedFile = if (compact) GomiActionModel.install(appContext.filesDir, compactSpec!!) { appContext.assets.open(GomiActionModel.ASSET) }
                    else File(File(appContext.filesDir, selected!!.directory), selected.filename)
                val adapterPath = if (!compact && GomiAdapter.applies(args.characterId, selected!!.sha256)) {
                    GomiAdapter.install(appContext.filesDir) { appContext.assets.open(GomiAdapter.ASSET) }.absolutePath
                } else ""
                check(!cancelled.get()) { "대답을 멈췄어요." }
                val preparedPrompt = if (compact) prompt else selected!!.preparePrompt(prompt)
                lastModelId = if (compact) "gomi-action-v3" else selected!!.id
                try {
                    reply = nativeGenerate(selectedFile.absolutePath, preparedPrompt, adapterPath, request,
                        info.availMem, gpuDisabledForSession, compact).toString(Charsets.UTF_8)
                } catch (gpuFailure: Throwable) {
                    // Retry only if native actually attempted GPU. On devices
                    // without Vulkan the first run is already CPU-only.
                    val attemptedGpu = nativeLoaded && try { JSONObject(nativeStats()).optBoolean("gpuAttempted", false) }
                        catch (_: Throwable) { false }
                    if (!attemptedGpu || cancelled.get() || memoryPressure.get() ||
                        gpuFailure is UnsatisfiedLinkError) throw gpuFailure
                    gpuDisabledForSession = true
                    lastGpuFallback = true
                    nativeRelease() // free GPU buffers/context before CPU allocates weights
                    val availableAgain = ActivityManager.MemoryInfo()
                    (appContext.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager).getMemoryInfo(availableAgain)
                    check(canGenerate(availableAgain)) {
                        "AI_MEMORY: GPU 오류 후 CPU로 전환할 메모리가 부족해요."
                    }
                    check(!cancelled.get()) { "대답을 멈췄어요." }
                    reply = nativeGenerate(selectedFile.absolutePath, preparedPrompt, adapterPath, request,
                        availableAgain.availMem, true, compact).toString(Charsets.UTF_8)
                }
                check(!cancelled.get()) { "대답을 멈췄어요." }
            } catch (error: Throwable) {
                // JNI throws bounded, user-facing errors; never log the prompt or conversation.
                failure = when {
                    memoryPressure.get() -> "AI_MEMORY: 메모리가 부족해 AI 대사를 생성하지 못했어요."
                    cancelled.get() -> "AI_CANCELLED: 대답을 멈췄어요."
                    error is OutOfMemoryError -> "AI_MEMORY: 메모리가 부족해 AI 대사를 생성하지 못했어요."
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
