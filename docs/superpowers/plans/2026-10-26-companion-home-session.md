# Home companion inference session implementation plan

> **For agentic workers:** Use superpowers:executing-plans for inline execution; one fresh review at the end.

**Goal:** Reuse the installed Qwen model in Home and make actual inference outcomes distinguishable from installation.

**Architecture:** One process-wide model guarded by the existing native inference mutex. Each request owns a fresh context and sampler. Cancellation retains the model; Home unmount/background/memory pressure cancel and release it. React keeps outcomes across settings and remembers five recent authored reactions.

**Tech Stack:** Existing React/TypeScript, Tauri/Rust, Kotlin/JNI and pinned llama.cpp. No new model/dependency/DB migration.

**Spec:** User's 2026-10-26 detailed Home AI lifecycle request; summarized in `docs/companion-home-session-0.9.35.md` with evidence and limits.

## Global constraints

- Work on `final`, starting `33d87bec3ee7c892c21a24a557ba385311b1c1e4` (0.9.34); no new branch.
- Preserve all user data/settings, character rules, model files, package ID and signing key.
- Android smartphones RAM 8GB+, no tablets. No inference on app startup/Home render.
- No thinking/loading label in Home. Settings/help do not release the model.
- One regeneration maximum for duplicate AI lines; one model for all 17 characters.
- Impacted tests locally; broad validation in CI. Report unmeasured real-device timings honestly.

## Review focus

1. Leave/reenter while a native load is pending: old cancellation must not free the next session's model.
2. Settings opens during inference: retain terminal outcome and show it live, without dropping the answer.
3. Memory pressure after a cached load: cancel and reclaim, without deleting installed weights.
4. Five identical gestures and short pools: immediate nonrepeating fallback with intact sleep affection rules.
5. Load timeout and generation timeout: distinguish phases and never publish cancelled/partial reasoning.

### Task 1: Native lifecycle and diagnostics

Files: `src-tauri/android/companion/{companion.cpp,model_session.h}`, `GamjassakCompanionPlugin.kt`, `CompanionModelRegistry.java`, Rust command/permission registration; native/JVM tests.

Interfaces: add `release_chat_model`; retain `stop_chat_model` as cancellation only. Status adds resident/session timings/outcome without prompt or generated content.

- [ ] RED: compile/run real cache helper with counted loaders/deleters; cold/warm/changed path/failed load/release; independent deadlines, cancellation, concurrent release.
- [ ] GREEN: shared model, request-local context, distinct load/generation deadlines, request timing counters and cancellation-safe release.
- [ ] RED/GREEN: test memory policy with lowMemory, threshold reserve and resident-model reuse; replace fixed 3400MiB gate, handle allocation and memory-pressure release.

### Task 2: Immediate variety and real execution state

Files: `companionFallback.ts`, Home/useCompanionReactions/service/settings and companion browser/unit tests.

Interfaces: `chooseCompanionFallback(...)` remembers last five per character. Settings subscribes to actual queued/running/success/failure outcomes; modal opens do not cancel inference. Home unmount calls release.

- [ ] RED: repeated sleeping/awake gestures and all five actions exclude recent five, oldest-first exhaustion; all Gomi affection tiers remain appropriate.
- [ ] GREEN: expand state-specific pools and use one fallback selector for Home touch/action.
- [ ] RED/GREEN: settings during slow generation shows eventual result; Home navigation releases, settings/help do not; settings distinguishes model installed from actual outcome and timings.
- [ ] Verify prompt/dedup/privacy and sleep rules remain unchanged; mobile tests assert fresh AI line reaches bubble and no thinking indicator.

### Task 3: Release and evidence

- [ ] Run impacted unit/JVM/native/browser flows and one build; inspect screenshots where changed.
- [ ] Review whole diff once, fix significant findings with reproductions.
- [ ] Version 0.9.35, upload tested tree to existing `final`; verify expected head and matching tree.
- [ ] Check signed APK build/install CI, save APK for download. Record real-phone performance as unmeasured unless actual evidence is available.

## Execution ledger

Ruling: Execute in the fresh dedicated `final` clone, inline, without a new branch or extra permission menu; user explicitly requests source modification and APK validation.

Baseline: final HEAD and open PRs checked (none). Latest 0.9.34 Android run 40242162364 succeeded; source validation 40243778591 succeeded. Neither tested real 4B generation on an Android phone. APK ELF contains the expected JNI entry points and no missing companion shared-library dependency.

Root-cause evidence: nativeGenerate loads/frees model per request and starts a single 60s deadline before loading; registry requires 3400MiB free regardless of residency; Home immediately shows deterministic two-line sleeping fallbacks; settings currently cancels pending work and labels file presence as ready.

Task 1: complete locally. Native cache/deadline tests and actual pinned4B JNI reuse/cancel/release/reenter pass. Disabled CPU extra repack after observing1683MiB duplicate buffer. Android phone reserve/latency remains provisional and unmeasured.

Task 2: complete locally. Recent-five pools, live settings outcomes and no modal cancellation verified; all five action bridge/bubble flows pass. 39 impacted tests and build pass.

Review: one fresh read-only reviewer. Important delayed-stop ordering reproduced RED→GREEN; stop-error recovery added. Minor failed replacement residency reproduced in actual JNI then fixed; global native metrics explicitly labeled as app-wide. Closed-session set synchronized defensively. No second review requested.

Task 3: source review complete; signed APK/installed Android bridge validation pending CI. No real-phone measurements claimed.
