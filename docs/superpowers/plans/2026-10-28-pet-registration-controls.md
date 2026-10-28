# Pet registration controls implementation plan

> **For agentic workers:** Use superpowers:executing-plans; resume the single scoped task below.

**Goal:** Remove independent pet detection, align remaining controls, and recover incorrect species in unknown-pet assignment.
**Architecture:** Keep registered references and existing queue/matcher. Add explicit optional kind correction to bulk assignment, committed atomically with links. Reuse the assignment dialog with a pet-only field supplied by UnknownPets.
**Tech Stack:** React/TypeScript, Rust/rusqlite, Playwright, existing Tauri Android workflow.
**Spec:** ../specs/2026-10-28-pet-registration-controls-design.md

## Global constraints
- Preserve originals, names, other detections and links; no new models, dependencies or migration.
- No inference at import, profile save, startup or navigation.
- Omitting `kind` preserves guarded behavior; publish existing PR #21, leave final unmerged.

## Review focus
- Mixed selections fail without explicit correction.
- Stale/invalid IDs roll back corrections, links and new names.
- Cat-cascade correction discards incompatible face data but retains detectedKind.
- Manual negative IDs, old pending queues and excluded legacy pose metadata remain safe.
- Controls stay reachable at 320px and enlarged text.

### Task 1: Controls and species recovery
**Files:** PetsView.tsx, UnknownPets.tsx, EntityAssignmentDialog.tsx, entityService.ts, pet_recognition.rs, entity_management.rs, pets.css, helpContent.ts; related UI/native tests and installed pet smoke.
**Interfaces:** `assign_pet_detections(ids,target,name,kind:Option<String>)`; correct selected positive IDs only, omitted/null preserves detected kinds.

- [ ] Write/run failing UI tests and native correction/rollback/provenance tests.
- [ ] Remove standalone scan state/picker/help, promote reference refresh and align controls.
- [ ] Add explicit kind field and transactional correction with safe active-feature projection.
- [ ] Update affected test entry points; run related browser/storage/type/build/version checks and mobile screenshots.
- [ ] Review once, fix important findings, publish 0.9.42 to PR #21 and verify/deliver signed APK. Use CI native/package checks without repeating locally.
