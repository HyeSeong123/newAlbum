# Tauri Phase 1 Boundary

Rust/Cargo is not installed in this environment, so the desktop shell cannot be compiled here yet. The Tauri command layer is now scaffolded and wired to the React adapter.

## Commands

- `register_paths(paths: Vec<String>)`
- `list_media()`
- `update_media_details(id, rating, comment, favorite)`

## Current Behavior

- File and folder paths come from the Tauri dialog plugin.
- Folders are searched recursively with `walkdir`.
- Supported media paths are inserted into SQLite.
- Duplicate paths are updated rather than inserted twice.
- Date is currently derived from file modified date until EXIF/FFmpeg extraction is added.

## Local-only rule

The app should never mutate source files. Tauri commands read files, extract metadata, create thumbnails under the cache directory, and persist internal data in SQLite only.
