# Phase 1 Architecture

## Directory Structure

- `src/components`: shared visual components.
- `src/pages`: top-level route/view composition.
- `src/features/media`: media domain data, filters, and registration UI logic.
- `src/features/library`: timeline, gallery, calendar, and viewer workflows.
- `src/services`: future Tauri command adapters.
- `src/hooks`: reusable React state hooks.
- `src/types`: stable TypeScript contracts.
- `src-tauri/commands`: command entry points exposed to React.
- `src-tauri/database`: SQLite schema and migrations.
- `src-tauri/media`: metadata extraction and thumbnail generation flow.
- `src-tauri/filesystem`: read-only file discovery and path normalization.

## Design Rules Extracted

- Put the working library UI in the first viewport; avoid a marketing landing page.
- Keep original-file safety visible near registration controls.
- Use warm paper texture as atmosphere, but keep controls quiet and work-focused.
- Use 8px radii, stable grids, and fixed aspect ratios for thumbnails and calendar cells.
- Make clickable elements explicit with icon plus text for primary commands and icon-only buttons with titles for viewer navigation.
- Preserve mobile workflows by turning the sidebar into a horizontal nav and stacking the inspector below the gallery.

## Visual QA

- Initial mobile screenshot showed horizontal overflow and unreliable nav clicks. The fix changed the mobile nav to a wrapped grid, removed sticky overlap, hid horizontal overflow, and allowed long Korean copy to wrap.
- Initial desktop screenshot pushed viewer controls too low. The fix reduced the viewer preview ratio so rating and comment controls appear in the first desktop viewport.
- Variant A uses the calmer sage safety tone for a utility-first feel.
- Variant B uses a warmer brown album tone for a more nostalgic feel while preserving the same layout and interaction model.

## Verification

- `npm run build`
- `npm run test:e2e`
- Screenshots: `screenshots/desktop.png`, `screenshots/mobile.png`

## Image Asset Prompt

Built-in imagegen was used to create `public/assets/korean-memory-bg.png`.

Prompt summary: Korean hanji paper album background, old photo edges, pressed wildflower, restrained warm light, no text, no logos, no western scrapbook visual cues.
