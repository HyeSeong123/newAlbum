# Code Cleanup and Optimization

## Scope (2026-09-24)

This pass preserves the existing UI, album ordering/layout seeds, Tauri command
contracts, SQLite schema, and browser storage keys. It does not claim that every
handler or render path has been optimized. Existing worktree changes were retained.

## Functional Boundaries

| Module | Responsibility |
| --- | --- |
| `src/App.tsx` | Navigation and cross-feature actions |
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

## State and Workflow Pass (2026-09-25)

This continuation keeps the layout, storage keys, database schema and Tauri command
names unchanged. It focuses on state ownership, asynchronous writes and failure
handling rather than adding memoization to every component.

| Module | Responsibility |
| --- | --- |
| `media/useMediaLibrary.ts` | Initial loads, import/remove operations, album persistence and owned object URLs |
| `media/browserImport.ts` | Supported browser imports, within-batch deduplication and retaining edits during refresh |
| `media/useMediaViewer.ts` | Active photo ID and navigation through the opened collection |
| `media/useMediaSelection.ts` | Selection mode, toggling and removal of missing IDs |
| `media/useMediaComments.ts` | Comment mutations, persistence and recoverable storage errors |
| `media/PhotoWorkspace.tsx` | Photo mode tabs, date navigation and album shortcuts |
| `calendar/useCalendarRecords.ts` | Notes, representative photos and event mutations |
| `calendar/DayDetailModal.tsx`, `calendar/CalendarEventModal.tsx` | Separate day-viewer and event-entry UI |
| `albums/useAlbumReader.ts` | Seeded order, spread navigation, timers and fullscreen state |
| `albums/AlbumReader.tsx`, `albums/AlbumEditor.tsx` | Reader and editing UI |
| `export/useMediaExport.ts` | Destination selection, copy execution, retries and duplicate-submit prevention |
| `services/keyedTaskQueue.ts` | Ordered writes per record with independent queues for unrelated records |
| `src-tauri/src/export.rs` | Original-file copying, destination validation and duplicate file names |

Feature paths in the table are relative to `src/features` unless otherwise noted.
Non-trailing-blank line counts: `App.tsx` 588 -> 253, `Calendar.tsx` 587 -> 229,
`AlbumsView.tsx` 295 -> 106, and `lib.rs` 959 -> 848. The extracted code remains in
focused modules; these reductions are not a bundle-size or speed benchmark.

### Behavior and Runtime Changes

- Delayed initial loads cannot overwrite a completed import or removal. Canceling
  an import does not invalidate the pending initial load.
- Album photos can be opened before the library finishes loading. Pending edits
  and view counts are merged into the eventual library result.
- The viewer reads the current media record by ID instead of maintaining a second
  selected-photo snapshot. Import refreshes retain local edits and fresh metadata.
- Writes to one media record are serialized, including view-count updates. A
  rejected write does not block later saves. Album mutations are also ordered.
- Browser imports reject duplicates before allocating object URLs. Partial failed
  batches, unregistered photos and unmounts release the URLs they own.
- Unchanged selections reuse their existing Set. Month filtering is memoized,
  album search normalizes the query once, and leaf layout metrics use one pass.
- Storage writes are no longer performed inside React state-updater callbacks.
  Comment/event failures keep the current input and allow retry; annual event
  changes preserve the original date bucket.
- The album reader keeps the existing seed and 230/620 ms turn phases. List view,
  scrubbing, media replacement and unmount cancel pending turn timers.
- Export and album save/delete handlers reject overlapping submissions. The
  export hook keeps folder/path input on failure and ignores results after unmount.

### Verification

- Unit tests: 45 passed (10 new mutation/queue/import/layout cases).
- Full Playwright suite: 90 passed, 4 existing conditional skips; 16 new desktop
  and mobile checks cover delayed loads, early album viewing, ordered writes,
  URL cleanup, storage retries and duplicate export submissions.
- Production build and TypeScript checks passed. Large inference-chunk warnings
  remain; this pass does not replace or retune the recognition engines.
- Rust custom-protocol tests: 17 passed. Development `cargo check` passed.
- SQLite storage tests: 5 passed. `git diff --check` passed.
- Album, photo detail and mobile day-viewer screenshots inspected.

No existing tests were removed or weakened. Native export tests use temporary
files; a packaged application and the user's real photo library were not tested.

## Fixed Two-Photo Album Layout (2026-09-25)

The current reader supersedes the seeded 1-3 photo layout described above. Each
spread contains one photo per leaf, with only the final odd photo left unpaired.
Reader input is deduplicated by media ID and exact original path without changing
saved albums. Pairing no longer depends on orientation or late metadata updates.

Removed the random layout seed and container-unit photo-size calculations. A
bounded grid reserves caption space and `object-fit: contain` preserves the full
image. Explicit shuffling, photo detail, list view and turn timing remain intact.

Verification: 46 unit tests and 92 Playwright tests passed, with 4 existing skips.
TypeScript and the production build passed. Desktop/mobile screenshots checked;
the running port 5173 server was reused, not replaced. No native code was changed
in this pass; the user's actual library and packaged app were not tested.

## Two-Sided Page Turn (2026-09-25)

- `albumAnimation.ts` owns the shared timing: 1100 ms total, 550 ms content swap,
  260 ms fade, and staggered 80/200 ms reveal delays after the swap.
- The temporary leaf carries the departing photo on its front and arriving photo
  on its back. Common visual/caption components keep both prints aligned with the
  stationary pages. The existing paper bitmap supplies the surface; shadows and
  highlights move with the turn.
- Decorative copies are inert and hidden from accessibility; real photo buttons
  are disabled during the turn. Scrubbing, closing, list switching and changing
  order cancel pending timers. Reduced motion remains immediate.
- The full Playwright suite passed 96 cases with 4 existing skips. Animation tests
  additionally inspect both faces, timing boundaries, interrupted turns and page
  alignment in desktop/mobile and short/wide windows. No native code changed.

## Two Photos Per Leaf (2026-09-25)

- Fixed groups of four preserve saved order, with two photos on each physical
  leaf. The final spread uses only remaining photos without duplication.
- `albumLeafLayout` chooses stacked landscape pairs or side-by-side pairs when
  portrait/square metadata is present. Stationary and turning faces share this
  layout, caption rendering and uncropped `object-fit: contain` images.
- The opposite leaf retains its old photos until 1050 ms, then fades in over
  320 ms. The first side still swaps at 550 ms. Sheet motion lasts 1100 ms;
  the transition and input lock last 1400 ms, including the final reveal.
- Verification: 48 unit tests, 96 Playwright passes and 4 existing skips;
  TypeScript and production build passed. Desktop/mobile screenshots checked.
  Existing port 5173 server reused; native user-library testing not included.

## Further Work

1. Consolidate overlapping *live* styles only with before/after visual comparisons.
   A class-name search cannot prove that dynamically generated classes are unused.
2. Profile real large libraries before changing thumbnail scheduling, inference
   engines or virtualization. Their current lazy loading and inference queues
   were deliberately retained.
3. Separate the remaining Rust database command implementations if that simplifies
   ownership and testing. Export is now independent; database commands retain the
   existing transactions and migration behavior.
