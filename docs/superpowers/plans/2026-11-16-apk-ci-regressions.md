# APK CI Regression Repair Plan

> Execution: implement inline with systematic diagnosis and behavior-based verification.

**Goal:** Restore meaningful CI checks for final 0.9.57 without changing approved character behavior, user data, model weights or signing.

**Architecture:** Exercise the bundled character AI Worker boundary instead of the retired native Qwen/download API. Count recognition Workers separately from the character Worker. Keep lightweight UI/storage Python checks separate from CPU training-loss math checks.

**Spec:** User request to improve the failures reported for HEAD 4357f5b; root AGENTS.md and docs/development-validation-policy.md.

## Constraints

- Preserve sub-60 Gomi's silent response, affection storage ordering, and no inference for silent interactions.
- Preserve source media, SQLite, model/training originals, package identity and permanent signing.
- Do not hide failures with unconditional skips, disable browser suites or relax the one-recognition-Worker contract.
- Keep AI/runtime dependencies unchanged. Training libraries belong only to the dedicated CI job. Bundle the existing SUIT font after the browser test exposed its external CDN request.

## Review Focus

- Cancelled or superseded generations cannot publish a stale line.
- A failed relationship save cannot count as a completed interaction or start inference.
- Missing/corrupt bundled assets display an error and can recover after retry.
- Importing photos cannot start recognition; alternating recognition keeps one recognition Worker alive.
- First-run dismiss/reopen and settings/back/focus remain usable at 320/393px.

## Task 1 Character and recognition browser contracts

- [ ] Reproduce baseline failures with the existing home, audit and person tests.
- [ ] Update tests/home.spec.ts, tests/branding.spec.ts and tests/onboarding-empty.spec.ts for the approved quiet/avoid behavior, checking actual navigation and storage rather than incidental phrasing.
- [ ] Replace the retired API assumptions in tests/companion-chat.spec.ts with bundled Worker behavior. Add a narrow inference fixture only for timing, failure and cancellation control; also exercise the real bundled model.
- [ ] Scope audit and person Worker accounting to their recognition domain, still rejecting unintended recognition and overlapping recognition Workers.
- [ ] Run the affected browser tests on mobile and desktop and inspect mobile captures.

## Task 2 Python CI dependencies and isolation

- [ ] Reproduce Python discovery's missing-training-dependency errors.
- [ ] Move the two real CPU loss/gradient comparisons to tests/training/test_response_loss.py and make evaluate_gguf's runtime-only imports lazy.
- [ ] Pin Python 3.12 and NumPy for lightweight UX checks. Add a dedicated CPU training math job with explicit pinned requirements; no silent optional skips.
- [ ] Verify lightweight discovery without Torch and run the dedicated math checks with CPU Torch installed.

## Task 3 Integration and delivery

- [ ] Run TypeScript/build, Node unit tests, related browser suites and Python checks. Record actual pass/fail/skip counts.
- [ ] Review the diff for weakened tests, accidental source/model/data changes and signing changes.
- [ ] Commit to a repair branch and open a reviewable PR against final; inspect resulting CI and address relevant failures.

## Baseline and decisions

- Remote final and local starting HEAD: 4357f5b2295acb6dcf28a2b76d2b4290433bed44; no open PRs at start.
- Remote baseline: APK pipeline passed; source browser shards failed 65 executions, help 2, UX Python discovery 4 missing-module errors.
- Existing isolated checkout: gomgomi-ci-fix. No changes to the shared final branch during implementation.
- First PR CI: all previously failing browser cases recovered; only two new offline checks failed on the external SUIT font. Replace that runtime CDN dependency with the official pinned font package and preserve its OFL notice.
- Review fix: add overlapping generation/storage and background/return coverage, failed silent-save coverage, observation before model warm-up, and retain successful mobile screenshots as CI artifacts.
