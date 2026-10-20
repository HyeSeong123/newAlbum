# 변경·커밋 추적

선행 e9ac2a4·292eb19 두 커밋을 보존했다. 아래는 실제 원격 SHA다. 이 문서를 갱신하는 마지막 docs 커밋은 PR 최신 목록에 추가된다.

```text
e9ac2a40d35ade96985169678000e59bd24131fe test: cover mobile long-press drag selection without breaking touch scroll
292eb19c11808c8defa7e00d2c10dde9494dbf85 test: cover mobile long-press drag selection without breaking touch scroll
f5cee606def6db32e2302240e635639eee6e0699 fix: unify photo gestures and dialog focus, recover invalid analysis responses
a43ac872b1dda0da0cb646a795c207aeb3d906a3 refactor: consolidate portalled menu styles and remove unused album list
bf2fdfffe778f469655d601cead70c590298e9ec test: restore full workflow coverage and capture six responsive viewports
babe008351bf05917775390bb5918e1e84247fff test: make dataset path escape regression portable on Windows
3c87ffd3028a382b452d56e17febcba4777f58c6 fix: preserve integrity-checked cat cascade bytes on Windows
ac5ff4e59920bbd18e12ac4bf9f1041f3cd713cb ci: verify Windows packaging after checkout attributes change
66524eeaafd0173e55f099b67126f0b73c80086e fix: pin all hashed release inventory files to LF checkouts
f9a0931cb2cada2a5197284a1ea26fbc52ce02c5 docs: record full audit evidence and conditional release assessment
```

```text
A	.gitattributes
M	.github/workflows/android-preview.yml
M	.github/workflows/source-validation.yml
M	.github/workflows/windows-preview.yml
A	docs/audit-0.9.11/.gitignore
A	docs/audit-0.9.11/01-functions.md
A	docs/audit-0.9.11/02-unused-code.md
A	docs/audit-0.9.11/03-common-components.md
A	docs/audit-0.9.11/04-css.md
A	docs/audit-0.9.11/05-ui-ux.md
A	docs/audit-0.9.11/06-performance.md
A	docs/audit-0.9.11/07-pm.md
A	docs/audit-0.9.11/README.md
A	docs/audit-0.9.11/architecture.md
A	docs/audit-0.9.11/changes.md
A	docs/audit-0.9.11/evidence/android/gallery-smoke.json
A	docs/audit-0.9.11/evidence/android/person-repetition-smoke.json
A	docs/audit-0.9.11/evidence/android/person-runtime-smoke.json
A	docs/audit-0.9.11/evidence/android/person-security-smoke.json
A	docs/audit-0.9.11/evidence/android/pet-cat-face-smoke.json
A	docs/audit-0.9.11/evidence/android/pet-recognition-smoke.json
A	docs/audit-0.9.11/evidence/android/pet-runtime-benchmark.json
A	docs/audit-0.9.11/evidence/baseline-full.json
A	docs/audit-0.9.11/evidence/ci-status.json
A	docs/audit-0.9.11/evidence/deleted-css.json
A	docs/audit-0.9.11/evidence/gamjassak-baseline-build.txt
A	docs/audit-0.9.11/evidence/gamjassak-baseline-bundles.json
A	docs/audit-0.9.11/evidence/gamjassak-baseline-python.txt
A	docs/audit-0.9.11/evidence/gamjassak-baseline-unit.txt
A	docs/audit-0.9.11/evidence/gamjassak-baseline-version.txt
A	docs/audit-0.9.11/evidence/gamjassak-final-ai-release.txt
A	docs/audit-0.9.11/evidence/gamjassak-final-browser.json
A	docs/audit-0.9.11/evidence/gamjassak-final-build.txt
A	docs/audit-0.9.11/evidence/gamjassak-final-bundles.json
A	docs/audit-0.9.11/evidence/gamjassak-final-python.txt
A	docs/audit-0.9.11/evidence/gamjassak-final-unit-portable.txt
A	docs/audit-0.9.11/evidence/gamjassak-final-unit.txt
A	docs/audit-0.9.11/evidence/gamjassak-final-version.txt
A	docs/audit-0.9.11/evidence/gamjassak-menu-before.json
A	docs/audit-0.9.11/evidence/gamjassak-visual-after-restored.json
A	docs/audit-0.9.11/evidence/gamjassak-visual-before-restored.json
A	docs/audit-0.9.11/evidence/gamjassak-visual-before.json
A	docs/audit-0.9.11/evidence/inventory/gamjassak-css-inventory.json
A	docs/audit-0.9.11/evidence/inventory/gamjassak-module-graph.json
A	docs/audit-0.9.11/evidence/inventory/gamjassak-native-contracts.json
A	docs/audit-0.9.11/evidence/reproductions-before.json
A	docs/audit-0.9.11/evidence/visual-comparison.json
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

실제 삭제 함수 AlbumContentsList1개, 삭제 파일2개. 신규공통컴포넌트0개, 신규Hook useDialogFocus1개. 삭제/통합 CSS31개 규칙과 옛 전용선택자는 evidence/deleted-css.json에 기록한다. PNG원본은 제출 ZIP·CI artifact에 보관하며 저장소에는 보고서와 검사결과를 남긴다.
