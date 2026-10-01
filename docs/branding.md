# 그루터기 브랜드 적용

선택한 시안의 **그루터기 위에 걸터앉아 쉬는 소년**을 왼쪽 심볼로, `그루터기`를 오른쪽 실제 텍스트로 배치한다. 부제는 사용하지 않는다.

- `public/brand/geuruteogi-symbol.png`: 배경이 투명한 로고 심볼. 헤더와 웹 파비콘이 같은 원본을 사용한다.
- `src/App.tsx`, `src/brand.css`, `src/main.tsx`: 가로형 브랜드와 데스크톱/모바일 크기.
- `index.html`, `src-tauri/tauri.conf.json`: 웹 제목과 파비콘, 앱 표시 이름과 창 제목.
- `src-tauri/src/database.rs`, `src-tauri/src/lib.rs`, `src/features/people/PeopleView.tsx`: 사용자에게 보이는 앱 이름.

앱 식별자 `com.oraedameun.album`, Rust crate 이름, 저장 키와 기존 데이터 경로는 유지한다. 2026-10-01부터 Windows 패키징 workflow는 작업 브랜치 푸시마다 설치파일과 업데이트 파일을 모두 생성한다.

심볼은 선택한 시안에서 내장 이미지 생성 도구로 배경과 글자를 제거해 제작한 PNG이며 SVG 벡터 파일이 아니다. 글자는 이미지에 합치지 않아 화면에서 선명하게 표시하고 접근성 텍스트로 읽을 수 있다.

제작 프롬프트:

> Use case: background-extraction / precise-object-edit. Produce the production WEBSITE HEADER LOGO SYMBOL from the provided approved brand sheet. Extract and faithfully retain ONLY the large main boy sitting on the tree stump symbol from the upper center of this reference. Preserve the exact side-profile silhouette, boy facing right with legs dangling, the relaxed seated pose, the stump proportions, and the internal cutouts. Remove EVERY Korean letter, all bottom applications, background paper, shadows, outlines and all other objects. One standalone centered symbol on a genuinely TRANSPARENT background. The symbol must have one perfectly flat solid dark walnut color #624D3D, clean antialiased edges, no gradients or shading, no texture. Transparent negative spaces between arm and body, the stump top and in the tiny bark notch. Tightly fitted square artboard with about 5 percent transparent padding so the symbol is large and readable as a 48px website header mark. Output 512 by 512 if possible. This is an asset extraction, NOT a new logo redesign. No text anywhere, no mockup.
