# Code Cleanup and Optimization

## Scope (2026-09-24)

This pass preserves the existing UI, album ordering/layout seeds, Tauri command
contracts, SQLite schema, and browser storage keys. It does not claim that every
handler or render path has been optimized. Existing worktree changes were retained.

## Functional Boundaries

| Module | Responsibility |
| --- | --- |
| `src/App.tsx` | Navigation, library state, imports and cross-feature actions |
| `src/features/media/LibraryView.tsx` | Gallery controls, selection and date previews |
| `src/features/media/PhotoDetail.tsx` | Photo details, zoom and comment editing UI |
| `src/features/media/collectionModel.ts` | Pure search, sort, filter and anniversary selection |
| `src/features/media/mediaComments.ts` | Comment storage, validation and legacy captions |
| `src/features/calendar/calendarModel.ts` | Calendar cells, year bounds, indexed events and storage |
| `src/features/people/peopleModel.ts` | Face/person indexes and unique original media selection |
| `src/features/pets/petModel.ts` | Linked photos and library-order cover fallback |
| `src/features/memories/Memories.tsx` | Anniversary results UI |
| `src/features/settings/SettingsPanel.tsx` | Existing settings and clear-library controls |

`App.tsx` decreased from 1,146 to 588 non-trailing-blank lines. This is a separation
of responsibilities, not a claim that moving code alone improves runtime speed.

## Runtime Changes

- Reuse numeric/name `Intl.Collator` instances instead of constructing locale
  options at every sort comparison. Tests compare all six sort modes with the
  previous implementation, including undated records and tie ordering.
- Normalize search queries once; reuse the source array for an empty search.
- Memoize anniversary selection and remove its quadratic `filtered.includes` scan.
- Index faces by person and scanned IDs with `Map`/`Set`. Build these only when
  the face index changes, not for every displayed person or selection update.
- Memoize pet membership and covers, preserving the prior library-order fallback.
- Index exact-date and annual events once per update, retaining saved event order.
- Compute calendar year bounds without spreading the whole library into
  `Math.min`/`Math.max`; regression coverage includes 200,000 records.
- Reuse Windows extended-path normalization for face and pet inference.
- Share the Rust media row decoder. Album loading now uses two queries for any
  nonempty album collection (one for albums and one for all memberships), instead
  of one album query plus a query per album. Empty albums and sequence gaps remain
  valid; metadata comes from the current media table.
- Validate browser comment/event values on read so malformed entries do not crash
  the view. Loading does not rewrite the stored data.

## Removed Content

- Six obsolete album/background PNGs, one unused handwritten font and its license:
  15,845,742 bytes in total. Runtime references were checked before removal.
- Unused CSS selectors for the old day viewer, detail strip, timeline and sidebar
  decorations. Mixed selector rules retain the selectors used by current views.
- The old fixed-size `makeAlbumPages` implementation. Its tests now exercise the
  actual seeded `makeAlbumSpreads` implementation instead.

The current flat cover and thin white open-book images remain. Dynamic face/pet
models, generated model assets and all used package dependencies remain as well.
The legacy SQLite `cover_concept` migration remains for compatibility.

Measured `dist` size decreased from 63,700,505 to 54,480,022 bytes (about 9.2 MB).
The public assets previously copied into every build account for most of this.
This is a filesystem measurement, not an installer-size or startup-time benchmark.

## Verification

- `npm run test:unit`: 35 passed.
- `npm run build`: passed; existing large inference-chunk warnings remain.
- Full Playwright suite: 74 passed, 4 skipped under the existing conditions.
- `cargo test --locked --offline --features custom-protocol`: 17 passed.
- `cargo check --locked --offline`: passed for the development configuration.
- `python -m unittest discover -s tests -p test_album_storage.py`: 5 passed.
- Desktop and mobile screenshots inspected for album and photo-detail layout.

Before this pass the full Playwright suite had 58 passes, 16 failures and 4 skips.
Stale selectors and fixed page counts were updated to the current UI and seeded
variable album layouts. The face-analysis mock now returns a fresh serialized
snapshot like Tauri IPC, rather than mutating an object already owned by React.
Assertions still cover selection, persistence, comments, thumbnails, page-turn
timing, grouping, inference and export. No failing tests were deleted or skipped.

Native storage/export tests use temporary data. A packaged Windows app and the
user's real photo library were not exercised by this verification.

## Further Work

1. Extract the remaining import/comment mutation orchestration in `App.tsx` into
   focused hooks once their asynchronous state and persistence contracts are
   covered independently. Do not add `useCallback` or `memo` indiscriminately.
2. Separate calendar day/event dialogs from the calendar view; share event metadata
   without introducing circular imports. Their current behavior is covered by E2E.
3. Consolidate overlapping *live* styles only with before/after visual comparisons.
   A class-name search cannot prove that dynamically generated classes are unused.
4. Profile real large libraries before changing thumbnail scheduling, inference
   engines or virtualization. Their current lazy loading and inference queues
   were deliberately retained.
5. Consider moving Rust database/export commands into focused modules. This pass
   reduces a concrete repeated-query cost without changing the command surface.
