# Brothers Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this cohesive task inline. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign potato and sweet-potato in Gomi's pencil medium, connect expressive artwork to existing interactions, show multiple motions, and commit the verified change.

**Architecture:** Add two non-destructive transparent sprite atlases with a small pure frame-selection module and a dedicated React visual. Retain the existing interaction/persistence services, all character IDs, and legacy growth assets. Update only the brothers' persona and dialogue content.

**Tech Stack:** React, TypeScript, Motion, PNG, Node test runner, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-15-brothers-redesign-design.md`

## Global Constraints

- Base: final at c29f7e6b0c0579467b042b4db9f7cc11c4593939.
- Preserve Gomi, other characters, original artwork, saved names/affection/growth/main selection, DB and signing.
- No new dependency, model retraining, ZIP, APK build, or production preview menu.
- Reduced motion uses meaningful still poses; paused/background/unmounted visuals stop frame timers.

## Review Focus

- Repeated/replaced reactions must not leave stale frame timers or restore the wrong pose.
- Sleeping and sad poses must remain semantically correct in reduced motion.
- Atlas failure must keep the old portrait visible and never hide the character.
- Existing help and offline interaction lines must retain the brothers' personalities.
- Home, book, and growth events must preserve stored character state and fit mobile screens.

---

### Task 1: Redesign and integrate the brothers

**Files:**
- Add: `public/characters/brothers-v2/*.png`, `src/features/characters/brothersArt.ts`, `src/features/characters/BrothersVisual.tsx`.
- Modify: `CharacterVisual.tsx`, `brothersMotion.ts`, `characters.css`, `data/characterDefinitions.json`; brother-specific dialogue consumers as necessary.
- Test: `tests/brothers-art.test.mjs`, `tests/characters.spec.ts`, existing companion unit tests.

**Interfaces:**
- Consumes: `CharacterVisualProps`, `CompanionMotion`, `BrotherSignature`, existing `reactionKey`, `paused`, `expression`.
- Produces: `brotherArtFrame(id, motion, expression, elapsedMs, reduced): number`, `brotherArtViewBox(frame, width, height): string`, `BrothersVisual` rendered with stable image identity and observable frame/pose state.

- [ ] Establish a clean local baseline with dependencies and relevant unit tests; capture current mobile views.
- [ ] Add meaningful failing tests for illustrated reaction/frame selection and clamped atlas bounds, plus browser frame/paused/reduced-motion behavior.
- [ ] Generate and inspect separate 12-pose transparent atlas assets using the existing Gomi PNG as the medium reference.
- [ ] Implement atlas rendering, frame timing and fallback with existing interaction inputs. Update the brothers' personality and context lines.
- [ ] Run the new and existing affected unit tests; verify all pass.
- [ ] Render mobile home/book/action flows and create a motion preview using the actual component. Verify frame changes and no additional persistence calls.
- [ ] Run type/build/version checks once for the completed change; review the whole diff.
- [ ] Commit the focused change and verify the resulting final commit and remote branch.

Expected: the two brothers use visibly different new poses/expressions, all affected checks pass, and all existing user-state contracts remain intact.
