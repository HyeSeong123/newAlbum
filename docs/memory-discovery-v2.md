# 추억 지도 v2와 기록 연결

## 사용 흐름

- 주 메뉴 **추억** → **다시 만난 추억 / 우리의 기록 / 추억 지도**.
- 사진·영상 상세보기의 **위치**에서 17개 시·도를 지정하거나 변경한다.
- 지도 지역 또는 **지역 미분류** → **선택** → 여러 기록의 **지역 지정**.
- 지도 목록은 종류(전체/사진/영상), 연도, 최신순/오래된순을 조합한다.
- **앨범 만들기**는 기존 생성 모달을 연다. 48개 이하의 필터 결과는 모두 전달하며, 그보다 많으면 선택 모드로 안내한다. 선택은 페이지를 넘겨도 유지되고 필터/지역을 바꾸면 초기화된다.
- 앨범 순서는 선택한 클릭 순서가 아니라 현재 목록의 날짜 정렬 순서다. 같은 날짜는 ID로 정렬하고 날짜 없는 기록은 마지막에 둔다.
- 저장 후 **내 앨범**으로 이동한다. 기존 앨범 수정, 챕터, 글 페이지, 책 보기을 그대로 사용한다.

## 저장과 호환성

`PRAGMA user_version` 2는 `media.location_source TEXT NOT NULL DEFAULT 'gps'`를 추가한다. 기존 버전 0과 1을 순서대로 마이그레이션하며 트랜잭션 안에서 버전을 올린다. 현재 버전 DB를 다시 열 때는 스키마 쓰기를 하지 않는다.

수동 지정은 `region_code`, `region_name`, `location_status='ready'`, `location_source='manual'`만 갱신한다. 원본 EXIF와 저장된 위도/경도는 유지한다. 일괄 저장은 모든 ID를 검증해 원자적으로 처리한다. GPS 분석의 조회·갱신, 실패 재시도, 파일 재등록 모두 수동 값을 보호한다.

기존 앨범 관계와 콘텐츠 순서는 변경하지 않는다. 미디어 DTO의 새 필드는 일반 목록과 앨범 목록 양쪽에 포함되며 기존 브라우저 fixture의 필드 누락도 처리한다.

## 성능과 구성

- 지도 진입은 DB 집계만 사용하며 EXIF 분석을 시작하지 않는다.
- `region_media_page`는 선택 지역의 필터 결과 수, 연도, 최대 48개 메타데이터를 같은 읽기 트랜잭션으로 조회한다. 원본 파일 I/O는 없다.
- 사용자가 위치 분석을 누르면 미처리 항목을 24개씩 분석한다.
- 지도 SVG는 지연 로딩하고, 가벼운 지역 상수는 상세보기에서도 재사용한다.
- `RegionEditor`, `RegionGallery`, `MemoriesWorkspace`로 화면 책임을 나누고 기존 `RecordMediaGrid`, `useMediaSelection`, `TimelineView`, `DetailModal`, `AlbumCreateModal`을 재사용한다.

## 여행 후보

**추억 → 다시 만난 추억** 아래에 날짜와 지역이 이어지는 여행 후보를 표시한다. `tripModel.ts`의 순수 모델은 이미 로드된 메타데이터만 사용한다. 같은 지역이어도 중간에 다른 지역이나 미분류 기록이 있으면 별도 방문으로 나눈다. 날짜가 잘못되었거나 없는 기록과 음성 파일은 제외한다.

기준은 `TRIP_MAX_DAY_GAP=3`, `TRIP_MIN_MEDIA=3`, `TRIP_MIN_DAYS=2`, `TRIP_SINGLE_DAY_MIN_MEDIA=10`이다. 최소 3개 기록이 있고, 서로 다른 촬영일이 2일 이상이거나 하루에 10개 이상일 때 후보가 된다. 날짜 경계는 촬영 기록의 현지 날짜를 유지한다. 다른 지역의 이동 기록을 검색 필터로 감춰 잘못 합치지 않도록 발견 모델에는 전체 메타데이터를 전달한다.

대표사진 선택은 별도 함수로 분리하고, 시간순 첫 사진(없으면 첫 영상)을 사용한다. 후보 카드는 12개씩, 상세 목록은 기존 그리드에서 48개씩 보여준다. **기록 보기**는 기존 상세보기로 이어지고, **앨범 만들기**는 시간순 기록과 수정 가능한 추천 제목을 기존 앨범 생성 모달에 전달한다. 사용자가 저장하기 전에는 DB에 앨범을 생성하지 않는다. 외부 API, AI, 위치 추적을 사용하지 않는다.

## 소스 검증

```sh
npm run build
npm run test:unit
npx playwright test tests/memory-map.spec.ts tests/memory-map-v2.spec.ts tests/trip-discovery.spec.ts
python3 -m unittest discover -s tests -p test_album_storage.py
cargo test --manifest-path src-tauri/Cargo.toml --lib --locked -j 2
```

Rust와 Playwright를 포함한 GitHub Actions 검증은 Linux에서만 수행한다. Windows 실행파일 생성, 패키징, 설치파일 테스트 및 바이너리 업로드는 수행하지 않는다.
