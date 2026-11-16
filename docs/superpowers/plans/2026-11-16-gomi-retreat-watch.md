# Gomi ellipsis, retreat and watching

**Goal:** Show `...` for Gomi below affection 60, replace sideways dodging with bounded backward steps, and add 지켜보기 to Home actions.

**Architecture:** Keep the existing silent-response policy and bundled model unchanged. Animate the existing Gomi drawing in depth (centered, smaller and higher) without changing the button hit area. Watching is a passive Home control: cancel pending speech and show observation feedback without touching relationship storage, activity memory, energy, sleep or model inference.

**Spec:** User request in this conversation, final AGENTS.md, docs/development-validation-policy.md. This supersedes the hidden-balloon/sideways-motion portion of docs/gomi-quiet-response-2026-11-15.md.

## UX decisions

- PM: keep all six choices together in the existing two-column action panel; label the new control 지켜보기 with an eye icon and contextual help.
- User: early Gomi visibly responds with `...`; each active interaction takes another short backward step, staying visible and tappable. Watching gives explicit status and keeps the current pose.
- Builder choice: four depth levels (88%, 76%, 64%, 52%), each reached with three small steps over 0.9 seconds. Further touches hold the minimum size; entering another Home visit resets session-only distance. Reduced motion uses the final depth without animation.
- Preserve sleeping reactions, the saved 59→60 speech boundary, errors/retries, original art, training data, SQLite, app ID and signing.
- Continue the existing unmerged PR #24 so its verified CI repairs remain in the same final-based change set. No merge or APK build is implied.

## Review focus

- Watching during generation or relationship saving must suppress late speech.
- Watching a sleeper must not wake it, replay an angry response, change energy or lower affection.
- Repeated retreat must remain centered, bounded and tappable; reduced motion must retain the depth cue.
- A failed relationship write must remain an error, never a successful `...` response.
- Representative changes and the 59→60 boundary must reset the appropriate presentation.

## Task 1: Home presentation and passive observation

- [x] Add failing behavior checks for centered, progressive/bounded retreat and the reduced-motion endpoint in tests/gomi-behavior.test.mjs. Run the file and inspect the expected failure.
- [x] Implement gomiRetreatAnimation(sequence, reduced, current?) in gomiBehavior.ts and consume it in GomiVisual.tsx; retain other motions.
- [x] Display non-AI `...` with an accessible description in HomeView.tsx/home.css; preserve quiet completion IDs and errors.
- [x] Add a passive 지켜보기 button and status in HomeView.tsx, with helpContent.ts instructions. Cancel pending work, preserve all stored state and the current pose.
- [x] Update the Home action count and add browser checks for dots, actual rendered retreat, bounded/reduced motion, watching asleep, cancellation during generation/save, and another representative character. Include mobile before/after and action-control captures in these checks.
- [ ] Run related Node checks, TypeScript/build and inspect PR CI browser results/screenshots. Record pass/fail and device/APK limits in the PR.
- [ ] Review the final change set, address material findings, commit/publish to PR #24 and report the result.

## Verification record

- Centered/bounded/reduced-motion tests: RED (missing behavior), then GREEN. Rapid-touch continuity: RED (0.88 instead of actual 0.98), then GREEN after starting from current Motion values.
- Related Node checks: 63 passed, no skips. TypeScript and production build passed. New browser file lists 16 mobile/desktop executions; actual execution awaits CI.
- Local full Node run before the rapid-touch addition: 288 passed, 2 failed (CMake/Javac absent in refreshed runtime), 1 existing optional skip. CI provisions these tools; no app/test weakening was made for the local environment.
- Local Chromium cannot launch: Unix socket creation is denied by the environment. Treat this as unverified locally, not as an app behavior result.
- Read-only review found no blocking sleep/cancellation/storage issue. Re-graded rapid-touch snapping as material to the requested motion and fixed it with a failing-then-passing test. Pending pre-watch saves retain their original data effect; only their speech is cancelled. Live OS reduced-motion preference changes remain the existing hook's behavior, while mounting with reduced motion uses a static depth endpoint.
- New APK generation, physical Android installation/update, and real-device animation feel are not verified in this change.
