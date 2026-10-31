# Gomi Training Implementation Plan

> **For agentic workers:** Execute inline using superpowers:executing-plans. The user explicitly delegated continuation of the already discussed local training setup.

**Goal:** Train and reload a small Gomi LoRA, saving honest before/after evidence.

**Architecture:** Export the app's real touch prompts after the native DIALOGUE preparePrompt transform, and curated draft replies to grouped JSONL splits. A separate WSL Python process loads pinned Qwen3-4B-Instruct-2507 with NF4 and trains response-only LoRA; app runtime stays unchanged.

**Tech Stack:** Node/TypeScript loader, Python 3.11, torch 2.7.1+cu126, transformers 4.51.3, PEFT 0.15.2, bitsandbytes 0.46.1.

**Spec:** docs/superpowers/specs/2026-10-31-gomi-training-design.md

## Global Constraints

- Base branch final ac5d31d; do not create/delete branches or change APK version.
- Preserve app prompts, 0/20/30/60/90 affection boundaries and sleeping state.
- Use only authored example text; no personal photo/diary/chat data.
- Batch 1, max length 640, rank 8, FP32 compute; stop on nonfinite loss.
- Weights and caches outside Git; no runtime deployment.

## Review Focus

- Prompt/answer boundary: supervised tokens exclude instructions and empty think prefix.
- Overlong prompts: fail visibly rather than silently discarding answer tokens.
- Validation leakage: group IDs and prompts cannot occur in both splits.
- Interrupted runs: preserve checkpoints and never overwrite a previous run.
- GPU numerical failure: nonfinite loss or unchanged weights cannot be reported as trained.

## Tasks

- [x] Add failing data integrity and answer-mask tests; observe expected failures.
- [x] Author Gomi scenario replies, export actual runtime prompts, implement supervised encoding and checks.
- [x] Implement train/evaluate CLI with immutable base revision, adapter checkpoints and run reports; run focused tests.
- [x] Install isolated Python dependencies, export JSONL, run GPU forward/backward smoke check.
- [x] Train one small initial run, reload adapter, record held-out losses and generated lines.
- [x] Review changes and report actual outputs, limits and next app-integration step.

## Execution log

- WSL direct access initially returned E_ACCESSDENIED in sandbox; user approved elevated WSL command. Ubuntu WSL2, user baobab0612, GPU CUDA available, 7.7GiB WSL RAM, 2GiB swap.
- Scope choice: keep work in current checkout and the already-created separate ~/gomi-training environment; no Git branch operation or app product code change is needed.
- Approach choice: use draft synthetic replies grounded in existing Gomi personality; do not claim user approval of each reply.
- Correction: user identified 4B as the intended app model. Verified DOWNLOAD=DIALOGUE and 4B-first selection in Android registry. Target exactly Qwen/Qwen3-4B-Instruct-2507; strip native non-thinking markers. No 1.7B training or weight download took place.
- Source choice: raw 4B weights are 8,044,982,000 bytes and stalled with Xet. HTTP resumes but transfers slowly. Use the same 4B's Unsloth NF4 distribution (2,653,133,894 bytes), retaining separate source and original revisions; incomplete raw cache is preserved.
- Context choice: tokenizer measured 568–610 tokens for real app inputs. Increase initial 512 to 640 so no system/user/answer text is truncated.
- Review: fresh reviewer found no Critical/Important defects; noted adapter-only checkpoints, six of eight generation probes, and need for real GPU smoke. Added longest-batch backward before baseline. Exact optimizer resume remains unsupported and documented.
- Memory choice: project vocabulary logits only at positions predicting the reply; avoids large unused prompt-vocabulary tensors. Tiny Qwen3 test proves matching standard masked loss and parameter gradients (RED then GREEN). Full input context and response targets are preserved.
- Verification: Node training/touch tests 22 passed; Python data/memory-equivalence tests 5 passed. NumPy warning resolved, bitsandbytes import and actual small GTX1660 backward passed after installing Ubuntu build-essential.
- Live 4B proof: NF4 weight SHA256 f632ab95da1d8f307237094aca7c7dfa9e416b6d2f87bdd8ecda6dadfedb204d verified; 4B load 3306MiB, longest-batch backward peak 3851MiB. Baseline held-out NLL 4.605605755895829. Checkpoint 6 has all 144 LoRA B matrices nonzero, independently verifying functional training beyond AdamW decay of A. Full training/reload still in progress at this log entry.
- Final run: complete phase after 24 steps and saved-adapter reload. NLL 4.605605755895829 -> 2.381423317190362, peak 3919MiB, 776 seconds excluding download. Adapter hash d6dbb90a8e30ad3e057122b8a4c5959784e66cc8fcd2b21d4c6d777569f8e4dd; 144/144 B matrices nonzero. Results copied to ignored gomi-training-output/gomi-4b-first.
- Source review delta: no Critical/Important findings in NF4 loader or selected-logit loss. Canonical revision is a recorded reference, not verified exact Unsloth conversion provenance; documented explicitly.
- PEFT reload warning was reproduced on tiny actual Qwen3: exactly one adapter, same logits. Clearing stale metadata after unload removes the warning without changing outputs; future run cleanup applied.
- Final quality: shorter replies, but several remain generic, awkward, or reverse the action's roles. Not approved for app deployment. Human-readable evidence and limits: docs/gomi-training-2026-10-31.md.
- Final verification: Node 22/22 and Python 5/5 passed, syntax checks passed, copied adapter SHA256 matches, no app runtime or version changes.
- Follow-up user request: retrain with the prepared merged persona-v2 data. Created a separate immutable work/data snapshot (105 train/24 validation), reused the same pinned cached 4B and trained a new adapter for 27 steps. Training/reload completed in 864.6s, base loss 4.4963655789693195 -> 2.340999327880749, peak 3916MiB. Adapter hash 7efe15f5bf6a87efb1ef3898615fc09c5c409bd73c10cddf2de263991d86b352; 144/144 B matrices nonzero.
- Fair same-data comparison: old v1 adapter 2.3729154735371685 versus new v2 2.340999327880749 on identical v2 validation SHA256 865395fd476d54b85866c399680d78570b51b1c7bb4823d215d1a8e278771fbe. New independently loaded evaluation equals the training report. Added 9 training-reference recall probes and a held-out runtime walk probe; several show polite speech, stage directions or role confusion. Quality remains unapproved and no app deployment occurred. Full evidence: docs/gomi-retraining-2026-10-31.md.
