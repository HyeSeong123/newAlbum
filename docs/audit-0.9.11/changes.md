# 변경·커밋 추적

원격 target의 선행2커밋을 보존했다. 이 문서 생성 커밋은 PR의 최신 commit 목록을 참조한다.

```text
e9ac2a40d35ade96985169678000e59bd24131fe test: cover mobile long-press drag selection without breaking touch scroll
292eb19c11808c8defa7e00d2c10dde9494dbf85 test: cover mobile long-press drag selection without breaking touch scroll
f5cee606def6db32e2302240e635639eee6e0699 fix: unify photo gestures and dialog focus, recover invalid analysis responses
a43ac872b1dda0da0cb646a795c207aeb3d906a3 refactor: consolidate portalled menu styles and remove unused album list
bf2fdfffe778f469655d601cead70c590298e9ec test: restore full workflow coverage and capture six responsive viewports
babe008351bf05917775390bb5918e1e84247fff test: make dataset path escape regression portable on Windows
3c87ffd3028a382b452d56e17febcba4777f58c6 fix: preserve integrity-checked cat cascade bytes on Windows
ac5ff4e59920bbd18e12ac4bf9f1041f3cd713cb ci: verify Windows packaging after checkout attributes change
5ad4234c29b462f5714e221d81a593f1d0450f62 fix: pin all hashed release inventory files to LF checkouts
```

수정·추가·삭제(보고서 생성 직전):

```text
A	.gitattributes
M	.github/workflows/android-preview.yml
M	.github/workflows/source-validation.yml
M	.github/workflows/windows-preview.yml
M	src/components/ActionMenu.tsx
M	src/components/EntityEditorDialog.tsx
A	src/components/action-menu.css
M	src/controls.css
M	src/design-system.css
D	src/features/albums/AlbumContentsList.tsx
M	src/features/albums/AlbumCreateModal.tsx
M	src/features/albums/AlbumEditor.tsx
D	src/features/albums/album-contents-list.css
M	src/features/albums/album-library.css
M	src/features/albums/albums.css
M	src/features/albums/chapter/AlbumWrittenEditor.tsx
M	src/features/diary/DiaryView.tsx
M	src/features/diary/diary.css
M	src/features/media/MediaImportModal.tsx
M	src/features/people/engine/sourceAudit.ts
M	src/hooks/useAndroidBack.ts
A	src/hooks/useDialogFocus.ts
M	src/hooks/useRowSelection.ts
M	src/mobile-controls.css
M	tests/app.spec.ts
A	tests/audit-fixture.ts
A	tests/audit-regression.spec.ts
A	tests/audit-visual.spec.ts
M	tests/journal-preview.spec.ts
M	tests/mobile-layout.spec.ts
M	tests/mobile-polish.spec.ts
M	tests/native-ai.test.mjs
M	tests/onboarding-empty.spec.ts
M	tests/photo-date-navigation.spec.ts
M	tests/photo-list-ratios.spec.ts
M	tests/usability-recovery.spec.ts
```

보고서·증빙은 docs/audit-0.9.11에 추가한다. 삭제함수는 AlbumContentsList 하나다. 신규공통컴포넌트0개, 신규Hook useDialogFocus1개. CSS의 정확한 삭제/통합 selector는 evidence/deleted-css.json을 참조한다.
