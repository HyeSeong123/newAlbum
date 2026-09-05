# Media Registration Flow

1. Accept files from file picker or recursive folder picker.
2. Filter supported extensions: jpg, jpeg, png, webp, heic, mp4, mov, avi, mkv, webm, mp3, wav, flac, m4a.
3. Check duplicate by normalized path first, then optional hash for moved files.
4. Extract metadata with ExifTool and FFmpeg without writing to the original file.
5. Resolve taken date by EXIF DateTimeOriginal, video metadata, other metadata, file modified date, then null.
6. Generate thumbnails/previews into the configured cache directory.
7. Insert or update SQLite rows inside a transaction.
8. Return import results and per-file warnings to the UI.
