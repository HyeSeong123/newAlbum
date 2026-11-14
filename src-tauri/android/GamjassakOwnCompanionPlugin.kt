package com.oraedameun.album

import android.app.Activity
import app.tauri.annotation.Command
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin

/** Compatibility bridge only. Actual own-model inference runs in the app Worker.
 * No native AI library, model downloader, network call or pretrained fallback.
 */
@TauriPlugin
class GamjassakCompanionPlugin(activity: Activity) : Plugin(activity) {
    @Command fun modelStatus(invoke: Invoke) {
        val status = JSObject()
        status.put("phase", "unsupported").put("supported", false)
            .put("installed", false).put("downloaded", 0).put("total", 0)
            .put("message", "곰고미 전용 AI는 홈의 행동 반응에서 실행됩니다.")
            .put("runtime", JSObject().put("resident", false).put("stage", "disabled"))
        invoke.resolve(status)
    }
    @Command fun downloadModel(invoke: Invoke) { invoke.reject("AI_EXTERNAL_MODELS_DISABLED") }
    @Command fun generate(invoke: Invoke) { invoke.reject("AI_ACTIONS_ONLY") }
    @Command fun stop(invoke: Invoke) { invoke.resolve() }
    @Command fun releaseModel(invoke: Invoke) { invoke.resolve() }
}
