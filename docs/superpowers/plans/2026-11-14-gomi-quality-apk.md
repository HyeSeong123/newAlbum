# Gomi quality and installable APK implementation plan

> Execute the existing authorized workflow inline; independent corpus and build-environment work are delegated. Use test-driven-development and verification-before-completion. The user delegated construction choices and explicitly requested commit, APK, and deletion of every branch except final/master.

**Goal:** Correct expression, role and conditional personality errors in the compact local Gomi model, commit the verified changes, generate an APK, and retain only final/master.

**Architecture:** Preserve original sources and prior experiments. Remove contradictory scene/action supervision, retain verbatim conditional user examples, freeze a consistent prompt, compare decoding before retraining, and include the initial adapter in validation selection. Package a standalone compact Gomi model through the existing Android inference path; preserve permanent signing identity and unrelated user data.

**Tech Stack:** Existing Python/PyTorch/PEFT, llama.cpp GGUF, TypeScript and Android Kotlin/Java, existing GitHub Actions signed APK workflow.

## Constraints and review focus

- No external AI API, uploaded training, fixed-response substitution, fabricated user approval or invented app-observed life events.
- Ordinary touch boundaries differ from explicit cold/illness dependence; sleeping character and sleeping caretaker must remain distinct.
- Final evaluation cases and expected meanings are excluded from training and epoch selection; format compliance is separate from semantic quality.
- Preserve original corpus, previous weights, database, photos and enrolled APK signing key. Never generate a replacement key.
- Model remains approximately0.5B; evaluate Q4 actual bytes, language and runtime, with deterministic decoding to distinguish sampler effects.
- APK must correspond to the committed source. Report actual signing/model contents and Android checks; no attempt-only completion claim.

## Tasks and verification

- [x] Read source/policies, reproduce prior semantic failures and inspect real validation regression; isolate corpus, prompt and decoding causes.
- [x] Back up all Git refs to a verified complete bundle, audit tracked private-key files and existing signing policy, delete six remote branches with head leases, verify local/remote final/master only.
- [x] Prepare missing SDK/npm/JDK tooling; confirm existing successful signed APK CI route. Windows AppControl initially blocked binaries; user changed settings, Python/GPU/llama execution reverified without agent changing security policy.
- [ ] Add tests for validation selection retaining epoch0, scene/condition priority and no invented petting preference. Fix core/train/actions minimally and compare old-model decoding at repetition penalty1.0.
- [ ] Build `data/gomi-actions-v3` with traceable corrected rows, original conditional examples and independent validation. Verify source hashes, semantic input/target coherence and split separation.
- [ ] Retrain with corrected frozen inputs, retain the best validation candidate including start, reload verify. Evaluate raw new15-case semantic holdout and previous diagnostic16, then quantize/verify compact candidate.
- [ ] Add tested compact Gomi model packaging, prompt parity, native model selection and required notices while keeping the existing engine and other characters. Bump version for installable update, invalidate relevant APK cache.
- [ ] Run affected tests/build and independent code/semantic review. Commit, push final, produce and retrieve permanent-key-signed APK from CI; check contained model/hash, package/version/certificate.
- [ ] Save concise results, artifact paths/CI links and any remaining limitations. Verify branches again.

## Files and interfaces

- `local-ai/core.py`, `actions.json`: same `messages_for(row, characters, actions)` API; explicit speaker/recipient, consistent condition priority.
- `local-ai/train.py`: validation baseline included as epoch0 with its actual adapter path, selection/reload evidence and truthful source commit.
- `local-ai/modeling.py`, `evaluate_*.py`: shared conservative generation settings, no meaning-based output replacement.
- New `build_corpus_v3.py`, `data/gomi-actions-v3/`, `tests/test_gomi_corpus_v3.py`: immutable export and source audit.
- `local-ai/quality-v3/holdout.json`: fresh15 cases written before retraining by another agent; SHA2564227b66f45cf6a4ab753094d7e57845f5101423bc5c0d223ded7e3fdfaF16b12 (verify file bytes before evaluation).
- Android/TS model integration files are selected after the exact candidate and existing runtime are reviewed; no model hash or quality approval is invented in advance.

## Ledger

- Base local commit5db8387; remote finalc8b5e10; masterb5daf81. Local changes before this task were clean.
- Branch archive `outputs/newAlbum-branches-before-cleanup-2026-11-14.bundle` and cleanup manifest live outside Git source; all six deleted branches remain recoverable.
- Ruling: use final checkout directly, as instructed by repository/user; no new work branch or worktree needed for this clean dedicated checkout.
- Ruling: browser automation stopped on URL-confidence policy. No UI retry/bypass; authenticated Git CLI subsequently worked after user login, and branch deletion used that supported route.
